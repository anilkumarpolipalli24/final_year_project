/**
 * p2p.js — Peer-to-Peer Network Manager
 * 
 * Architecture:
 *  - Each node maintains a list of known peer URLs
 *  - On startup: connects to peers, compares chain lengths, adopts longest valid chain
 *  - On new block: broadcasts to all peers via HTTP POST /peer/receive-block
 *  - Peers register themselves via POST /peer/register
 *  - Periodic heartbeat checks peer liveness every 30s
 */

const axios = require("axios");

class P2PNetwork {
  constructor(myUrl, blockchain, persistBlock) {
    this.myUrl       = myUrl;          // e.g. "http://localhost:5000"
    this.peers       = new Set();      // Set of peer URL strings
    this.blockchain  = blockchain;     // reference to the Blockchain instance
    this.persistBlock = persistBlock;  // async fn(block) — saves block to MongoDB
    this.heartbeatInterval = null;
  }

  // ── Register a new peer ──
  addPeer(url) {
    if (url && url !== this.myUrl) {
      this.peers.add(url.replace(/\/$/, ""));
    }
  }

  removePeer(url) {
    this.peers.delete(url);
  }

  getPeers() {
    return Array.from(this.peers);
  }

  // ── Announce ourselves to a peer and ask for their peers ──
  async registerWithPeer(peerUrl) {
    try {
      const res = await axios.post(`${peerUrl}/peer/register`, {
        url: this.myUrl,
      }, { timeout: 5000 });

      // They may send us their peer list too
      if (res.data.peers) {
        res.data.peers.forEach(p => this.addPeer(p));
      }
      console.log(`🌐 Registered with peer: ${peerUrl}`);
      return true;
    } catch (err) {
      console.warn(`⚠ Could not register with peer ${peerUrl}: ${err.message}`);
      return false;
    }
  }

  // ── On startup: sync with all known peers ──
  async syncOnStartup(initialPeers = []) {
    initialPeers.forEach(p => this.addPeer(p));

    for (const peer of this.getPeers()) {
      await this.registerWithPeer(peer);
    }

    await this.syncChain();
    this.startHeartbeat();
  }

  // ── Pull chain from all peers, adopt the longest valid one ──
  async syncChain() {
    let bestChain    = this.blockchain.chain;
    let bestLength   = this.blockchain.chain.length;
    let bestPeer     = null;

    for (const peer of this.getPeers()) {
      try {
        const res = await axios.get(`${peer}/peer/chain`, { timeout: 8000 });
        const remoteChain = res.data.chain;

        if (
          remoteChain.length > bestLength &&
          this._isValidChainData(remoteChain)
        ) {
          bestChain  = remoteChain;
          bestLength = remoteChain.length;
          bestPeer   = peer;
        }
      } catch (err) {
        console.warn(`⚠ Could not sync with ${peer}: ${err.message}`);
      }
    }

    if (bestPeer) {
      await this._adoptChain(bestChain);
      console.log(`🔄 Chain synced from ${bestPeer} (${bestLength} blocks)`);
    } else {
      console.log(`✅ Local chain is up to date (${this.blockchain.chain.length} blocks)`);
    }
  }

  // ── Validate raw chain data before adopting ──
  _isValidChainData(chainData) {
    const CryptoJS = require("crypto-js");
    const EC       = require("elliptic").ec;
    const ec       = new EC("secp256k1");

    for (let i = 1; i < chainData.length; i++) {
      const cur  = chainData[i];
      const prev = chainData[i - 1];

      // Hash check
      const recalc = CryptoJS.SHA256(
        cur.index + cur.previousHash + cur.timestamp +
        JSON.stringify(cur.data) + (cur.nonce || 0)
      ).toString();
      if (cur.hash !== recalc)           return false;
      if (cur.previousHash !== prev.hash) return false;

      // ECDSA check
      if (cur.signature && cur.publicKey) {
        try {
          const key = ec.keyFromPublic(cur.publicKey, "hex");
          if (!key.verify(cur.hash, cur.signature)) return false;
        } catch { return false; }
      }
    }
    return true;
  }

  // ── Load a validated remote chain into our blockchain ──
  async _adoptChain(chainData) {
    const { Block } = require("./blockchain");

    // Rebuild Block instances from raw data
    const newChain = chainData.map(b => {
      const block         = new Block(b.index, b.timestamp, b.data, b.previousHash);
      block.hash          = b.hash;
      block.signature     = b.signature || null;
      block.publicKey     = b.publicKey || null;
      block.nonce         = b.nonce || 0;
      return block;
    });

    this.blockchain.chain = newChain;

    // Persist any new blocks to MongoDB
    for (const block of newChain) {
      await this.persistBlock(block);
    }
  }

  // ── Broadcast a newly added block to all peers ──
  async broadcastBlock(block) {
    const payload = {
      block: {
        index:        block.index,
        timestamp:    block.timestamp,
        data:         block.data,
        previousHash: block.previousHash,
        hash:         block.hash,
        signature:    block.signature,
        publicKey:    block.publicKey,
        nonce:        block.nonce || 0,
      },
    };

    const results = await Promise.allSettled(
      this.getPeers().map(peer =>
        axios.post(`${peer}/peer/receive-block`, payload, { timeout: 5000 })
      )
    );

    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed    = results.length - succeeded;
    if (results.length > 0) {
      console.log(`📡 Block #${block.index} broadcast → ${succeeded} ok, ${failed} failed`);
    }
  }

  // ── Heartbeat: ping all peers every 30s, remove dead ones ──
  startHeartbeat(intervalMs = 30000) {
    this.heartbeatInterval = setInterval(async () => {
      for (const peer of this.getPeers()) {
        try {
          await axios.get(`${peer}/health`, { timeout: 4000 });
        } catch {
          console.warn(`💀 Peer unreachable, removing: ${peer}`);
          this.removePeer(peer);
        }
      }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  // ── Summary for the API ──
  getNetworkStatus() {
    return {
      myUrl:      this.myUrl,
      peerCount:  this.peers.size,
      peers:      this.getPeers(),
      chainLength: this.blockchain.chain.length,
    };
  }
}

module.exports = P2PNetwork;