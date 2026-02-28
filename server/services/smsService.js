"use strict";
const https        = require("https");
const Notification = require("../models/Notification");

/**
 * SMS via Fast2SMS (India) — free API, no Twilio account needed
 * Sign up at: https://www.fast2sms.com
 * After signup → API → DLT → copy your API key
 * Add to .env:  FAST2SMS_KEY=your_key_here
 *
 * If you want Twilio instead, uncomment the Twilio section below.
 */

// ── Normalize phone number to 10 digits ──
function cleanPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  // Remove country code 91 if present
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

// ── Fast2SMS sender ──
async function fast2sms(phone, message) {
  return new Promise((resolve) => {
    const key = process.env.FAST2SMS_KEY;
    if (!key) {
      console.warn("⚠ FAST2SMS_KEY not set in .env — SMS skipped");
      return resolve(false);
    }

    const cleaned = cleanPhone(phone);
    if (!cleaned) {
      console.warn("⚠ Invalid phone number:", phone);
      return resolve(false);
    }

    const body = JSON.stringify({
      route:    "q",
      message:  message.slice(0, 500),  // SMS limit
      numbers:  cleaned,
      flash:    0,
    });

    const options = {
      hostname: "www.fast2sms.com",
      path:     "/dev/bulkV2",
      method:   "POST",
      headers: {
        authorization: key,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.return === true) {
            console.log(`📱 SMS sent to ${cleaned}`);
            resolve(true);
          } else {
            console.warn("⚠ Fast2SMS error:", json.message);
            resolve(false);
          }
        } catch { resolve(false); }
      });
    });

    req.on("error", err => { console.warn("⚠ SMS network error:", err.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════
// SMS SENDERS
// ══════════════════════════════════════════════

// ── Document uploaded → notify student ──
async function sendDocumentUploadedSMS(student, doc) {
  if (!student?.phone || !process.env.FAST2SMS_KEY) return false;
  const msg = `BlockAudit: Your document "${doc.title}" (${doc.docType}) has been filed on the blockchain. Block #${doc.blockIndex}. - ${process.env.INSTITUTION_SHORT || "Institution"}`;
  const ok = await fast2sms(student.phone, msg);
  await Notification.create({
    type: "SMS", event: "DOCUMENT_UPLOADED",
    recipient: student._id, recipientPhone: student.phone,
    message: msg,
    documentRef: doc._id, blockIndex: doc.blockIndex,
    status: ok ? "SENT" : "FAILED",
    sentAt: ok ? new Date() : null,
  });
  return ok;
}

// ── Tamper alert → notify admins by SMS ──
async function sendTamperAlertSMS(adminPhones, blockIndex, details) {
  let ok = true;
  for (const phone of adminPhones) {
    const msg = `URGENT - BlockAudit TAMPER DETECTED! Block #${blockIndex}: ${details}. Login immediately. - ${process.env.INSTITUTION_SHORT || "BlockAudit"}`;
    const sent = await fast2sms(phone, msg);
    if (!sent) ok = false;
  }
  await Notification.create({
    type: "SMS", event: "TAMPER_DETECTED",
    recipientPhone: adminPhones.join(", "),
    message: `Tamper alert SMS sent for Block #${blockIndex}`,
    blockIndex,
    status: ok ? "SENT" : "FAILED",
    sentAt: ok ? new Date() : null,
  });
  return ok;
}

// ── Document verified → SMS to student ──
async function sendVerificationSMS(student, doc) {
  if (!student?.phone || !process.env.FAST2SMS_KEY) return false;
  const msg = `BlockAudit: Document "${doc.title}" verified successfully. Integrity: INTACT, ECDSA: VALID. - ${process.env.INSTITUTION_SHORT || "Institution"}`;
  return fast2sms(student.phone, msg);
}

// ── OTP SMS ──
async function sendOTPSMS(phone, otp) {
  if (!phone || !process.env.FAST2SMS_KEY) return false;
  const msg = `Your BlockAudit password reset OTP is ${otp}. Valid for 10 minutes. Do not share. - ${process.env.INSTITUTION_SHORT || "BlockAudit"}`;
  return fast2sms(phone, msg);
}

// ── Welcome SMS to new user ──
async function sendWelcomeSMS(user, tempPassword) {
  if (!user?.phone || !process.env.FAST2SMS_KEY) return false;
  const msg = `Welcome to BlockAudit! Email: ${user.email} | Temp Password: ${tempPassword} | Role: ${user.role}. Login & change password. - ${process.env.INSTITUTION_SHORT || "Institution"}`;
  return fast2sms(user.phone, msg);
}

module.exports = {
  sendDocumentUploadedSMS,
  sendTamperAlertSMS,
  sendVerificationSMS,
  sendOTPSMS,
  sendWelcomeSMS,
};