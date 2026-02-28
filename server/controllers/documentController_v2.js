"use strict";
const fs       = require("fs");
const crypto   = require("crypto");
const Document = require("../models/Document");
const AuditLog = require("../models/AuditLog");
const User     = require("../models/User");
const emailSvc = require("../services/emailService");
const smsSvc   = require("../services/smsService");

let _blockchain, _signer;
exports.init = (bc, signer) => { _blockchain = bc; _signer = signer; };

function sha256File(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ════════════════════════════════════════
// POST /documents/upload
// ════════════════════════════════════════
exports.upload = async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer   = fs.readFileSync(filePath);
    const fileHash = sha256File(buffer);

    const dup = await Document.findOne({ fileHash });
    if (dup) {
      fs.unlinkSync(filePath);
      return res.status(409).json({ message: "This file already exists on the blockchain", blockIndex: dup.blockIndex });
    }

    const { title, docType, description, department, semester, academicYear, rollNumber, studentEmail } = req.body;
    if (!title || !docType) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: "title and docType are required" });
    }

    const { signature, publicKey } = _signer(fileHash);

    const newBlock = await _blockchain.addBlock({
      fileName:   req.file.originalname,
      fileHash,
      fileSize:   req.file.size,
      mimeType:   req.file.mimetype,
      uploadedBy: req.user.name,
      uploadedAt: new Date().toISOString(),
      title, docType, department, semester, academicYear, rollNumber,
    }, signature, publicKey);

    // Find student
    let studentRef = null;
    if (studentEmail) {
      const st = await User.findOne({ email: studentEmail.toLowerCase() });
      if (st) studentRef = st._id;
    } else if (rollNumber) {
      const st = await User.findOne({ studentId: rollNumber });
      if (st) studentRef = st._id;
    }

    const doc = await Document.create({
      blockIndex:  newBlock.index,
      blockHash:   newBlock.hash,
      title, docType, description,
      fileName:    req.file.originalname,
      fileHash, fileSize: req.file.size, mimeType: req.file.mimetype,
      department, semester, academicYear, rollNumber,
      uploadedBy:  req.user.userId,
      studentRef,
      signature, publicKey, signatureValid: true,
      status: "ACTIVE",
    });

    await AuditLog.create({
      userId: req.user.userId, username: req.user.name, role: req.user.role,
      action: "UPLOAD",
      fileName: req.file.originalname, fileHash, docType, department,
      blockIndex: newBlock.index, ipAddress: req.ip,
    });

    // ── Notify student via EMAIL + SMS ──
    if (studentRef) {
      const student = await User.findById(studentRef);
      if (student) {
        emailSvc.sendDocumentUploadedEmail(student, doc, req.user.name).catch(() => {});
        smsSvc.sendDocumentUploadedSMS(student, doc).catch(() => {});
      }
    }

    fs.unlinkSync(filePath);

    res.status(201).json({
      message:        "Document uploaded and signed on blockchain",
      fileHash,
      blockIndex:     newBlock.index,
      blockHash:      newBlock.hash,
      signatureValid: true,
      document:       doc,
    });
  } catch (err) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error("upload:", err);
    res.status(500).json({ message: "Upload failed: " + err.message });
  }
};

