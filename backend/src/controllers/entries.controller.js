const { query, getClient } = require('../config/database');
const { audit } = require('../services/audit');
const { v4: uuidv4 } = require('uuid');

const WORK_TYPES = ['project', 'bau_support', 'maintenance', 'lunch', 'other'];
const COLOURS = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'];

const getWorkingDayMinutes = async (userId) => {
  // Check manager override first, then system default
  const [managerResult, systemResult] = await Promise.all([
    query(`SELECT working_day_hours FROM manager_user_settings WHERE user_id = $1 LIMIT 1`, [userId]),
    query(`SELECT value FROM system_settings WHERE key = 'default_working_hours'`),
  ]);
  const hours = managerResult.rows[0]?.working_day_hours
    || parseFloat(systemResult.rows[0]?.value || '9');
  return Math.round(hours * 60);
};

const assignColours = (items) => {
  return items.map((item, idx) => ({ ...item, colour: COLOURS[idx % COLOURS.length] }));
};

// GET /entries/:date  (date = YYYY-MM-DD)
exports.getEntry = async (req, res) => {
  const { date } = req.params;
  const userId = req.query.userId || req.user.id;

  // Permission check: only managers can view others' entries
  if (userId !== req.user.id && !req.user.roles.includes('manager') && !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Cannot view other users\' entries' });
  }

  try {
    const entryResult = await query(
      `SELECT * FROM daily_entries WHERE user_id = $1 AND entry_date = $2 AND deleted_at IS NULL`,
      [userId, date]
    );

    if (!entryResult.rows.length) {
      return res.json(null);
    }

    const entry = entryResult.rows[0];

    const itemsResult = await query(
      `SELECT * FROM work_items WHERE entry_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC`,
      [entry.id]
    );

    // Use stored value for existing entries, current setting for new ones
    const workingMinutes = entry.working_day_minutes || await getWorkingDayMinutes(userId);

    res.json({
      id: entry.id,
      userId: entry.user_id,
      date: entry.entry_date,
      status: entry.status,
      submittedAt: entry.submitted_at,
      workingDayMinutes: workingMinutes,
      canEdit: entry.status === 'draft' ||
        (entry.status === 'submitted' && req.user.id === userId && new Date() - new Date(entry.submitted_at) < 24 * 60 * 60 * 1000) ||
        (req.user.roles.includes('manager') || req.user.roles.includes('admin')),
      workItems: assignColours(itemsResult.rows.map(i => ({
        id: i.id,
        detail: i.detail,
        workType: i.work_type,
        timeMinutes: i.time_minutes,
        isLocked: i.is_locked,
        sortOrder: i.sort_order,
        colour: i.colour,
      }))),
    });
  } catch (err) {
    console.error('Get entry error:', err);
    res.status(500).json({ error: 'Failed to fetch entry' });
  }
};

