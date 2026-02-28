// Must set env vars BEFORE any require() calls
process.env.NODE_PORT = "5001";
process.env.MY_URL    = "http://localhost:5001";
process.env.PEERS     = "http://localhost:5000";
// Small delay ensures env is fully set before module loads
setTimeout(() => require("./index.js"), 0);