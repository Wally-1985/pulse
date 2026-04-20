const nodemailer = require('nodemailer');
const { query } = require('../config/database');

let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  const settings = await query(
    `SELECT key, value FROM system_settings WHERE key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from')`
  );
  const s = {};
  settings.rows.forEach(r => { s[r.key] = r.value; });

  if (!s.smtp_host) return null;

  transporter = nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587'),
    secure: parseInt(s.smtp_port || '587') === 465,
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass || '' } : undefined,
  });

  return transporter;
};

const resetTransporter = () => { transporter = null; };

const sendEmail = async ({ to, subject, html, text }) => {
  const t = await getTransporter();
  if (!t) {
    console.log(`[EMAIL SKIPPED - no SMTP] To: ${to}, Subject: ${subject}`);
    return false;
  }

  const settings = await query(`SELECT value FROM system_settings WHERE key = 'smtp_from'`);
  const from = settings.rows[0]?.value || 'Pulse <noreply@pulse.local>';

  await t.sendMail({ from, to, subject, html, text });
  return true;
};

const emailTemplates = {
  missingEntryReminder: (user, date) => ({
    subject: `Pulse Reminder: Missing entry for ${date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Daily Entry Reminder</h2>
        <p>Hi ${user.first_name},</p>
        <p>You have a missing daily entry for <strong>${date}</strong>.</p>
        <p>Please log in to Pulse to submit your entry.</p>
        <a href="${process.env.APP_URL}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 16px;">
          Open Pulse
        </a>
      </div>
    `,
    text: `Hi ${user.first_name}, you have a missing daily entry for ${date}. Please log in to Pulse to submit it.`,
  }),

  passwordReset: (user, resetUrl) => ({
    subject: 'Pulse - Password Reset Request',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hi ${user.first_name},</p>
        <p>You requested a password reset. Click the link below (expires in 1 hour):</p>
        <a href="${resetUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 16px;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
    text: `Hi ${user.first_name}, reset your password here: ${resetUrl}`,
  }),

  welcomeUser: (user, tempPassword) => ({
    subject: 'Welcome to Pulse',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Pulse</h2>
        <p>Hi ${user.first_name},</p>
        <p>Your account has been created. Here are your login details:</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>Please log in and change your password immediately.</p>
        <a href="${process.env.APP_URL}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 16px;">
          Log In to Pulse
        </a>
      </div>
    `,
    text: `Welcome to Pulse. Email: ${user.email}, Temp password: ${tempPassword}`,
  }),
};

module.exports = { sendEmail, emailTemplates, resetTransporter };
