const nodemailer = require("nodemailer");

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper to get institution name from .env
const getInstName = () => process.env.INSTITUTION_NAME || "BlockAudit University";

/**
 * Send OTP for Login
 */
exports.sendLoginOTP = async (user, otp) => {
  try {
    const mailOptions = {
      from: `"${getInstName()}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Login OTP - ${getInstName()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${user.name},</h2>
          <p>Your One-Time Password (OTP) for logging in is: <strong style="font-size: 24px; color: #4CAF50;">${otp}</strong></p>
          <p>This OTP will expire in 10 minutes. Please do not share it with anyone.</p>
          <br>
          <p>Regards,<br><strong>${getInstName()} Security Team</strong></p>
        </div>
      `,
    };
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending login OTP:", error);
    throw error;
  }
};

/**
 * Send OTP for Password Reset
 */
exports.sendPasswordResetOTP = async (user, otp) => {
  try {
    const mailOptions = {
      from: `"${getInstName()}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Password Reset OTP - ${getInstName()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${user.name},</h2>
          <p>You requested a password reset. Your OTP is: <strong style="font-size: 24px; color: #FF5722;">${otp}</strong></p>
          <p>This OTP will expire in 10 minutes. If you did not request this, please ignore this email.</p>
          <br>
          <p>Regards,<br><strong>${getInstName()} Security Team</strong></p>
        </div>
      `,
    };
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending password reset OTP:", error);
    throw error;
  }
};

/**
 * Send Welcome Email with generated password
 */
exports.sendWelcomeEmail = async (user, generatedPassword) => {
  try {
    const mailOptions = {
      from: `"${getInstName()}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Welcome to ${getInstName()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${user.name},</h2>
          <p>Your account on <strong>${getInstName()}</strong> has been successfully created.</p>
          <p>Here are your login credentials:</p>
          <ul>
            <li><strong>Email:</strong> ${user.email}</li>
            <li><strong>Temporary Password:</strong> ${generatedPassword}</li>
          </ul>
          <p>Please log in and change your password immediately.</p>
          <br>
          <p>Regards,<br><strong>${getInstName()} Registration Team</strong></p>
        </div>
      `,
    };
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};
