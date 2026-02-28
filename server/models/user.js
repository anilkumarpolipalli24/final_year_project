"use strict";
// server/models/User.js
// Place this file in: server/models/User.js
// (DELETE the old server/models/user.js after placing this)
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const ROLES = ["SUPER_ADMIN", "ADMIN", "HOD", "FACULTY", "STUDENT"];

const ROLE_CAN_CREATE = {
  SUPER_ADMIN: ["ADMIN", "HOD", "FACULTY", "STUDENT"],
  ADMIN:       ["HOD", "FACULTY", "STUDENT"],
  HOD:         ["FACULTY", "STUDENT"],
  FACULTY:     ["STUDENT"],
  STUDENT:     [],
};

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 6 },
  phone:       { type: String, default: null },
  role:        { type: String, enum: ROLES, required: true },
  department:  { type: String, default: null },
  designation: { type: String, default: null },
  studentId:   { type: String, default: null },
  employeeId:  { type: String, default: null },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  isActive:    { type: Boolean, default: true },
  isVerified:  { type: Boolean, default: false },
  resetOTP:        { type: String, default: null },
  resetOTPExpires: { type: Date,   default: null },
  emailAlerts: { type: Boolean, default: true },
  smsAlerts:   { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toProfile = function () {
  const o = this.toObject();
  delete o.password;
  delete o.resetOTP;
  delete o.resetOTPExpires;
  return o;
};

userSchema.statics.ROLES           = ROLES;
userSchema.statics.ROLE_CAN_CREATE = ROLE_CAN_CREATE;

module.exports = mongoose.model("User", userSchema);