"use strict";
// server/index.js  — REPLACE your existing index.js
require("dotenv").config();

const express   = require("express");
const multer    = require("multer");
const cors      = require("cors");
const fs        = require("fs");
const path      = require("path");
const mongoose  = require("mongoose");
const rateLimit = require("express-rate-limit");
const helmet    = require("helmet");

const { Blockchain, Block, generateKeyPair } = require("./blockchain");
const { buildMerkleRoot }  = require("./merkle");
const P2PNetwork           = require("./p2p");
const createPeerRouter     = require("./routers/peer");
const authRouter           = require("./routers/auth");

// ── Middleware ── (your project uses config/middleware/)
const authenticate = require("./config/middleware/authenticate");
const authorize    = require("./config/middleware/authorize");

// ── Models ──
const AuditLog   = require("./models/AuditLog");
const BlockModel = require("./models/BlockModel");
const Document   = require("./models/Document");   // ← NEW file you placed in models/
const User       = require("./models/User");        // ← Renamed from user.js

// ══════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════
const PORT      = parseInt(process.env.NODE_PORT || process.env.PORT || "5000");
const MY_URL    = process.env.MY_URL   || `http://localhost:${PORT}`;
const PEERS_ENV = process.env.PEERS    || "";
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing");
  process.exit(1);
}
const INITIAL_PEERS = PEERS_ENV.split(",").map(s => s.trim()).filter(Boolean);

// ── Express ──
const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1);

// ── Rate limiters ──
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 500 });
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 30 });
const uploadLimiter = rateLimit({ windowMs: 60*1000, max: 20 });
app.use(globalLimiter);

// ── Multer ──
const upload = multer({ dest: "uploads/", limits: { fileSize: 50*1024*1024 } });
const cleanupFile = fp => { if (fp && fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch {} } };
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ══════════════════════════════════════════════════
// NODE IDENTITY (ECDSA keypair)
// ══════════════════════════════════════════════════
const KEY_FILE = path.join(__dirname, `node_identity_${PORT}.json`);
function loadOrCreateIdentity() {
  if (fs.existsSync(KEY_FILE)) {
    const kp = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
    console.log(`🔑 Identity loaded · ${kp.publicKey.slice(0,24)}…`);
    return kp;
  }
  const kp = generateKeyPair();
  fs.writeFileSync(KEY_FILE, JSON.stringify(kp, null, 2));
  console.log(`🔑 New identity created · ${kp.publicKey.slice(0,24)}…`);
  return kp;
}
const nodeIdentity = loadOrCreateIdentity();

// ══════════════════════════════════════════════════
// BLOCKCHAIN
// ══════════════════════════════════════════════════
const myChain = new Blockchain(nodeIdentity.privateKey);

async function persistBlock(block) {
  await BlockModel.findOneAndUpdate(
    { index: block.index },
    { index: block.index, timestamp: block.timestamp, data: block.data,
      previousHash: block.previousHash, hash: block.hash,
      signature: block.signature || null, publicKey: block.publicKey || null,
      nonce: block.nonce || 0 },
    { upsert: true, new: true }
  );
}

async function bootChain() {
  const saved = await BlockModel.find().sort({ index: 1 });
  if (saved.length > 0) {
    myChain.loadFromObjects(saved);
    console.log(`⛓  Loaded ${myChain.chain.length} blocks from Atlas`);
  } else {
    myChain.initGenesis();
    await persistBlock(myChain.chain[0]);
    console.log("⛓  Genesis block created");
  }
}

// ══════════════════════════════════════════════════
// P2P NETWORK
// ══════════════════════════════════════════════════
const network = new P2PNetwork(MY_URL, myChain, persistBlock);

// ══════════════════════════════════════════════════
// ROUTES — mount auth + peer routers
// ══════════════════════════════════════════════════
app.use("/auth/login", authLimiter);
app.use("/", authRouter);
app.use("/", createPeerRouter(myChain, network, persistBlock, AuditLog));

// ── Health check ──
app.get("/health", (req, res) => res.json({
  status: "ok", port: PORT, myUrl: MY_URL,
  uptime:  process.uptime().toFixed(1) + "s",
  db:      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  blocks:  myChain.chain.length,
  peers:   network.getPeers().length,
  email:   !!process.env.EMAIL_PASS,
}));