// ════════════════════════════════════════
// POST /documents/verify
// ════════════════════════════════════════
exports.verify = async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer   = fs.readFileSync(filePath);
    const fileHash = sha256File(buffer);
    fs.unlinkSync(filePath);

    const doc = await Document.findOne({ fileHash })
      .populate("uploadedBy", "name role email department")
      .populate("studentRef", "name email phone studentId department");

    if (!doc) {
      await AuditLog.create({
        userId: req.user.userId, username: req.user.name, role: req.user.role,
        action: "VERIFY_FAIL", fileHash, ipAddress: req.ip,
        details: "File not found on blockchain",
      });
      return res.json({ status: "NOT_FOUND", message: "File not found on blockchain", fileHash });
    }

    const chainBlock    = _blockchain.chain.find(b => b.data?.fileHash === fileHash);
    const signatureValid = chainBlock ? _blockchain.verifyBlockSignature(chainBlock) : doc.signatureValid;

    // Notify student: email + SMS
    if (doc.studentRef) {
      emailSvc.sendVerificationEmail(doc.studentRef, doc, req.user.name).catch(() => {});
      smsSvc.sendVerificationSMS(doc.studentRef, doc).catch(() => {});
    }

    await AuditLog.create({
      userId: req.user.userId, username: req.user.name, role: req.user.role,
      action: "VERIFY", fileName: doc.fileName, fileHash, docType: doc.docType,
      blockIndex: doc.blockIndex, ipAddress: req.ip,
    });

    res.json({
      status: "VERIFIED",
      message: "File verified on blockchain",
      fileHash, signatureValid,
      document: doc,
      blockIndex: doc.blockIndex,
      blockHash:  doc.blockHash,
    });
  } catch (err) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ message: "Verification failed" });
  }
};

// ════════════════════════════════════════
// GET /documents  (filtered by role)
// ════════════════════════════════════════
exports.listDocuments = async (req, res) => {
  try {
    const me   = req.user;
    const self = await User.findById(me.userId);
    let filter = {};

    if (me.role === "SUPER_ADMIN" || me.role === "ADMIN") {
      filter = {};
    } else if (me.role === "HOD") {
      filter = { department: self.department };
    } else if (me.role === "FACULTY") {
      filter = { uploadedBy: self._id };
    } else if (me.role === "STUDENT") {
      filter = { $or: [{ studentRef: self._id }, { rollNumber: self.studentId }] };
    }

    if (req.query.docType)    filter.docType    = req.query.docType;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status)     filter.status     = req.query.status;

    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      Document.find(filter)
        .populate("uploadedBy", "name role email")
        .populate("studentRef", "name email studentId")
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit),
      Document.countDocuments(filter),
    ]);

    res.json({ documents: docs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /documents/stats
// ════════════════════════════════════════
exports.documentStats = async (req, res) => {
  try {
    const me   = req.user;
    const self = await User.findById(me.userId);
    let matchFilter = {};
    if (me.role === "HOD") matchFilter = { department: self.department };
    else if (me.role === "FACULTY") matchFilter = { uploadedBy: self._id };
    else if (me.role === "STUDENT") matchFilter = { $or: [{ studentRef: self._id }] };

    const [total, byType, byDept] = await Promise.all([
      Document.countDocuments(matchFilter),
      Document.aggregate([{ $match: matchFilter }, { $group: { _id: "$docType", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Document.aggregate([{ $match: matchFilter }, { $group: { _id: "$department", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    res.json({ total, byType, byDept });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /documents/:id
// ════════════════════════════════════════
exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate("uploadedBy", "name role email department")
      .populate("studentRef", "name email studentId department phone")
      .populate("revokedBy", "name role");
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const chainBlock = _blockchain.chain.find(b => b.data?.fileHash === doc.fileHash);
    res.json({ document: doc, chainBlock: chainBlock || null });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// PUT /documents/:id/revoke
// ════════════════════════════════════════
exports.revokeDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (doc.status === "REVOKED") return res.status(400).json({ message: "Already revoked" });

    doc.status      = "REVOKED";
    doc.revokedBy   = req.user.userId;
    doc.revokedAt   = new Date();
    doc.revokeReason = req.body.reason || "No reason given";
    await doc.save();

    await AuditLog.create({
      userId: req.user.userId, username: req.user.name, role: req.user.role,
      action: "REVOKE", fileName: doc.fileName, fileHash: doc.fileHash,
      blockIndex: doc.blockIndex, ipAddress: req.ip,
      details: `Revoked: ${doc.revokeReason}`,
    });

    res.json({ message: "Document revoked", document: doc });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};