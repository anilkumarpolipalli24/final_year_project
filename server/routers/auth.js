"use strict";
const router = require("express").Router();
const ctrl   = require("../controllers/authController");
const auth   = require("../config/middleware/authenticate");
const rateLimit = require("express-rate-limit");

const otpLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { message: "Too many OTP attempts. Wait 15 minutes." } });

router.post("/auth/login",           otpLimiter, ctrl.login);
router.post("/auth/verify-otp",      otpLimiter, ctrl.verifyOtp);
router.post("/auth/register",        ctrl.registerAdmin);
router.post("/auth/forgot-password", ctrl.forgotPassword);
router.post("/auth/reset-password",  ctrl.resetPassword);
router.post("/auth/change-password", auth, ctrl.changePassword);
router.get("/auth/me",               auth, ctrl.getMe);

module.exports = router;