// ── Node identity info ──
app.get("/nodeinfo", authenticate, (req, res) => res.json({
  publicKey:   nodeIdentity.publicKey,
  algorithm:   "ECDSA secp256k1",
  chainLength: myChain.chain.length,
  nodeId:      nodeIdentity.publicKey.slice(0,16) + "…",
  myUrl: MY_URL, port: PORT,
  uptime:      process.uptime().toFixed(1) + "s",
  nodeVersion: process.version,
}));

// ── Network status ──
app.get("/network", authenticate, (req, res) => res.json(network.getNetworkStatus()));

app.post("/network/add-peer", authenticate, authorize(["SUPER_ADMIN","ADMIN"]), async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: "url required" });
  network.addPeer(url);
  const ok = await network.registerWithPeer(url);
  await network.syncChain();
  res.json({ message: ok ? "Peer added & synced" : "Peer added (offline)", peers: network.getPeers() });
});

app.post("/network/sync", authenticate, authorize(["SUPER_ADMIN","ADMIN"]), async (req, res) => {
  await network.syncChain();
  res.json({ message: "Sync complete", length: myChain.chain.length });
});

// ══════════════════════════════════════════════════
// UPLOAD
// ══════════════════════════════════════════════════
app.post("/upload",
  authenticate,
  authorize(["SUPER_ADMIN","ADMIN","HOD","FACULTY"]),
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const raw  = fs.readFileSync(req.file.path);
      const hash = buildMerkleRoot([raw.toString("base64")]);

      const exists = myChain.chain.find(b => b.data?.fileHash === hash);
      if (exists) {
        return res.json({ message: "Already in blockchain", fileHash: hash, blockIndex: exists.index, duplicate: true });
      }

      const block = new Block(myChain.chain.length, Date.now().toString(), {
        fileName:    req.file.originalname,
        fileHash:    hash,
        fileSize:    req.file.size,
        mimeType:    req.file.mimetype,
        uploadedBy:  req.user.name || req.user.role,
        uploadedAt:  new Date().toISOString(),
        title:       req.body.title        || req.file.originalname,
        docType:     req.body.docType      || "Other",
        department:  req.body.department   || null,
        semester:    req.body.semester     || null,
        academicYear:req.body.academicYear || null,
        rollNumber:  req.body.rollNumber   || null,
      });

      myChain.addBlock(block);
      await persistBlock(block);
      await network.broadcastBlock(block);

      // Save rich document record (non-fatal if it fails)
      try {
        await Document.create({
          blockIndex:  block.index,
          blockHash:   block.hash,
          title:       req.body.title || req.file.originalname,
          docType:     req.body.docType || "Other",
          fileName:    req.file.originalname,
          fileHash:    hash,
          fileSize:    req.file.size,
          mimeType:    req.file.mimetype,
          department:  req.body.department   || null,
          semester:    req.body.semester     || null,
          academicYear:req.body.academicYear || null,
          rollNumber:  req.body.rollNumber   || null,
          uploadedBy:  req.user.userId || null,
          signatureValid: true,
          status: "ACTIVE",
        });
      } catch (docErr) {
        console.warn("⚠ Document record (non-fatal):", docErr.message);
      }

      await AuditLog.create({
        userId:    req.user.userId,
        username:  req.user.name  || req.user.userId,
        role:      req.user.role,
        action:    "UPLOAD",
        fileName:  req.file.originalname,
        fileHash:  hash,
        blockIndex: block.index,
        department: req.body.department || null,
        ipAddress:  req.ip,
      });

      res.json({
        message:    "Document filed on blockchain ✔",
        fileHash:   hash,
        blockIndex: block.index,
        signatureValid: block.isSignatureValid(),
        peersNotified:  network.getPeers().length,
      });
    } catch (err) {
      console.error("Upload:", err);
      res.status(500).json({ message: "Upload failed: " + err.message });
    } finally { cleanupFile(req.file?.path); }
  }
);

// ══════════════════════════════════════════════════
// VERIFY
// ══════════════════════════════════════════════════
app.post("/verify",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const raw   = fs.readFileSync(req.file.path);
      const hash  = buildMerkleRoot([raw.toString("base64")]);
      const block = myChain.chain.find(b => b.data?.fileHash === hash);

      let doc = null;
      try {
        doc = await Document.findOne({ fileHash: hash })
          .populate("uploadedBy", "name role email department");
      } catch {}

      await AuditLog.create({
        userId:    req.user.userId,
        username:  req.user.name || req.user.userId,
        role:      req.user.role,
        action:    block ? "VERIFY" : "VERIFY_FAIL",
        fileName:  req.file.originalname,
        fileHash:  hash,
        blockIndex: block?.index || null,
        ipAddress:  req.ip,
        details:   block ? "Verified OK" : "Not found on chain",
      });

      if (!block) return res.json({ status: "NOT_FOUND", message: "File NOT found on blockchain", fileHash: hash });

      res.json({
        status:  "VERIFIED",
        message: "File verified — integrity intact ✔",
        fileHash: hash,
        signatureValid: block.isSignatureValid(),
        blockIndex: block.index,
        blockHash:  block.hash,
        document:   doc || block.data,
      });
    } catch (err) {
      console.error("Verify:", err);
      res.status(500).json({ message: "Verification failed" });
    } finally { cleanupFile(req.file?.path); }
  }
);

