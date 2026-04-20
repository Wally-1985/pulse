const { query, pool } = require('../config/database');
const { audit } = require('../services/audit');
const { resetTransporter } = require('../services/email');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

// ─── SETTINGS ──────────────────────────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const result = await query(`SELECT key, value FROM system_settings`);
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    // Don't expose smtp_pass
    delete settings.smtp_pass;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  const updates = req.body;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    }
    // Reset SMTP transporter if SMTP settings changed
    if (Object.keys(updates).some(k => k.startsWith('smtp_'))) {
      resetTransporter();
    }
    await audit({ userId: req.user.id, actionType: 'settings_updated', newValue: { keys: Object.keys(updates) }, req });
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// ─── HOLIDAYS ──────────────────────────────────────────────────────────────
exports.getHolidays = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM public_holidays ORDER BY date`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
};

exports.createHoliday = async (req, res) => {
  const { name, date } = req.body;
  try {
    const id = uuidv4();
    await query(`INSERT INTO public_holidays (id, name, date) VALUES ($1, $2, $3)`, [id, name, date]);
    res.status(201).json({ id });
  } catch (err) {
    if (err.constraint) return res.status(409).json({ error: 'Date already exists' });
    res.status(500).json({ error: 'Failed to create holiday' });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    await query(`DELETE FROM public_holidays WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
};

exports.getNonWorkingDates = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM non_working_dates ORDER BY date`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch non-working dates' });
  }
};

exports.createNonWorkingDate = async (req, res) => {
  const { name, date } = req.body;
  try {
    const id = uuidv4();
    await query(`INSERT INTO non_working_dates (id, name, date) VALUES ($1, $2, $3)`, [id, name, date]);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create non-working date' });
  }
};

exports.deleteNonWorkingDate = async (req, res) => {
  try {
    await query(`DELETE FROM non_working_dates WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
};

// ─── AUDIT LOGS ────────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  const { page = 1, limit = 50, userId, actionType, from, to, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = ['1=1'];
  const params = [];

  if (userId) { params.push(userId); conditions.push(`al.user_id = $${params.length}`); }
  if (actionType) { params.push(actionType); conditions.push(`al.action_type = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`al.created_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`al.created_at <= $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(al.action_type ILIKE $${params.length} OR al.entity_type ILIKE $${params.length})`); }

  const where = conditions.join(' AND ');

  try {
    const countResult = await query(
      `SELECT COUNT(*) FROM audit_logs al WHERE ${where}`, params
    );
    const result = await query(
      `SELECT al.*, u.email, u.first_name, u.last_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    res.json({
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      logs: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

exports.exportAuditLogs = async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await query(
      `SELECT al.created_at, u.email, al.role, al.action_type, al.entity_type,
              al.entity_id, al.success, al.ip_address
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ($1::date IS NULL OR al.created_at >= $1)
         AND ($2::date IS NULL OR al.created_at <= $2)
       ORDER BY al.created_at DESC`,
      [from || null, to || null]
    );

    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Success', 'IP'];
    const rows = result.rows.map(r => [
      r.created_at, r.email || '', r.role || '', r.action_type,
      r.entity_type || '', r.entity_id || '', r.success, r.ip_address || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
};

// ─── BACKUPS ───────────────────────────────────────────────────────────────
exports.runBackup = async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const filename = `pulse-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };

    execSync(
      `pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f ${filepath}`,
      { env }
    );

    await audit({ userId: req.user.id, actionType: 'backup_created', newValue: { filename }, req });
    res.json({ message: 'Backup created', filename });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed — ensure pg_dump is available' });
  }
};

exports.listBackups = async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list backups' });
  }
};

exports.downloadBackup = async (req, res) => {
  const { filename } = req.params;
  // Prevent path traversal
  const safe = path.basename(filename);
  const filepath = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup not found' });
  res.download(filepath, safe);
};

// ─── SYSTEM HEALTH ─────────────────────────────────────────────────────────
exports.getSystemHealth = async (req, res) => {
  const health = { db: false, smtp: false, backupCount: 0, lastBackup: null };
  try {
    await query('SELECT 1');
    health.db = true;
  } catch {}

  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql'));
      health.backupCount = files.length;
      if (files.length) {
        const latest = files.sort().reverse()[0];
        health.lastBackup = fs.statSync(path.join(BACKUP_DIR, latest)).birthtime;
      }
    }
  } catch {}

  res.json({ ...health, uptime: process.uptime(), nodeVersion: process.version, timestamp: new Date() });
};

// ─── API KEYS ──────────────────────────────────────────────────────────────
exports.getApiKeys = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, key_prefix, permissions, ip_restrictions, last_used_at, expires_at, created_at, revoked_at
       FROM api_keys ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
};

exports.createApiKey = async (req, res) => {
  const { name, permissions, ipRestrictions, expiresAt } = req.body;
  try {
    const rawKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 10);
    const id = uuidv4();

    await query(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, permissions, ip_restrictions, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, keyHash, keyPrefix, JSON.stringify(permissions || { read: true, write: false }),
       ipRestrictions || null, req.user.id, expiresAt || null]
    );

    await audit({ userId: req.user.id, actionType: 'api_key_created', entityType: 'api_key', entityId: id, req });
    // Return the raw key ONCE — it cannot be retrieved again
    res.status(201).json({ id, key: rawKey, message: 'Store this key securely — it will not be shown again.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
};

exports.revokeApiKey = async (req, res) => {
  try {
    await query(`UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`, [req.params.id]);
    await audit({ userId: req.user.id, actionType: 'api_key_revoked', entityType: 'api_key', entityId: req.params.id, req });
    res.json({ message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
};
