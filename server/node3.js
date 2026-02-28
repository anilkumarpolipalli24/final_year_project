process.env.NODE_PORT = "5002";
process.env.MY_URL    = "http://localhost:5002";
process.env.PEERS     = "http://localhost:5000,http://localhost:5001";
setTimeout(() => require("./index.js"), 0);