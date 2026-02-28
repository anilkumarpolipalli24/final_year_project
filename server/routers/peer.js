/**
 * routers/peer.js — P2P peer-to-peer endpoints
 * These routes are called by OTHER nodes, not by the frontend.
 */

const express  = require("express");
const router   = express.Router();
const CryptoJS = require("crypto-js");
const { Block } = require("../blockchain");

module.exports = function createPeerRouter(blockchain, network, persistBlock, AuditLog) {

  // ── POST /peer/register ──
  // A peer tells us they exist. We add them and return our peer list.
  router.post("/peer/register", (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "url required" });

    network.addPeer(url);
    console.log(`🌐 New peer registered: ${url}`);

    res.json({
      message: "Registered successfully",
      peers:   network.getPeers(),
    });
  });

  // ── GET /peer/chain ──
  // A peer asks for our full chain. Return raw serialisable objects.
  router.get("/peer/chain", (req, res) => {
    const raw = blockchain.chain.map(b => ({
      index:        b.index,
      timestamp:    b.timestamp,
      data:         b.data,
      previousHash: b.previousHash,
      hash:         b.hash,
      signature:    b.signature || null,
      publicKey:    b.publicKey || null,
      nonce:        b.nonce || 0,
    }));
    res.json({ chain: raw, length: raw.length });
  });

  // ── GET /peer/peers ──
  // Return our known peer list.
  router.get("/peer/peers", (req, res) => {
    res.json({ peers: network.getPeers(), myUrl: network.myUrl });
  });

  // ── POST /peer/receive-block ──
  // A peer broadcasts a new block. Validate it and append if valid.
  router.post("/peer/receive-block", async (req, res) => {
    const { block: raw } = req.body;
    if (!raw) return res.status(400).json({ message: "block required" });

    try {
      const latest = blockchain.getLatestBlock();

      // ── Validation 1: index must be next in sequence
      if (raw.index !== latest.index + 1) {
        // If we're behind, trigger a full sync
        if (raw.index > latest.index + 1) {
          console.log(`🔄 We are behind (have ${latest.index}, got ${raw.index}). Syncing…`);
          await network.syncChain();
        }
        return res.status(409).json({ message: "Block rejected — out of sequence" });
      }

      // ── Validation 2: previousHash must match our latest
      if (raw.previousHash !== latest.hash) {
        return res.status(409).json({ message: "Block rejected — previousHash mismatch" });
      }

      // ── Validation 3: hash integrity
      const recalc = CryptoJS.SHA256(
        raw.index + raw.previousHash + raw.timestamp +
        JSON.stringify(raw.data) + (raw.nonce || 0)
      ).toString();
      if (raw.hash !== recalc) {
        return res.status(400).json({ message: "Block rejected — hash invalid" });
      }

      // ── Validation 4: ECDSA signature
      if (raw.signature && raw.publicKey) {
        const EC  = require("elliptic").ec;
        const ec  = new EC("secp256k1");
        const key = ec.keyFromPublic(raw.publicKey, "hex");
        if (!key.verify(raw.hash, raw.signature)) {
          return res.status(400).json({ message: "Block rejected — ECDSA signature invalid" });
        }
      }

      // ── All checks passed — append block ──
      const block         = new Block(raw.index, raw.timestamp, raw.data, raw.previousHash);
      block.hash          = raw.hash;
      block.signature     = raw.signature || null;
      block.publicKey     = raw.publicKey || null;
      block.nonce         = raw.nonce || 0;

      blockchain.chain.push(block);
      await persistBlock(block);

      // Log the sync event
      await AuditLog.create({
        username:  "P2P_SYNC",
        role:      "SYSTEM",
        action:    "BLOCK_RECEIVED",
        fileName:  block.data?.fileName || "N/A",
        fileHash:  block.data?.fileHash || "N/A",
        ipAddress: req.ip,
      });

      console.log(`📦 Block #${block.index} received & accepted from peer (${req.ip})`);
      res.json({ message: "Block accepted", index: block.index });

    } catch (err) {
      console.error("receive-block error:", err);
      res.status(500).json({ message: "Internal error processing block" });
    }
  });

  return router;
};