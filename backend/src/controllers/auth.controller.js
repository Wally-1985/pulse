const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { audit } = require('../services/audit');
const { sendEmail, emailTemplates } = require('../services/email');

const generateTokens = async (userId, rememberMe = false, req = null) => {
  const expiresIn = rememberMe ? '30d' : process.env.JWT_EXPIRES_IN || '24h';
  const expiresAt = rememberMe
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const deviceInfo = req?.headers?.['user-agent'] || null;
  const ipAddress = req?.ip || null;

  await query(
    `INSERT INTO sessions (user_id, token_hash, device_info, ip_address, remember_me, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, tokenHash, deviceInfo, ipAddress, rememberMe, expiresAt]
  );

  return token;
};

exports.login = async (req, res) => {
  const { email, password, mfaCode, rememberMe = false } = req.body;

  try {
    const userResult = await query(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (!userResult.rows.length) {
      await audit({ actionType: 'login_failed', success: false, req, newValue: { email } });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(401).json({ error: 'Account temporarily locked. Try again later.' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash || '');
    if (!validPassword) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lockUntil, user.id]
      );
      await audit({ userId: user.id, actionType: 'login_failed', success: false, req });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // MFA check
    if (user.mfa_enabled) {
      if (!mfaCode) {
        return res.status(200).json({ requiresMfa: true });
      }
      const valid = speakeasy.totp.verify({
        secret: user.mfa_secret,
        encoding: 'base32',
        token: mfaCode,
        window: 2,
      });
      if (!valid) {
        await audit({ userId: user.id, actionType: 'mfa_failed', success: false, req });
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }

    // Reset failed attempts
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    const token = await generateTokens(user.id, rememberMe, req);

    // Load roles
    const rolesResult = await query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = rolesResult.rows.map(r => r.name);

    await audit({ userId: user.id, role: roles.join(','), actionType: 'login', success: true, req });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
        timezone: user.timezone,
        roles,
        setupStatus: user.setup_status,
        notificationPreference: user.notification_preference,
        mfaEnabled: user.mfa_enabled,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.logout = async (req, res) => {
  try {
    await query(
      `UPDATE sessions SET revoked_at = NOW() WHERE id = $1`,
      [req.user.sessionId]
    );
    await audit({ userId: req.user.id, actionType: 'logout', req });
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, avatar_url, timezone, setup_status,
              notification_preference, mfa_enabled, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    const unread = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url,
      timezone: user.timezone,
      setupStatus: user.setup_status,
      notificationPreference: user.notification_preference,
      mfaEnabled: user.mfa_enabled,
      roles: req.user.roles,
      unreadNotifications: parseInt(unread.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const result = await query(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );
    // Always return success to prevent email enumeration
    if (result.rows.length) {
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await query(
        `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
        [token, expires, user.id]
      );
      const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
      const emailContent = emailTemplates.passwordReset(user, resetUrl);
      await sendEmail({ to: user.email, ...emailContent });
      await audit({ userId: user.id, actionType: 'password_reset_requested', req });
    }
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process request' });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  try {
    const result = await query(
      `SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const user = result.rows[0];
    const hash = await bcrypt.hash(password, 12);
    await query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2`,
      [hash, user.id]
    );
    // Revoke all sessions
    await query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1`, [user.id]);
    await audit({ userId: user.id, actionType: 'password_reset', req });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, device_info, ip_address, remember_me, created_at, last_used_at, expires_at
       FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY last_used_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(s => ({
      id: s.id,
      deviceInfo: s.device_info,
      ipAddress: s.ip_address,
      rememberMe: s.remember_me,
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
      expiresAt: s.expires_at,
      isCurrent: s.id === req.user.sessionId,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await query(
      `UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2`,
      [sessionId, req.user.id]
    );
    await audit({ userId: req.user.id, actionType: 'session_revoked', entityType: 'session', entityId: sessionId, req });
    res.json({ message: 'Session revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

exports.setupMfa = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `Pulse (${req.user.email})` });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    // Temporarily store secret (not enabled until verified)
    await query(`UPDATE users SET mfa_secret = $1 WHERE id = $2`, [secret.base32, req.user.id]);
    res.json({ secret: secret.base32, qrCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
};

exports.verifyMfa = async (req, res) => {
  const { code } = req.body;
  try {
    const result = await query(`SELECT mfa_secret FROM users WHERE id = $1`, [req.user.id]);
    const secret = result.rows[0]?.mfa_secret;
    if (!secret) return res.status(400).json({ error: 'MFA not set up' });

    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 2 });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });

    await query(`UPDATE users SET mfa_enabled = true WHERE id = $1`, [req.user.id]);
    await audit({ userId: req.user.id, actionType: 'mfa_enabled', req });
    res.json({ message: 'MFA enabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify MFA' });
  }
};

exports.disableMfa = async (req, res) => {
  const { code } = req.body;
  try {
    const result = await query(`SELECT mfa_secret, mfa_enforced FROM users WHERE id = $1`, [req.user.id]);
    const user = result.rows[0];
    if (user.mfa_enforced) return res.status(403).json({ error: 'MFA is enforced for your account' });

    const valid = speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: code, window: 2 });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });

    await query(`UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1`, [req.user.id]);
    await audit({ userId: req.user.id, actionType: 'mfa_disabled', req });
    res.json({ message: 'MFA disabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const result = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash || '');
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, req.user.id]);
    await audit({ userId: req.user.id, actionType: 'password_changed', req });
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
};
