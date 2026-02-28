"use strict";
const User     = require("../models/User");
const AuditLog = require("../models/AuditLog");
const emailSvc = require("../services/emailService");
const smsSvc   = require("../services/smsService");

const HIERARCHY = { SUPER_ADMIN: 0, ADMIN: 1, HOD: 2, FACULTY: 3, STUDENT: 4 };

// POST /users/create
exports.createUser = async (req, res) => {
  try {
    const creator = await User.findById(req.user.userId);
    const { name, email, password, role, department, designation, phone, studentId, employeeId } = req.body;

    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "name, email, password, role required" });

    const allowed = User.ROLE_CAN_CREATE[creator.role] || [];
    if (!allowed.includes(role))
      return res.status(403).json({ message: `A ${creator.role} cannot create a ${role} account` });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const newUser = await User.create({
      name, email, password, role,
      department, designation, phone, studentId, employeeId,
      createdBy: creator._id,
      isActive: true, isVerified: true,
    });

    // Welcome email + SMS both
    emailSvc.sendWelcomeEmail(newUser, password, creator.name).catch(() => {});
    if (phone) smsSvc.sendWelcomeSMS(newUser, password).catch(() => {});

    await AuditLog.create({
      userId: creator._id, username: creator.name, role: creator.role,
      action: "CREATE_USER",
      details: `Created ${role} account: ${email}`,
      ipAddress: req.ip,
    });

    res.status(201).json({ message: `${role} account created`, user: newUser.toProfile() });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET /users
exports.listUsers = async (req, res) => {
  try {
    const me = req.user;
    let filter = {};
    if (me.role === "SUPER_ADMIN" || me.role === "ADMIN") {
      filter = {};
    } else if (me.role === "HOD") {
      const self = await User.findById(me.userId);
      filter = { department: self.department, role: { $in: ["FACULTY", "STUDENT"] } };
    } else if (me.role === "FACULTY") {
      const self = await User.findById(me.userId);
      filter = { department: self.department, role: "STUDENT" };
    } else {
      return res.status(403).json({ message: "Access denied" });
    }
    const users = await User.find(filter)
      .select("-password -resetOTP -resetOTPExpires")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 });
    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET /users/:id
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -resetOTP -resetOTPExpires")
      .populate("createdBy", "name role email");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /users/:id/toggle-active
exports.toggleActive = async (req, res) => {
  try {
    const creator = req.user;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (String(user._id) === String(creator.userId))
      return res.status(400).json({ message: "Cannot deactivate yourself" });
    if (HIERARCHY[user.role] <= HIERARCHY[creator.role])
      return res.status(403).json({ message: "Cannot deactivate a user of equal or higher rank" });

    user.isActive = !user.isActive;
    await user.save();
    await AuditLog.create({
      userId: creator.userId, username: creator.name, role: creator.role,
      action: user.isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      details: `${user.isActive ? "Activated" : "Deactivated"}: ${user.email}`,
      ipAddress: req.ip,
    });
    res.json({ message: `User ${user.isActive ? "activated" : "deactivated"}`, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// GET /users/stats
exports.userStats = async (req, res) => {
  try {
    const stats = await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
    const total = await User.countDocuments();
    res.json({ stats, total });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};