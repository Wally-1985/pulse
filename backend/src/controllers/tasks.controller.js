const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /tasks/ongoing - tasks not completed as of a given date (defaults to today)
exports.getOngoing = async (req, res) => {
  try {
    const todayLocal = new Date();
    const todayStr = todayLocal.getFullYear() + '-' + String(todayLocal.getMonth()+1).padStart(2,'0') + '-' + String(todayLocal.getDate()).padStart(2,'0');
    const dateStr = req.query.date || todayStr;
    const isToday = dateStr === todayStr;
    const result = await query(
      `SELECT id, detail, work_type, created_date::text, source_entry_id, completed, dismissed, completed_at::text
       FROM ongoing_tasks
       WHERE user_id = $1
         AND dismissed = false
         AND created_date < $2
         AND (
           completed = false
           OR (
             completed = true
             AND completed_at IS NOT NULL
             AND completed_at > $2
           )
         )
       ORDER BY created_date ASC, created_at ASC`,
      [req.user.id, dateStr]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getOngoing error:', err);
    res.status(500).json({ error: 'Failed to fetch ongoing tasks' });
  }
};

// POST /tasks/ongoing - create a new ongoing task
exports.createFromWorkItem = async (req, res) => {
  const { detail, workType, sourceEntryId } = req.body;
  try {
    const todayLocal = new Date();
    const dateStr = todayLocal.getFullYear() + '-' + String(todayLocal.getMonth()+1).padStart(2,'0') + '-' + String(todayLocal.getDate()).padStart(2,'0');
    const id = uuidv4();
    await query(
      `INSERT INTO ongoing_tasks (id, user_id, detail, work_type, created_date, source_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.user.id, detail, workType || 'other', dateStr, sourceEntryId || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error('createFromWorkItem error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// PUT /tasks/ongoing/:id/complete
exports.complete = async (req, res) => {
  try {
    const todayLocal = new Date();
    const dateStr = todayLocal.getFullYear() + '-' + String(todayLocal.getMonth()+1).padStart(2,'0') + '-' + String(todayLocal.getDate()).padStart(2,'0');
    await query(
      `UPDATE ongoing_tasks SET completed = true, completed_at = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [dateStr, req.params.id, req.user.id]
    );
    res.json({ message: 'Task completed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete task' });
  }
};

// PUT /tasks/ongoing/:id/dismiss
exports.dismiss = async (req, res) => {
  try {
    await query(
      `UPDATE ongoing_tasks SET dismissed = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Task dismissed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to dismiss task' });
  }
};

// POST /tasks/ongoing/sync - sync work items completed state on entry submit
exports.syncFromEntry = async (req, res) => {
  const { entryId, workItems, entryDate } = req.body;
  try {
    for (const item of (workItems || [])) {
      const skipTypes = ['lunch', 'meeting'];
      if (skipTypes.includes(item.workType)) continue;
      if (item.detail && (item.detail.startsWith('Zendesk #') || item.detail.startsWith('Phone Call:'))) continue;
      const existing = await query(
        `SELECT id FROM ongoing_tasks WHERE user_id = $1 AND source_entry_id = $2 AND detail = $3`,
        [req.user.id, entryId, item.detail]
      );
      if (item.completed) {
        if (existing.rows.length) {
          await query(
            `UPDATE ongoing_tasks SET completed = true, completed_at = $1, updated_at = NOW() WHERE id = $2`,
            [entryDate, existing.rows[0].id]
          );
        } else {
          await query(
            `INSERT INTO ongoing_tasks (id, user_id, detail, work_type, created_date, source_entry_id, completed, completed_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [uuidv4(), req.user.id, item.detail, item.workType || 'other', entryDate, entryId, entryDate]
          );
        }
      } else {
        if (!existing.rows.length) {
          await query(
            `INSERT INTO ongoing_tasks (id, user_id, detail, work_type, created_date, source_entry_id, completed)
             VALUES ($1, $2, $3, $4, $5, $6, false)`,
            [uuidv4(), req.user.id, item.detail, item.workType || 'other', entryDate, entryId]
          );
        }
      }
    }
    res.json({ message: 'Synced' });
  } catch (err) {
    console.error('syncFromEntry error:', err);
    res.status(500).json({ error: 'Failed to sync tasks' });
  }
};
