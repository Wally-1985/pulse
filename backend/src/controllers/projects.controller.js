const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { audit } = require('../services/audit');

const getHealth = (project) => {
  if (project.status === 'completed') return 'completed';
  if (!project.last_activity_at) return 'red';
  const daysSinceActivity = (Date.now() - new Date(project.last_activity_at)) / (1000 * 60 * 60 * 24);
  if (project.status === 'high_priority_not_started' || (project.priority === 1 && daysSinceActivity > 3)) return 'red';
  if (daysSinceActivity > 7 || (project.priority <= 2 && daysSinceActivity > 5)) return 'amber';
  return 'green';
};

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
    res.json(result.rows.map(p => ({ ...p, health: getHealth(p) })));
  } catch (err) { console.error('getProjects:', err); res.status(500).json({ error: 'Failed to fetch projects' }); }
};

exports.getActiveProjects = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.name, p.status, p.priority, p.start_date, p.due_date,
              json_agg(json_build_object('id', pt.id, 'title', pt.title, 'status', pt.status, 'due_date', pt.due_date, 'start_date', pt.start_date)
                ORDER BY pt.sort_order, pt.created_at) FILTER (WHERE pt.id IS NOT NULL AND pt.deleted_at IS NULL AND pt.status != 'completed') as open_tasks
       FROM projects p
       LEFT JOIN project_tasks pt ON pt.project_id = p.id
       WHERE p.deleted_at IS NULL AND p.status IN ('in_progress', 'high_priority_not_started')
       GROUP BY p.id
       ORDER BY p.priority NULLS LAST, p.updated_at DESC`
    );
    res.json(result.rows.map(p => ({ ...p, open_tasks: p.open_tasks || [] })));
  } catch (err) { res.status(500).json({ error: 'Failed to fetch active projects' }); }
};

exports.getProject = async (req, res) => {
  try {
    const [proj, tasks, notes, assignments, history] = await Promise.all([
      query(`SELECT p.*, u.first_name || ' ' || u.last_name as created_by_name FROM projects p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1 AND p.deleted_at IS NULL`, [req.params.id]),
      query(`SELECT pt.*, u.first_name || ' ' || u.last_name as created_by_name, a.first_name || ' ' || a.last_name as assigned_to_name FROM project_tasks pt LEFT JOIN users u ON u.id = pt.created_by LEFT JOIN users a ON a.id = pt.assigned_to WHERE pt.project_id = $1 AND pt.deleted_at IS NULL ORDER BY pt.sort_order, pt.created_at`, [req.params.id]),
      query(`SELECT pn.*, u.first_name || ' ' || u.last_name as created_by_name FROM project_notes pn LEFT JOIN users u ON u.id = pn.created_by WHERE pn.project_id = $1 ORDER BY pn.created_at DESC`, [req.params.id]),
      query(`SELECT pua.*, u.first_name, u.last_name, u.email FROM project_user_assignments pua JOIN users u ON u.id = pua.user_id WHERE pua.project_id = $1`, [req.params.id]),
      query(`SELECT pdc.*, u.first_name || ' ' || u.last_name as changed_by_name FROM project_due_date_changes pdc LEFT JOIN users u ON u.id = pdc.changed_by WHERE pdc.project_id = $1 AND pdc.task_id IS NULL ORDER BY pdc.changed_at DESC LIMIT 10`, [req.params.id]),
    ]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json({ ...proj.rows[0], health: getHealth(proj.rows[0]), tasks: tasks.rows, notes: notes.rows, assignments: assignments.rows, dueDateHistory: history.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch project' }); }
};

exports.createProject = async (req, res) => {
  const { name, description, status, priority, assignedUserIds, startDate, dueDate } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });
  const id = uuidv4();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO projects (id, name, description, status, priority, start_date, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, name, description || null, status || 'not_started', priority || null, startDate || null, dueDate || null, req.user.id]
    );
    for (const userId of (assignedUserIds || [])) {
      await client.query(`INSERT INTO project_user_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, userId, req.user.id]);
    }
    await client.query('COMMIT');
    await audit({ userId: req.user.id, actionType: 'project_created', entityType: 'project', entityId: id, newValue: { name }, req });
    res.status(201).json({ id });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Failed to create project' }); }
  finally { client.release(); }
};