// ══════════════════════════════════════════════════
// CHAIN & BLOCK QUERIES
// ══════════════════════════════════════════════════
app.get("/chain", authenticate, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const enriched = await Promise.all(myChain.chain.map(async b => {
    let doc = null;
    if (b.data?.fileHash) {
      try { doc = await Document.findOne({ fileHash: b.data.fileHash }).populate("uploadedBy", "name role email").lean(); } catch {}
    }
    return { ...b, signatureValid: b.index === 0 ? true : b.isSignatureValid(), document: doc };
  }));
  res.json({ length: myChain.chain.length, chain: enriched });
});

app.get("/chain/:index", authenticate, async (req, res) => {
  const idx   = parseInt(req.params.index);
  const block = myChain.chain.find(b => b.index === idx);
  if (!block) return res.status(404).json({ message: "Block not found" });
  let doc = null;
  if (block.data?.fileHash) {
    try { doc = await Document.findOne({ fileHash: block.data.fileHash }).populate("uploadedBy", "name role email department").lean(); } catch {}
  }
  res.json({ block: { ...block, signatureValid: block.index === 0 ? true : block.isSignatureValid() }, document: doc });
});

app.get("/validateChain", authenticate, async (req, res) => {
  const valid     = myChain.isChainValid();
  const sig       = myChain.getSignatureSummary();
  const allSigned = sig.every(s => s.signatureValid);
  if (!valid) {
    await AuditLog.create({ username: "SYSTEM", role: "SYSTEM", action: "TAMPER_DETECTED", details: "Hash mismatch" }).catch(() => {});
  }
  res.json({
    status:      valid ? "SECURE" : "TAMPERED",
    message:     valid ? "All hashes & ECDSA signatures verified ✔" : "⚠ Integrity failure — tamper detected",
    ecdsaStatus: allSigned ? "ALL_SIGNED" : "SIGNATURE_INVALID",
    totalBlocks: myChain.chain.length,
    signatureSummary: sig,
  });
});

// ══════════════════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════════════════
app.get("/documents", authenticate, async (req, res) => {
  try {
    const me   = req.user;
    let filter = {};
    if (me.role === "HOD") {
      const self = await User.findById(me.userId).catch(() => null);
      filter = { department: self?.department };
    } else if (me.role === "FACULTY") {
      const self = await User.findById(me.userId).catch(() => null);
      filter = { uploadedBy: self?._id };
    } else if (me.role === "STUDENT") {
      const self = await User.findById(me.userId).catch(() => null);
      filter = { $or: [{ rollNumber: self?.studentId }, { uploadedBy: self?._id }] };
    }
    if (req.query.docType)    filter.docType    = req.query.docType;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status)     filter.status     = req.query.status;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [docs, total] = await Promise.all([
      Document.find(filter).populate("uploadedBy", "name role email").sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Document.countDocuments(filter),
    ]);
    res.json({ documents: docs, total, page, pages: Math.ceil(total/limit) });
  } catch(err) { res.status(500).json({ message: "Server error: " + err.message }); }
});

// ══════════════════════════════════════════════════
// VERIFICATIONS LOG
// ══════════════════════════════════════════════════
app.get("/verifications", authenticate, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [logs, total] = await Promise.all([
      AuditLog.find({ action: "VERIFY" }).sort({ timestamp: -1 }).skip((page-1)*limit).limit(limit),
      AuditLog.countDocuments({ action: "VERIFY" }),
    ]);
    res.json({ verifications: logs, total, page });
  } catch(err) { res.status(500).json({ message: "Server error" }); }
});

// ── Tamper alerts ──
app.get("/tamper-alerts", authenticate, async (req, res) => {
  try {
    const alerts = await AuditLog.find({ action: "TAMPER_DETECTED" }).sort({ timestamp: -1 }).limit(50);
    res.json({ alerts, total: alerts.length });
  } catch(err) { res.status(500).json({ message: "Server error" }); }
});

