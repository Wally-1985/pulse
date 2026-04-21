const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { audit } = require('../services/audit');

// Project status values
const VALID_STATUSES = ['high_priority_not_started', 'not_started', 'in_progress', 'on_hold', 'completed'];

// Health indicator derived from status, priority, last_activity_at
const getHealth = (project) => {
  if (project.status === 'completed') return 'completed';
  if (!project.last_activity_at) return 'red';
  const daysSinceActivity = (Date.now() - new Date(project.last_activity_at)) / (1000 * 60 * 60 * 24);
  if (project.status === 'high_priority_not_started' || (project.priority === 1 && daysSinceActivity > 3)) return 'red';
  if (daysSinceActivity > 7 || (project.priority <= 2 && daysSinceActivity > 5)) return 'amber';
  return 'green';
};

// GET /projects
exports.getProjects = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,
              u.first_name || ' ' || u.last_name as created_by_name,
              array_agg(DISTINCT pua.user_id) FILTER (WHERE pua.user_id IS NOT NULL) as assigned_user_ids,
              array_agg(DISTINCT au.first_name || ' ' || au.last_name) FILTER (WHERE au.id IS NOT NULL) as assigned_user_names,
              COUNT(DISTINCT pt.id) FILTER (WHERE pt.deleted_at IS NULL) as task_count,
              COUNT(DISTINCT pt.id) FILTER (WHERE pt.deleted_at IS NULL AND pt.status = 'completed') as completed_task_count
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN project_user_assignments pua ON pua.project_id = p.id
       LEFT JOIN users au ON au.id = pua.user_id
       LEFT JOIN project_tasks pt ON pt.project_id = p.id
       WHERE p.deleted_at IS NULL
       GROUP BY p.id, u.first_name, u.last_name
       ORDER BY
         CASE p.status WHEN 'high_priority_not_started' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 WHEN 'on_hold' THEN 3 ELSE 4 END,
         p.priority NULLS LAST, p.updated_at DESC`
    );
    const projects = result.rows.map(p => ({ ...p, health: getHealth(p) }));
    res.json(projects);
  } catch (err) { console.error('getProjects error:', err); res.status(500).json({ error: 'Failed to fetch projects' }); }
};

// GET /projects/:id
exports.getProject = async (req, res) => {
  try {
    const [proj, tasks, notes, assignments] = await Promise.all([
      query(`SELECT p.*, u.first_name || ' ' || u.last_name as created_by_name FROM projects p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1 AND p.deleted_at IS NULL`, [req.params.id]),
      query(`SELECT pt.*, u.first_name || ' ' || u.last_name as created_by_name FROM project_tasks pt LEFT JOIN users u ON u.id = pt.created_by WHERE pt.project_id = $1 AND pt.deleted_at IS NULL ORDER BY pt.sort_order, pt.created_at`, [req.params.id]),
      query(`SELECT pn.*, u.first_name || ' ' || u.last_name as created_by_name FROM project_notes pn LEFT JOIN users u ON u.id = pn.created_by WHERE pn.project_id = $1 ORDER BY pn.created_at DESC`, [req.params.id]),
      query(`SELECT pua.*, u.first_name, u.last_name, u.email FROM project_user_assignments pua JOIN users u ON u.id = pua.user_id WHERE pua.project_id = $1`, [req.params.id]),
    ]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json({ ...proj.rows[0], health: getHealth(proj.rows[0]), tasks: tasks.rows, notes: notes.rows, assignments: assignments.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch project' }); }
};

// POST /projects
exports.createProject = async (req, res) => {
  const { name, description, status, priority, assignedUserIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });
  const id = uuidv4();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO projects (id, name, description, status, priority, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, description || null, status || 'not_started', priority || null, req.user.id]
    );
    for (const userId of (assignedUserIds || [])) {
      await client.query(`INSERT INTO project_user_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, userId, req.user.id]);
    }
    await client.query('COMMIT');
    await audit({ userId: req.user.id, actionType: 'project_created', entityType: 'project', entityId: id, newValue: { name }, req });
    res.status(201).json({ id });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Failed to create project' }); }
  finally { client.release(); }
};

// PUT /projects/:id
exports.updateProject = async (req, res) => {
  const { name, description, status, priority, assignedUserIds } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE projects SET name = COALESCE($1, name), description = $2, status = COALESCE($3, status), priority = $4, updated_at = NOW() WHERE id = $5 AND deleted_at IS NULL`,
      [name, description ?? null, status, priority ?? null, req.params.id]
    );
    if (assignedUserIds !== undefined) {
      await client.query(`DELETE FROM project_user_assignments WHERE project_id = $1`, [req.params.id]);
      for (const userId of assignedUserIds) {
        await client.query(`INSERT INTO project_user_assignments (project_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [req.params.id, userId, req.user.id]);
      }
    }
    await client.query('COMMIT');
    await audit({ userId: req.user.id, actionType: 'project_updated', entityType: 'project', entityId: req.params.id, req });
    res.json({ message: 'Project updated' });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Failed to update project' }); }
  finally { client.release(); }
};

// DELETE /projects/:id (soft delete)
exports.deleteProject = async (req, res) => {
  try {
    await query(`UPDATE projects SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Project archived' });
  } catch (err) { res.status(500).json({ error: 'Failed to archive project' }); }
};

// ─── TASKS ───────────────────────────────────────────────────────────────────

// POST /projects/:id/tasks
exports.createTask = async (req, res) => {
  const { title, description, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = uuidv4();
  try {
    await query(
      `INSERT INTO project_tasks (id, project_id, title, description, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.params.id, title, description || null, dueDate || null, req.user.id]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: 'Failed to create task' }); }
};

// PUT /projects/:id/tasks/:taskId
exports.updateTask = async (req, res) => {
  const { title, description, status, dueDate } = req.body;
  try {
    await query(
      `UPDATE project_tasks SET title = COALESCE($1, title), description = $2, status = COALESCE($3, status), due_date = $4, updated_by = $5, updated_at = NOW() WHERE id = $6 AND project_id = $7 AND deleted_at IS NULL`,
      [title, description ?? null, status, dueDate ?? null, req.user.id, req.params.taskId, req.params.id]
    );
    res.json({ message: 'Task updated' });
  } catch (err) { res.status(500).json({ error: 'Failed to update task' }); }
};

// DELETE /projects/:id/tasks/:taskId
exports.deleteTask = async (req, res) => {
  try {
    await query(`UPDATE project_tasks SET deleted_at = NOW() WHERE id = $1 AND project_id = $2`, [req.params.taskId, req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete task' }); }
};

// ─── NOTES ───────────────────────────────────────────────────────────────────

// POST /projects/:id/notes
exports.createNote = async (req, res) => {
  const { noteText } = req.body;
  if (!noteText) return res.status(400).json({ error: 'Note text required' });
  const id = uuidv4();
  try {
    await query(
      `INSERT INTO project_notes (id, project_id, note_text, created_by) VALUES ($1, $2, $3, $4)`,
      [id, req.params.id, noteText, req.user.id]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: 'Failed to create note' }); }
};

// DELETE /projects/:id/notes/:noteId
exports.deleteNote = async (req, res) => {
  try {
    await query(`DELETE FROM project_notes WHERE id = $1 AND project_id = $2 AND created_by = $3`, [req.params.noteId, req.params.id, req.user.id]);
    res.json({ message: 'Note deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete note' }); }
};
