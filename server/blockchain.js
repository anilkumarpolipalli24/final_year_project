const CryptoJS = require("crypto-js");
const EC = require("elliptic").ec;

const ec = new EC("secp256k1");

function generateKeyPair() {
  const keyPair = ec.genKeyPair();
  return {
    privateKey: keyPair.getPrivate("hex"),
    publicKey:  keyPair.getPublic("hex"),
  };
}

class Block {
  constructor(index, timestamp, data, previousHash = "") {
    this.index        = index;
    this.timestamp    = timestamp;
    this.data         = data;
    this.previousHash = previousHash;
    this.hash         = this.calculateHash();
    this.signature    = null;
    this.publicKey    = null;
    this.nonce        = 0;
  }

  calculateHash() {
    return CryptoJS.SHA256(
      this.index +
      this.previousHash +
      this.timestamp +
      JSON.stringify(this.data) +
      this.nonce
    ).toString();
  }

  signBlock(privateKeyHex) {
    const keyPair = ec.keyFromPrivate(privateKeyHex, "hex");
    const sigObj  = keyPair.sign(this.hash);
    this.signature = sigObj.toDER("hex");
    this.publicKey = keyPair.getPublic("hex");
  }

  isSignatureValid() {
    if (!this.signature || !this.publicKey) return false;
    try {
      const key = ec.keyFromPublic(this.publicKey, "hex");
      return key.verify(this.hash, this.signature);
    } catch { return false; }
  }
}

class Blockchain {
  constructor(nodePrivateKey) {
    this.nodePrivateKey = nodePrivateKey;
    this.chain = [];
  }

  initGenesis() {
    if (this.chain.length === 0) {
      const genesis = new Block(0, Date.now().toString(), "Genesis Block", "0");
      if (this.nodePrivateKey) genesis.signBlock(this.nodePrivateKey);
      this.chain.push(genesis);
    }
  }

  // Restore chain from plain objects (from MongoDB)
  loadFromObjects(blocks) {
    this.chain = blocks.map(b => {
      const block         = new Block(b.index, b.timestamp, b.data, b.previousHash);
      block.hash          = b.hash;
      block.signature     = b.signature || null;
      block.publicKey     = b.publicKey || null;
      block.nonce         = b.nonce || 0;
      return block;
    });
  }

  getLatestBlock() { return this.chain[this.chain.length - 1]; }

  addBlock(newBlock) {
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.hash         = newBlock.calculateHash();
    if (this.nodePrivateKey) newBlock.signBlock(this.nodePrivateKey);
    this.chain.push(newBlock);
    return newBlock;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const cur  = this.chain[i];
      const prev = this.chain[i - 1];
      const recalc = CryptoJS.SHA256(
        cur.index + cur.previousHash + cur.timestamp + JSON.stringify(cur.data) + cur.nonce
      ).toString();
      if (cur.hash !== recalc)                 return false;
      if (cur.previousHash !== prev.hash)       return false;
      if (!cur.isSignatureValid())              return false;
    }
    return true;
  }

  getSignatureSummary() {
    return this.chain.map(b => ({
      index:         b.index,
      signatureValid: b.index === 0 ? true : b.isSignatureValid(),
      publicKey:     b.publicKey ? b.publicKey.slice(0, 24) + "…" : null,
      signature:     b.signature ? b.signature.slice(0, 24) + "…" : null,
    }));
  }
}

module.exports = { Blockchain, Block, generateKeyPair };