// ── Audit logs ──
app.get("/auditlogs", authenticate, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    let filter  = {};
    if (req.query.action)   filter.action   = req.query.action;
    if (req.query.username) filter.username = new RegExp(req.query.username, "i");
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip((page-1)*limit).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page, totalPages: Math.ceil(total/limit) });
  } catch { res.status(500).json({ message: "Failed" }); }
});

// ══════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════
app.get("/stats", authenticate, async (req, res) => {
  try {
    const [tu, tv, tc, ra] = await Promise.all([
      AuditLog.countDocuments({ action: "UPLOAD" }),
      AuditLog.countDocuments({ action: "VERIFY" }),
      AuditLog.countDocuments({ action: "TAMPER_DETECTED" }),
      AuditLog.find().sort({ timestamp: -1 }).limit(5),
    ]);
    let recentDocs = [];
    try { recentDocs = await Document.find().populate("uploadedBy","name role").sort({ createdAt:-1 }).limit(5); } catch {}
    res.json({
      chainBlocks:    myChain.chain.length,
      recordsFiled:   tu,
      totalVerify:    tv,
      tamperCount:    tc,
      chainStatus:    myChain.isChainValid() ? "SECURE" : "TAMPERED",
      peerCount:      network.getPeers().length,
      recentActivity: ra,
      recentDocs,
    });
  } catch(err) { res.status(500).json({ message: "Failed: " + err.message }); }
});

// ══════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════
app.get("/users", authenticate, authorize(["SUPER_ADMIN","ADMIN","HOD","FACULTY"]), async (req, res) => {
  try {
    const me = req.user;
    let filter = {};
    if (me.role === "HOD") {
      const self = await User.findById(me.userId).catch(() => null);
      filter = { department: self?.department, role: { $in: ["FACULTY","STUDENT"] } };
    } else if (me.role === "FACULTY") {
      const self = await User.findById(me.userId).catch(() => null);
      filter = { department: self?.department, role: "STUDENT" };
    }
    const users = await User.find(filter).select("-password -resetOTP -resetOTPExpires").sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch(err) { res.status(500).json({ message: "Server error" }); }
});

app.post("/users/create", authenticate, authorize(["SUPER_ADMIN","ADMIN","HOD","FACULTY"]), async (req, res) => {
  try {
    const creator = await User.findById(req.user.userId);
    const { name, email, password, role, department, designation, phone, studentId, employeeId } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "name, email, password, role required" });
    const allowed = User.ROLE_CAN_CREATE[creator.role] || [];
    if (!allowed.includes(role))
      return res.status(403).json({ message: `A ${creator.role} cannot create a ${role}` });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });
    const newUser = await User.create({
      name, email, password, role, department, designation,
      phone, studentId, employeeId, createdBy: creator._id,
      isActive: true, isVerified: true,
    });
    res.status(201).json({ message: `${role} account created`, user: newUser.toProfile() });
  } catch(err) { res.status(500).json({ message: "Server error: " + err.message }); }
});

// ── 404 & error handler ──
app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error("Unhandled:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

// ══════════════════════════════════════════════════
// BOOT — connect to MongoDB Atlas then start
// ══════════════════════════════════════════════════
function startServer() {
  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║  🎓 BlockAudit University Edition v3.0               ║`);
    console.log(`║  URL   : ${MY_URL}                        ║`);
    console.log(`║  Atlas : ✅ Connected                                 ║`);
    console.log(`║  Email : ${process.env.EMAIL_PASS ? "✅ Gmail SMTP ready" : "⚠  Add EMAIL_PASS to .env"}                    ║`);
    console.log(`║  OTP   : ${process.env.DEV_MODE==="true" ? "🔧 DEV MODE — shown in browser" : "📧 Email only"}                ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);
    console.log("  Frontend : http://localhost:5173");
    console.log("  Health   : http://localhost:5000/health\n");
  });
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Atlas connected");
    await bootChain();
    await network.syncOnStartup(INITIAL_PEERS);
    startServer();
  })
  .catch(err => {
    console.error("❌ MongoDB Atlas FAILED:", err.message);
    console.error("   Fix: Go to Atlas → Network Access → Add IP → 0.0.0.0/0");
    process.exit(1);
  });

process.on("SIGINT",  () => { network.stopHeartbeat(); mongoose.disconnect(); process.exit(0); });
process.on("SIGTERM", () => { network.stopHeartbeat(); mongoose.disconnect(); process.exit(0); });