exports.updateProject = async (req, res) => {
  const { name, description, status, priority, assignedUserIds, startDate, dueDate, finishedDate, dueDateChangeReason } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT due_date FROM projects WHERE id = $1`, [req.params.id]);
    const oldDue = existing.rows[0]?.due_date ? existing.rows[0].due_date.toISOString().substring(0,10) : null;
    const newDue = dueDate !== undefined ? (dueDate || null) : oldDue;
    if (oldDue !== newDue && !dueDateChangeReason?.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A reason is required when changing or removing the due date' });
    }
    await client.query(
      `UPDATE projects SET name=COALESCE($1,name), description=$2, status=COALESCE($3,status), priority=$4,
       start_date=$5, due_date=$6, finished_date=$7, updated_at=NOW() WHERE id=$8 AND deleted_at IS NULL`,
      [name, description??null, status, priority??null, startDate??null, newDue, finishedDate??null, req.params.id]
    );
    if (oldDue !== newDue && dueDateChangeReason?.trim()) {
      await client.query(
        `INSERT INTO project_due_date_changes (id,project_id,old_due_date,new_due_date,reason,changed_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), req.params.id, oldDue, newDue, dueDateChangeReason.trim(), req.user.id]
      );
    }
    if (assignedUserIds !== undefined) {
      await client.query(`DELETE FROM project_user_assignments WHERE project_id=$1`, [req.params.id]);
      for (const uid of assignedUserIds) {
        await client.query(`INSERT INTO project_user_assignments (project_id,user_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [req.params.id, uid, req.user.id]);
      }
    }
    await client.query('COMMIT');
    await audit({ userId: req.user.id, actionType: 'project_updated', entityType: 'project', entityId: req.params.id, req });
    res.json({ message: 'Project updated' });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Failed to update project' }); }
  finally { client.release(); }
};

exports.deleteProject = async (req, res) => {
  try {
    await query(`UPDATE projects SET deleted_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Project archived' });
  } catch (err) { res.status(500).json({ error: 'Failed to archive project' }); }
};

exports.createTask = async (req, res) => {
  const { title, description, dueDate, startDate } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = uuidv4();
  try {
    await query(`INSERT INTO project_tasks (id,project_id,title,description,due_date,start_date,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.params.id, title, description||null, dueDate||null, startDate||null, req.user.id]);
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: 'Failed to create task' }); }
};

exports.updateTask = async (req, res) => {
  const { title, description, status, dueDate, startDate, finishedDate, dueDateChangeReason, assignedTo, notes } = req.body;
  try {
    const existing = await query(`SELECT due_date FROM project_tasks WHERE id=$1`, [req.params.taskId]);
    const oldDue = existing.rows[0]?.due_date ? existing.rows[0].due_date.toISOString().substring(0,10) : null;
    const newDue = dueDate !== undefined ? (dueDate||null) : oldDue;
    if (oldDue !== newDue && !dueDateChangeReason?.trim()) {
      return res.status(400).json({ error: 'A reason is required when changing or removing the due date' });
    }
    const finDate = status === 'completed' && !finishedDate ? new Date().toISOString().substring(0,10) : (finishedDate??null);
    await query(
      `UPDATE project_tasks SET title=COALESCE($1,title), description=$2, status=COALESCE($3,status),
       due_date=$4, start_date=$5, finished_date=$6, assigned_to=$7, notes=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10 AND project_id=$11 AND deleted_at IS NULL`,
      [title, description??null, status, newDue, startDate??null, finDate, assignedTo??null, notes??null, req.user.id, req.params.taskId, req.params.id]
    );
    if (oldDue !== newDue && dueDateChangeReason?.trim()) {
      await query(`INSERT INTO project_due_date_changes (id,project_id,task_id,old_due_date,new_due_date,reason,changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), req.params.id, req.params.taskId, oldDue, newDue, dueDateChangeReason.trim(), req.user.id]);
    }
    res.json({ message: 'Task updated' });
  } catch (err) {
    if (err.message?.includes('reason is required')) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to update task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    await query(`UPDATE project_tasks SET deleted_at=NOW() WHERE id=$1 AND project_id=$2`, [req.params.taskId, req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete task' }); }
};

exports.createNote = async (req, res) => {
  const { noteText } = req.body;
  if (!noteText) return res.status(400).json({ error: 'Note text required' });
  const id = uuidv4();
  try {
    await query(`INSERT INTO project_notes (id,project_id,note_text,created_by) VALUES ($1,$2,$3,$4)`, [id, req.params.id, noteText, req.user.id]);
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: 'Failed to create note' }); }
};

exports.deleteNote = async (req, res) => {
  try {
    await query(`DELETE FROM project_notes WHERE id=$1 AND project_id=$2 AND created_by=$3`, [req.params.noteId, req.params.id, req.user.id]);
    res.json({ message: 'Note deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete note' }); }
};

// PUT /projects/:id/tasks/:taskId/complete-from-entry
exports.completeTaskFromEntry = async (req, res) => {
  const { entryDate } = req.body;
  try {
    await query(
      `UPDATE project_tasks SET status='completed',
       finished_date=COALESCE(finished_date,$1),
       start_date=CASE WHEN start_date IS NULL THEN $2 ELSE start_date END,
       updated_by=$3, updated_at=NOW()
       WHERE id=$4 AND project_id=$5 AND deleted_at IS NULL`,
      [entryDate||new Date().toISOString().substring(0,10), entryDate||null, req.user.id, req.params.taskId, req.params.id]
    );
    res.json({ message: 'Task completed' });
  } catch (err) { res.status(500).json({ error: 'Failed to complete task' }); }
};

// PUT /projects/:id/start-from-entry
exports.startProjectFromEntry = async (req, res) => {
  const { entryDate } = req.body;
  try {
    await query(`UPDATE projects SET start_date=$1, updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL AND start_date IS NULL`,
      [entryDate||new Date().toISOString().substring(0,10), req.params.id]);
    res.json({ message: 'OK' });
  } catch (err) { res.status(500).json({ error: 'Failed to set start date' }); }
};