// POST /entries  - create or update
exports.upsertEntry = async (req, res) => {
  const { date, workItems } = req.body;
  const userId = req.user.id;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get or create entry
    let entryResult = await client.query(
      `SELECT * FROM daily_entries WHERE user_id = $1 AND entry_date = $2 AND deleted_at IS NULL`,
      [userId, date]
    );

    let entry;
    const isNew = !entryResult.rows.length;

    if (isNew) {
      const wdm = await getWorkingDayMinutes(userId);
      const insertResult = await client.query(
        `INSERT INTO daily_entries (user_id, entry_date, status, working_day_minutes) VALUES ($1, $2, 'draft', $3) RETURNING *`,
        [userId, date, wdm]
      );
      entry = insertResult.rows[0];
    } else {
      entry = entryResult.rows[0];

      // Check edit window for submitted entries
      if (entry.status === 'submitted') {
        const hoursElapsed = (new Date() - new Date(entry.submitted_at)) / (1000 * 60 * 60);
        if (hoursElapsed > 24 && !req.user.roles.includes('manager') && !req.user.roles.includes('admin')) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Entry can no longer be edited (24 hour window expired)' });
        }
      }
    }

    // Soft-delete existing work items
    await client.query(
      `UPDATE work_items SET deleted_at = NOW() WHERE entry_id = $1`,
      [entry.id]
    );

    // Insert new work items
    const workingMinutes = entry.working_day_minutes || await getWorkingDayMinutes(userId);
    const insertedItems = [];

    for (let i = 0; i < (workItems || []).length; i++) {
      const item = workItems[i];
      const result = await client.query(
        `INSERT INTO work_items (entry_id, detail, work_type, time_minutes, is_locked, sort_order, colour)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          entry.id,
          item.detail || '',
          item.workType || 'project',
          item.timeMinutes || 0,
          item.isLocked || false,
          i,
          COLOURS[i % COLOURS.length],
        ]
      );
      insertedItems.push(result.rows[0]);
    }

    // Update entry timestamp
    await client.query(
      `UPDATE daily_entries SET updated_at = NOW() WHERE id = $1`,
      [entry.id]
    );

    await client.query('COMMIT');

    await audit({
      userId,
      actionType: isNew ? 'entry_created' : 'entry_updated',
      entityType: 'daily_entry',
      entityId: entry.id,
      req,
    });

    res.json({
      id: entry.id,
      date: entry.entry_date,
      status: entry.status,
      workingDayMinutes: workingMinutes,
      workItems: assignColours(insertedItems.map(i => ({
        id: i.id,
        detail: i.detail,
        workType: i.work_type,
        timeMinutes: i.time_minutes,
        isLocked: i.is_locked,
        sortOrder: i.sort_order,
        colour: i.colour,
      }))),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upsert entry error:', err);
    res.status(500).json({ error: 'Failed to save entry' });
  } finally {
    client.release();
  }
};

// POST /entries/:id/submit
exports.submitEntry = async (req, res) => {
  const { id } = req.params;
  try {
    const entryResult = await query(
      `SELECT * FROM daily_entries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const entry = entryResult.rows[0];

    // Can't submit future dates
    const todayD = new Date(); const today = todayD.getUTCFullYear() + '-' + String(todayD.getUTCMonth()+1).padStart(2,'0') + '-' + String(todayD.getUTCDate()).padStart(2,'0');
    if (entry.entry_date > today) {
      return res.status(400).json({ error: 'Cannot submit a future-dated entry' });
    }

    // Validate: must have at least one work item
    const items = await query(
      `SELECT * FROM work_items WHERE entry_id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!items.rows.length) {
      return res.status(400).json({ error: 'Entry must have at least one work item' });
    }

    // Check for empty details
    const emptyItem = items.rows.find(i => !i.detail || !i.detail.trim());
    if (emptyItem) {
      return res.status(400).json({ error: 'All work items must have a description' });
    }

    await query(
      `UPDATE daily_entries SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await audit({
      userId: req.user.id,
      actionType: 'entry_submitted',
      entityType: 'daily_entry',
      entityId: id,
      req,
    });

    res.json({ message: 'Entry submitted', submittedAt: new Date() });
  } catch (err) {
    console.error('Submit entry error:', err);
    res.status(500).json({ error: 'Failed to submit entry' });
  }
};

// DELETE /entries/:id
exports.deleteEntry = async (req, res) => {
  const { id } = req.params;
  const isManager = req.user.roles.includes('manager') || req.user.roles.includes('admin');

  try {
    const entryResult = await query(
      `SELECT * FROM daily_entries WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (!entryResult.rows.length) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const entry = entryResult.rows[0];

    // Permission checks
    if (entry.user_id !== req.user.id && !isManager) {
      return res.status(403).json({ error: 'Not authorised' });
    }

    if (!isManager) {
      if (entry.status === 'submitted') {
        const hoursElapsed = (new Date() - new Date(entry.submitted_at)) / (1000 * 60 * 60);
        if (hoursElapsed > 24) {
          return res.status(403).json({ error: 'Delete window expired (24 hours)' });
        }
      }
    }

    await query(
      `UPDATE daily_entries SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [req.user.id, id]
    );

    await audit({
      userId: req.user.id,
      actionType: 'entry_deleted',
      entityType: 'daily_entry',
      entityId: id,
      req,
    });

    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete entry' });
  }
};

// GET /entries/week?userId=&weekStart=
exports.getWeekEntries = async (req, res) => {
  const { weekStart, userId } = req.query;
  const targetUserId = userId || req.user.id;
  const isManager = req.user.roles.includes('manager') || req.user.roles.includes('admin');

  if (targetUserId !== req.user.id && !isManager) {
    return res.status(403).json({ error: 'Not authorised' });
  }

  try {
    const result = await query(
      `SELECT de.id, de.user_id, de.entry_date::text as entry_date, de.status, de.submitted_at, de.created_at, de.updated_at,
        json_agg(wi.* ORDER BY wi.sort_order) FILTER (WHERE wi.id IS NOT NULL AND wi.deleted_at IS NULL) as work_items
       FROM daily_entries de
       LEFT JOIN work_items wi ON wi.entry_id = de.id
       WHERE de.user_id = $1 
         AND de.entry_date >= $2 
         AND de.entry_date < ($2::date + interval '7 days')
         AND de.deleted_at IS NULL
       GROUP BY de.id
       ORDER BY de.entry_date`,
      [targetUserId, weekStart]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch week entries' });
  }
};
