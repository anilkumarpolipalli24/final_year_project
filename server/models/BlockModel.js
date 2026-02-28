const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema({
  index:        { type: Number, required: true, unique: true },
  timestamp:    { type: String, required: true },
  data:         { type: mongoose.Schema.Types.Mixed },
  previousHash: { type: String, required: true },
  hash:         { type: String, required: true },
  signature:    { type: String, default: null },
  publicKey:    { type: String, default: null },
  nonce:        { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Block", blockSchema);
