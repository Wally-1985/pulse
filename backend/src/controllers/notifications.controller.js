const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

exports.getNotifications = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

exports.markRead = async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

exports.getUserSettings = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM manager_user_settings WHERE manager_id = $1 AND user_id = $2`,
      [req.user.id, req.params.userId]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

exports.updateUserSettings = async (req, res) => {
  const { userId } = req.params;
  const { workingDayHours, alertsEnabled, leaveStart, leaveEnd, leaveNote, missedDayThreshold } = req.body;
  try {
    await query(
      `INSERT INTO manager_user_settings
         (manager_id, user_id, working_day_hours, alerts_enabled, leave_start, leave_end, leave_note, missed_day_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (manager_id, user_id) DO UPDATE SET
         working_day_hours = COALESCE($3, manager_user_settings.working_day_hours),
         alerts_enabled = COALESCE($4, manager_user_settings.alerts_enabled),
         leave_start = $5,
         leave_end = $6,
         leave_note = $7,
         missed_day_threshold = COALESCE($8, manager_user_settings.missed_day_threshold),
         updated_at = NOW()`,
      [req.user.id, userId, workingDayHours, alertsEnabled, leaveStart || null, leaveEnd || null, leaveNote || null, missedDayThreshold]
    );
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// Called by reminder scheduler
const createNotification = async (userId, type, title, body, relatedEntityType = null, relatedEntityId = null) => {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, related_entity_type, related_entity_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, body, relatedEntityType, relatedEntityId]
  );
};

module.exports = { ...exports, createNotification };
