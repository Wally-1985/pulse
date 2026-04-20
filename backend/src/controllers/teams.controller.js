const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { audit } = require('../services/audit');

exports.getTeams = async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, 
              COUNT(DISTINCT ut.user_id) as member_count,
              p.name as parent_name
       FROM teams t
       LEFT JOIN user_teams ut ON ut.team_id = t.id
       LEFT JOIN teams p ON p.id = t.parent_id
       WHERE t.deleted_at IS NULL
       GROUP BY t.id, p.name
       ORDER BY t.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

exports.createTeam = async (req, res) => {
  const { name, parentId, weekStart, missingThreshold } = req.body;
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO teams (id, name, parent_id, week_start, missing_threshold)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, parentId || null, weekStart || 'monday', missingThreshold || 50]
    );
    await audit({ userId: req.user.id, actionType: 'team_created', entityType: 'team', entityId: id, req });
    res.status(201).json({ id, message: 'Team created' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create team' });
  }
};

exports.updateTeam = async (req, res) => {
  const { id } = req.params;
  const { name, parentId, weekStart, missingThreshold } = req.body;
  try {
    await query(
      `UPDATE teams SET name = COALESCE($1, name), parent_id = $2,
       week_start = COALESCE($3, week_start), missing_threshold = COALESCE($4, missing_threshold),
       updated_at = NOW() WHERE id = $5`,
      [name, parentId || null, weekStart, missingThreshold, id]
    );
    await audit({ userId: req.user.id, actionType: 'team_updated', entityType: 'team', entityId: id, req });
    res.json({ message: 'Team updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    await query(`UPDATE teams SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    await audit({ userId: req.user.id, actionType: 'team_deleted', entityType: 'team', entityId: req.params.id, req });
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
};

exports.assignManager = async (req, res) => {
  const { teamId } = req.params;
  const { managerId, includeChildTeams = false } = req.body;
  try {
    await query(
      `INSERT INTO manager_teams (manager_id, team_id, include_child_teams) VALUES ($1, $2, $3)
       ON CONFLICT (manager_id, team_id) DO UPDATE SET include_child_teams = $3`,
      [managerId, teamId, includeChildTeams]
    );
    res.json({ message: 'Manager assigned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign manager' });
  }
};
