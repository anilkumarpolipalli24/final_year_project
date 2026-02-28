"use strict";
const Document   = require("../models/Document");
const AuditLog   = require("../models/AuditLog");
const User       = require("../models/User");
const emailSvc   = require("../services/emailService");
const smsSvc     = require("../services/smsService");

let _blockchain, _network;
exports.init = (bc, net) => { _blockchain = bc; _network = net; };

// ════════════════════════════════════════
// GET /blockchain/chain  — full chain with DB data merged
// ════════════════════════════════════════
exports.getChain = async (req, res) => {
  try {
    const enriched = await Promise.all(_blockchain.chain.map(async (block) => {
      const b = {
        index:        block.index,
        hash:         block.hash,
        previousHash: block.previousHash,
        timestamp:    block.timestamp,
        data:         block.data,
        signature:    block.signature,
        publicKey:    block.publicKey,
        signatureValid: _blockchain.verifyBlockSignature ? _blockchain.verifyBlockSignature(block) : null,
      };
      if (block.data?.fileHash) {
        b.document = await Document.findOne({ fileHash: block.data.fileHash })
          .populate("uploadedBy", "name role email department")
          .populate("studentRef", "name email studentId");
      }
      return b;
    }));
    res.json({ chain: enriched, length: enriched.length });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/validate
// ════════════════════════════════════════
exports.validateChain = async (req, res) => {
  try {
    const result    = _blockchain.isChainValid();
    const isValid   = result === true || result?.valid === true;
    const tampered  = typeof result === "object" ? result.tamperedIndex : null;

    const signatureSummary = _blockchain.chain.map(block => ({
      index:          block.index,
      signatureValid: _blockchain.verifyBlockSignature ? _blockchain.verifyBlockSignature(block) : null,
      publicKey:      block.publicKey ? block.publicKey.slice(0, 20) + "…" : null,
    }));

    await AuditLog.create({
      userId: req.user.userId, username: req.user.name, role: req.user.role,
      action: "INTEGRITY_CHECK",
      details: isValid ? "Chain SECURE" : `TAMPER at block #${tampered}`,
      ipAddress: req.ip,
    });

    // If tampered — email + SMS to all admins
    if (!isValid) {
      const admins = await User.find({ role: { $in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true });
      const emails = admins.map(a => a.email).filter(Boolean);
      const phones = admins.map(a => a.phone).filter(Boolean);

      emailSvc.sendTamperAlert(emails, tampered, "Hash mismatch detected").catch(() => {});
      smsSvc.sendTamperAlertSMS(phones, tampered, "Hash mismatch").catch(() => {});

      await AuditLog.create({
        username: "SYSTEM", role: "SYSTEM",
        action: "TAMPER_DETECTED",
        blockIndex: tampered,
        details: `Hash mismatch at block #${tampered} — admin alerts sent`,
      });
    }

    res.json({
      status:          isValid ? "SECURE" : "TAMPERED",
      message:         isValid ? "All blocks verified ✔" : `Tamper detected at block #${tampered}`,
      ecdsaStatus:     signatureSummary.every(s => s.signatureValid !== false) ? "ALL_SIGNED" : "SIGNATURE_MISMATCH",
      signatureSummary,
      chainLength:     _blockchain.chain.length,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/stats  — dashboard
// ════════════════════════════════════════
exports.dashboardStats = async (req, res) => {
  try {
    const [totalDocs, totalVerifications, tamperAlerts, totalUsers, recentAudit, recentDocs, byDept, byType] = await Promise.all([
      Document.countDocuments({ status: "ACTIVE" }),
      AuditLog.countDocuments({ action: "VERIFY" }),
      AuditLog.countDocuments({ action: "TAMPER_DETECTED" }),
      User.countDocuments({ isActive: true }),
      AuditLog.find().sort({ timestamp: -1 }).limit(5).populate("userId", "name role"),
      Document.find({ status: "ACTIVE" }).populate("uploadedBy", "name role").sort({ createdAt: -1 }).limit(5),
      Document.aggregate([{ $group: { _id: "$department", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]),
      Document.aggregate([{ $group: { _id: "$docType", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    ]);

    const chainCheck  = _blockchain.isChainValid();
    const chainSecure = chainCheck === true || chainCheck?.valid === true;
    const peers       = _network?.getPeers ? _network.getPeers().length : 0;

    res.json({
      stats: {
        chainBlocks:   _blockchain.chain.length,
        recordsFiled:  totalDocs,
        verifications: totalVerifications,
        tamperAlerts,
        networkPeers:  peers,
        chainStatus:   chainSecure ? "SECURE" : "TAMPERED",
        totalUsers,
      },
      recentDocs, recentAudit, byDept, byType,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/block/:index
// ════════════════════════════════════════
exports.getBlock = async (req, res) => {
  try {
    const idx   = parseInt(req.params.index);
    const block = _blockchain.chain.find(b => b.index === idx);
    if (!block) return res.status(404).json({ message: "Block not found" });
    let document = null;
    if (block.data?.fileHash) {
      document = await Document.findOne({ fileHash: block.data.fileHash })
        .populate("uploadedBy", "name role email department")
        .populate("studentRef", "name email studentId department");
    }
    res.json({
      block: { ...block, signatureValid: _blockchain.verifyBlockSignature ? _blockchain.verifyBlockSignature(block) : null },
      document,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/tamper-alerts
// ════════════════════════════════════════
exports.tamperAlerts = async (req, res) => {
  try {
    const alerts = await AuditLog.find({ action: "TAMPER_DETECTED" }).sort({ timestamp: -1 }).limit(50);
    res.json({ alerts, total: alerts.length });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/audit-logs
// ════════════════════════════════════════
exports.auditLogs = async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip  = (page - 1) * limit;
    let filter = {};
    if (req.query.action)   filter.action   = req.query.action;
    if (req.query.username) filter.username = new RegExp(req.query.username, "i");
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).populate("userId", "name role email"),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════
// GET /blockchain/verifications  — for stat card click
// ════════════════════════════════════════
exports.verifications = async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find({ action: "VERIFY" }).sort({ timestamp: -1 }).skip(skip).limit(limit).populate("userId", "name role email"),
      AuditLog.countDocuments({ action: "VERIFY" }),
    ]);
    res.json({ verifications: logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};