"use strict";

const jwt     = require("jsonwebtoken");
const crypto  = require("crypto");
const User    = require("../models/User");

// Load email service safely (nodemailer may not be installed yet)
let sendPasswordResetOTP = async () => {};
let sendWelcomeEmail     = async () => {};
let sendLoginOTP         = async () => {};
try {
  const svc = require("../services/emailService");
  if (svc.sendPasswordResetOTP) sendPasswordResetOTP = svc.sendPasswordResetOTP;
  if (svc.sendWelcomeEmail)     sendWelcomeEmail     = svc.sendWelcomeEmail;
  if (svc.sendLoginOTP)         sendLoginOTP         = svc.sendLoginOTP;
} catch(e) { console.warn("⚠ emailService not loaded:", e.message); }

const SECRET  = process.env.JWT_SECRET  || "BLOCKAUDIT_EDU_SECURE_2024";
const EXPIRES = process.env.JWT_EXPIRES || "8h";
const DEV     = process.env.DEV_MODE === "true";

function signToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, name: user.name, email: user.email },
    SECRET, { expiresIn: EXPIRES }
  );
}

// ════════════════════════════════════════════════════
// POST /auth/login
// Step 1 of OTP login: validate email+password, send OTP
// ════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials. Please try again." });

    if (!user.isActive)
      return res.status(403).json({ message: "Account deactivated. Contact your administrator." });

    // Generate login OTP
    const otp     = String(crypto.randomInt(100000, 999999));
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOTP        = otp;   // reuse same field for login OTP
    user.resetOTPExpires = expires;
    await user.save({ validateBeforeSave: false });

    // Send via email
    await sendLoginOTP(user, otp).catch(err => console.warn("OTP email:", err.message));

    console.log(`🔐 Login OTP for ${email}: ${otp}`);  // always log in console

    const resp = { message: `OTP sent to ${user.email}. Check your inbox.` };
    if (DEV) resp._devOtp = otp;  // show in dev mode UI

    res.json(resp);
  } catch (err) {
    console.error("Login step1:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// POST /auth/verify-otp
// Step 2: Verify OTP, return JWT token
// ════════════════════════════════════════════════════
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.resetOTP)
      return res.status(400).json({ message: "OTP expired or not requested. Please login again." });

    if (user.resetOTP !== String(otp).trim())
      return res.status(400).json({ message: "Incorrect OTP. Please try again." });

    if (new Date() > user.resetOTPExpires)
      return res.status(400).json({ message: "OTP expired. Please login again." });

    // Clear OTP, issue token
    user.resetOTP        = null;
    user.resetOTPExpires = null;
    await user.save({ validateBeforeSave: false });

    const token = signToken(user);
    res.json({
      token,
      role:       user.role,
      name:       user.name,
      email:      user.email,
      department: user.department,
      userId:     user._id,
    });
  } catch (err) {
    console.error("Verify OTP:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// POST /auth/register  (first-time SUPER_ADMIN setup)
// ════════════════════════════════════════════════════
exports.registerAdmin = async (req, res) => {
  try {
    const superExists = await User.findOne({ role: "SUPER_ADMIN" });
    if (superExists)
      return res.status(403).json({ message: "Registration closed. Ask SUPER_ADMIN to create your account." });

    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email, password required" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const user = await User.create({ name, email, password, phone, role: "SUPER_ADMIN", isActive: true, isVerified: true });
    const token = signToken(user);
    res.status(201).json({ message: "SUPER_ADMIN created. You can now login.", token, role: user.role, name: user.name });
  } catch (err) {
    console.error("Register:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// POST /auth/forgot-password
// ════════════════════════════════════════════════════
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const msg = "If this email is registered, a reset OTP has been sent.";
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: msg });

    const otp = String(crypto.randomInt(100000, 999999));
    user.resetOTP        = otp;
    user.resetOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendPasswordResetOTP(user, otp).catch(() => {});
    console.log(`🔑 Reset OTP for ${email}: ${otp}`);

    res.json({ message: msg });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// POST /auth/reset-password
// ════════════════════════════════════════════════════
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "email, otp, newPassword required" });
    if (newPassword.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.resetOTP)     return res.status(400).json({ message: "Invalid or expired OTP" });
    if (user.resetOTP !== String(otp)) return res.status(400).json({ message: "Incorrect OTP" });
    if (new Date() > user.resetOTPExpires) return res.status(400).json({ message: "OTP expired. Request a new one." });

    user.password        = newPassword;
    user.resetOTP        = null;
    user.resetOTPExpires = null;
    await user.save();

    res.json({ message: "Password reset successful. Please log in." });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// POST /auth/change-password
// ════════════════════════════════════════════════════
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!(await user.comparePassword(currentPassword)))
      return res.status(401).json({ message: "Current password incorrect" });
    if (newPassword.length < 6)
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ════════════════════════════════════════════════════
// GET /auth/me
// ════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate("createdBy", "name email role");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.toProfile());
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};