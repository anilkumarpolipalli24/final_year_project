"use strict";
// server/models/AuditLog.js
// Place this file in: server/models/AuditLog.js  (REPLACE the existing one)
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  username:  { type: String, default: null },
  role:      { type: String, default: null },
  action:    { type: String, default: null },
  fileName:  { type: String, default: null },
  fileHash:  { type: String, default: null },
  docType:   { type: String, default: null },
  department:{ type: String, default: null },
  caseRef:   { type: String, default: null },
  blockIndex:{ type: Number, default: null },
  ipAddress: { type: String, default: null },
  details:   { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ userId: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);