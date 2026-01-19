const { Blockchain, Block } = require("./blockchain");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const CryptoJS = require("crypto-js");
const fs = require("fs");

const path = require("path");

const DATA_FILE = path.join(__dirname, "blockchain_data.json");

// Load blockchain from file if exists
let myChain;
if (fs.existsSync(DATA_FILE)) {
    const data = fs.readFileSync(DATA_FILE);
    const chainData = JSON.parse(data);

    const { Blockchain } = require("./blockchain");
    myChain = new Blockchain();

    if (chainData.length > 0) {
        myChain.chain = chainData;
    }
} else {
    myChain = new Blockchain();
}

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

// const myChain = new Blockchain();

// File upload + hashing API
app.post("/upload", upload.single("file"), (req, res) => {
    const fileBuffer = fs.readFileSync(req.file.path);
    const hash = CryptoJS.SHA256(fileBuffer.toString()).toString();

    // Create data to store in block
    const fileData = {
        fileName: req.file.originalname,
        fileHash: hash,
    };

    // Create REAL Block object
    const newBlock = new Block(
        myChain.chain.length,
        Date.now().toString(),
        fileData
    );

    // Add block to blockchain
    myChain.addBlock(newBlock);

    res.json({
        message: "File stored in blockchain successfully",
        fileHash: hash,
        blockchainLength: myChain.chain.length,
    });

    // Save blockchain to file
    fs.writeFileSync(DATA_FILE, JSON.stringify(myChain.chain, null, 2));
});

// Verify file integrity
app.post("/verify", upload.single("file"), (req, res) => {
    const fileBuffer = fs.readFileSync(req.file.path);
    const newHash = CryptoJS.SHA256(fileBuffer.toString()).toString();

    // Search in blockchain
    let found = false;

    for (let block of myChain.chain) {
        if (block.data && block.data.fileHash === newHash) {
            found = true;
            break;
        }
    }

    if (found) {
        res.json({
            status: "SUCCESS",
            message: "File is original. No tampering detected.",
            fileHash: newHash,
        });
    } else {
        res.json({
            status: "FAILED",
            message: "File has been tampered or not found in blockchain.",
            fileHash: newHash,
        });
    }
});

// Verify file integrity (Audit API)
app.post("/verify", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const newHash = CryptoJS.SHA256(fileBuffer.toString()).toString();

    let found = false;
    let matchedFile = null;

    // Search hash in blockchain
    for (let block of myChain.chain) {
        if (block.data && block.data.fileHash === newHash) {
            found = true;
            matchedFile = block.data.fileName;
            break;
        }
    }

    // 🔹 SAVE BLOCKCHAIN FILE HERE (sync safety)
    fs.writeFileSync(DATA_FILE, JSON.stringify(myChain.chain, null, 2));

    if (found) {
        res.json({
            status: "SUCCESS",
            message: "File is original. No tampering detected.",
            fileHash: newHash,
            matchedWith: matchedFile,
        });
    } else {
        res.json({
            status: "FAILED",
            message: "File has been tampered or not found in blockchain.",
            fileHash: newHash,
        });
    }
});

// View full blockchain
app.get("/chain", (req, res) => {
    res.json(myChain.chain);
});

// Validate entire blockchain integrity
app.get("/validateChain", (req, res) => {
    const isValid = myChain.isChainValid();

    if (isValid) {
        res.json({
            status: "SECURE",
            message: "Blockchain is valid and secure.",
        });
    } else {
        res.json({
            status: "CORRUPTED",
            message: "Blockchain has been tampered!",
        });
    }
});

app.listen(5000, () => {
    console.log("Backend running on port 5000");
});