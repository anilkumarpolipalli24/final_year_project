const CryptoJS = require("crypto-js");

// Hash helper
function hash(data) {
    return CryptoJS.SHA256(data).toString();
}

// Build Merkle Root
function buildMerkleRoot(chunks) {
    if (chunks.length === 0) return null;

    // Step 1: Hash all chunks
    let hashes = chunks.map(chunk => hash(chunk));

    // Step 2: Build tree
    while (hashes.length > 1) {
        let temp = [];

        for (let i = 0; i < hashes.length; i += 2) {
            if (i + 1 < hashes.length) {
                temp.push(hash(hashes[i] + hashes[i + 1]));
            } else {
                // Odd node → duplicate last
                temp.push(hash(hashes[i] + hashes[i]));
            }
        }

        hashes = temp;
    }

    return hashes[0]; // Merkle Root
}

module.exports = { buildMerkleRoot };
