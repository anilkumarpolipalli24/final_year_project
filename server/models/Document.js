"use strict";
// server/models/Document.js
// Place this file in: server/models/Document.js
const mongoose = require("mongoose");

const docSchema = new mongoose.Schema({
  blockIndex:   { type: Number, default: null },
  blockHash:    { type: String, default: null },
  title:        { type: String, required: true, trim: true },
  docType:      { type: String, default: "Other" },
  description:  { type: String, default: null },
  fileName:     { type: String, required: true },
  fileHash:     { type: String, required: true, unique: true },
  fileSize:     { type: Number, default: null },
  mimeType:     { type: String, default: null },
  department:   { type: String, default: null },
  semester:     { type: String, default: null },
  academicYear: { type: String, default: null },
  rollNumber:   { type: String, default: null },
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  studentRef:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  signature:    { type: String, default: null },
  publicKey:    { type: String, default: null },
  signatureValid: { type: Boolean, default: null },
  status:       { type: String, enum: ["ACTIVE","REVOKED","PENDING"], default: "ACTIVE" },
  revokedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revokedAt:    { type: Date,   default: null },
  revokeReason: { type: String, default: null },
}, { timestamps: true });

docSchema.index({ uploadedBy: 1 });
docSchema.index({ department: 1 });
docSchema.index({ blockIndex: 1 });

module.exports = mongoose.model("Document", docSchema);