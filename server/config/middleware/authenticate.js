"use strict";
// server/config/middleware/authenticate.js
// Place this file in: server/config/middleware/authenticate.js  (REPLACE)
const jwt    = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "BLOCKAUDIT_EDU_SECURE_2024_XK9";

module.exports = function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ message: "Token expired. Please log in again." });
    return res.status(401).json({ message: "Invalid token" });
  }
};