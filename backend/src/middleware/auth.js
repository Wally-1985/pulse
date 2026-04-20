const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const crypto = require('crypto');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify session exists and is not revoked
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionResult = await query(
      `SELECT s.*, u.id as uid, u.email, u.first_name, u.last_name, u.is_active, u.setup_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
      [tokenHash]
    );

    if (!sessionResult.rows.length) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    const session = sessionResult.rows[0];
    if (!session.is_active) {
      return res.status(401).json({ error: 'Account disabled' });
    }

    // Update last used
    await query('UPDATE sessions SET last_used_at = NOW() WHERE id = $1', [session.id]);

    // Load user roles
    const rolesResult = await query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [session.uid]
    );
    const roles = rolesResult.rows.map(r => r.name);

    req.user = {
      id: session.uid,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name,
      roles,
      sessionId: session.id,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  const hasRole = allowedRoles.some(role => req.user.roles.includes(role));
  if (!hasRole) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

const isAdmin = requireRole('admin');
const isManager = requireRole('manager', 'admin');

module.exports = { authenticate, requireRole, isAdmin, isManager };
