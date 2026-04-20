const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { audit } = require('../services/audit');
const { sendEmail, emailTemplates } = require('../services/email');

// GET /users
exports.getUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.is_active,
              u.setup_status, u.mfa_enabled, u.created_at, u.last_name,
              array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles,
              array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as teams
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_teams ut ON ut.user_id = u.id
       LEFT JOIN teams t ON t.id = ut.team_id
       WHERE u.deleted_at IS NULL
       GROUP BY u.id
       ORDER BY u.last_name, u.first_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// GET /users/:id
exports.getUser = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url, u.is_active,
              u.setup_status, u.mfa_enabled, u.timezone, u.notification_preference,
              u.failed_login_attempts, u.locked_until, u.created_at,
              array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles,
              array_agg(DISTINCT ut.team_id) FILTER (WHERE ut.team_id IS NOT NULL) as team_ids
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_teams ut ON ut.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// POST /users
exports.createUser = async (req, res) => {
  const { email, firstName, lastName, roles = ['member'], teamIds = [], sendWelcomeEmail = true } = req.body;
  const client = await require('../config/database').getClient();

  try {
    await client.query('BEGIN');

    // Generate temp password
    const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const userId = uuidv4();
    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, email.toLowerCase(), passwordHash, firstName, lastName]
    );

    // Assign roles
    for (const roleName of roles) {
      const roleResult = await client.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
      if (roleResult.rows.length) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, roleResult.rows[0].id]
        );
      }
    }

    // Assign teams
    for (const teamId of teamIds) {
      await client.query(
        `INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, teamId]
      );
    }

    await client.query('COMMIT');

    if (sendWelcomeEmail) {
      const emailContent = emailTemplates.welcomeUser({ first_name: firstName, email }, tempPassword);
      await sendEmail({ to: email, ...emailContent });
    }

    await audit({
      userId: req.user.id,
      actionType: 'user_created',
      entityType: 'user',
      entityId: userId,
      newValue: { email, firstName, lastName, roles, teamIds },
      req,
    });

    res.status(201).json({ id: userId, message: 'User created' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
};

// PUT /users/:id
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, isActive, roles, teamIds, timezone, notificationPreference } = req.body;
  const client = await require('../config/database').getClient();

  try {
    await client.query('BEGIN');

    const oldResult = await client.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!oldResult.rows.length) return res.status(404).json({ error: 'User not found' });

    await client.query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       is_active = COALESCE($3, is_active), timezone = COALESCE($4, timezone),
       notification_preference = COALESCE($5, notification_preference), updated_at = NOW()
       WHERE id = $6`,
      [firstName, lastName, isActive, timezone, notificationPreference, id]
    );

    if (roles !== undefined) {
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
      for (const roleName of roles) {
        const roleResult = await client.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
        if (roleResult.rows.length) {
          await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [id, roleResult.rows[0].id]);
        }
      }
    }

    if (teamIds !== undefined) {
      await client.query(`DELETE FROM user_teams WHERE user_id = $1`, [id]);
      for (const teamId of teamIds) {
        await client.query(`INSERT INTO user_teams (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, teamId]);
      }
    }

    await client.query('COMMIT');

    await audit({
      userId: req.user.id,
      actionType: 'user_updated',
      entityType: 'user',
      entityId: id,
      req,
    });

    res.json({ message: 'User updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update user' });
  } finally {
    client.release();
  }
};

// DELETE /users/:id (soft)
exports.deleteUser = async (req, res) => {
  try {
    await query(
      `UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1`,
      [req.params.id]
    );
    await audit({
      userId: req.user.id,
      actionType: 'user_deleted',
      entityType: 'user',
      entityId: req.params.id,
      req,
    });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// POST /users/:id/unlock
exports.unlockUser = async (req, res) => {
  try {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [req.params.id]
    );
    await audit({ userId: req.user.id, actionType: 'user_unlocked', entityType: 'user', entityId: req.params.id, req });
    res.json({ message: 'User unlocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlock user' });
  }
};

// GET /profile
exports.getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, avatar_url, timezone, notification_preference, mfa_enabled
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// PUT /profile
exports.updateProfile = async (req, res) => {
  const { firstName, lastName, timezone, notificationPreference } = req.body;
  try {
    await query(
      `UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       timezone = COALESCE($3, timezone), notification_preference = COALESCE($4, notification_preference),
       updated_at = NOW() WHERE id = $5`,
      [firstName, lastName, timezone, notificationPreference, req.user.id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};
