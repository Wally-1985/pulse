const { query } = require('../config/database');

const audit = async ({
  userId = null,
  apiKeyId = null,
  role = null,
  actionType,
  entityType = null,
  entityId = null,
  oldValue = null,
  newValue = null,
  success = true,
  req = null,
}) => {
  try {
    const ip = req ? (req.ip || req.connection?.remoteAddress || null) : null;
    const userAgent = req ? (req.headers?.['user-agent'] || null) : null;

    await query(
      `INSERT INTO audit_logs 
        (user_id, api_key_id, role, action_type, entity_type, entity_id, old_value, new_value, success, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId,
        apiKeyId,
        role,
        actionType,
        entityType,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        success,
        ip,
        userAgent,
      ]
    );
  } catch (err) {
    // Audit failures should never break main operations
    console.error('Audit log error:', err);
  }
};

module.exports = { audit };
