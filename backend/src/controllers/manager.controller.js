const { query } = require('../config/database');
const { subWeeks } = require('date-fns');

// GET /manager/team-status?date=YYYY-MM-DD
exports.getDayStatus = async (req, res) => {
  const { date } = req.query;
  const managerId = req.user.id;
  try {
    const teamsResult = await query(
      `SELECT t.id, t.name FROM manager_teams mt JOIN teams t ON t.id = mt.team_id WHERE mt.manager_id = $1`,
      [managerId]
    );
    const teamIds = teamsResult.rows.map(t => t.id);
    if (!teamIds.length) return res.json([]);

    const membersResult = await query(
      `SELECT DISTINCT ON (u.id) u.id, u.first_name, u.last_name, u.email, u.avatar_url,
              u.roster_working_days, t.id as team_id, t.name as team_name
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
       JOIN teams t ON t.id = ut.team_id
       WHERE ut.team_id = ANY($1) AND u.is_active = true AND u.deleted_at IS NULL
       ORDER BY u.id, t.parent_id NULLS FIRST, t.name`,
      [teamIds]
    );

    const entriesResult = await query(
      `SELECT de.user_id, de.status, de.submitted_at, de.id as entry_id,
              json_agg(wi.* ORDER BY wi.sort_order) FILTER (WHERE wi.id IS NOT NULL AND wi.deleted_at IS NULL) as work_items
       FROM daily_entries de
       LEFT JOIN work_items wi ON wi.entry_id = de.id AND wi.deleted_at IS NULL
       WHERE de.entry_date = $1 AND de.deleted_at IS NULL AND de.user_id = ANY($2)
       GROUP BY de.id`,
      [date, membersResult.rows.map(m => m.id)]
    );

    const entriesMap = {};
    entriesResult.rows.forEach(e => { entriesMap[e.user_id] = e; });

    const leaveResult = await query(
      `SELECT user_id FROM manager_user_settings WHERE leave_start <= $1 AND leave_end >= $1`,
      [date]
    );
    const onLeave = new Set(leaveResult.rows.map(r => r.user_id));

    // Check holidays for this date
    const holidayResult = await query(
      `SELECT state FROM public_holidays WHERE date = $1
       UNION SELECT NULL FROM non_working_dates WHERE date = $1`,
      [date]
    );
    const holidayStates = new Set(holidayResult.rows.map(r => r.state));
    const isCompanyHoliday = holidayStates.has(null);

    // Day of week for roster check (0=Sun, 1=Mon...6=Sat)
    // roster_working_days is MTWTFSS (0=Mon index)
    const dateObj = new Date(date + 'T12:00:00Z');
    const jsDay = dateObj.getUTCDay(); // 0=Sun
    const rosterIndex = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0 index

    const members = membersResult.rows.map(m => {
      const entry = entriesMap[m.id];
      const isOnLeave = onLeave.has(m.id);

      // Check if rostered off today
      const workingDays = m.roster_working_days || 'MTWTF__';
      const isRosteredOff = workingDays[rosterIndex] === '_';

      // Check state-specific holiday
      const userState = m.state;
      const isStateHoliday = userState ? holidayStates.has(userState) : false;
      const isHoliday = isCompanyHoliday || isStateHoliday;

      let status;
      if (isOnLeave) status = 'leave';
      else if (isHoliday) status = 'holiday';
      else if (isRosteredOff) status = 'rostered_off';
      else status = entry?.status || 'missing';

      return {
        userId: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        email: m.email,
        avatarUrl: m.avatar_url,
        teamId: m.team_id,
        teamName: m.team_name,
        status,
        submittedAt: entry?.submitted_at || null,
        entryId: entry?.entry_id || null,
        workItems: entry?.work_items || [],
        isStillEditable: entry?.status === 'submitted' && new Date() - new Date(entry.submitted_at) < 24 * 60 * 60 * 1000,
        isRosteredOff,
        isHoliday,
      };
    });

    res.json(members);
  } catch (err) {
    console.error('Day status error:', err);
    res.status(500).json({ error: 'Failed to fetch day status' });
  }
};

exports.getWeeklySummary = async (req, res) => {
  const { weekStart } = req.query;
  const managerId = req.user.id;
  try {
    const teamsResult = await query(
      `SELECT t.id FROM manager_teams mt JOIN teams t ON t.id = mt.team_id WHERE mt.manager_id = $1`,
      [managerId]
    );
    const teamIds = teamsResult.rows.map(t => t.id);
    if (!teamIds.length) return res.json({ users: [], summary: {} });

    const membersResult = await query(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.avatar_url
       FROM user_teams ut JOIN users u ON u.id = ut.user_id
       WHERE ut.team_id = ANY($1) AND u.is_active = true AND u.deleted_at IS NULL`,
      [teamIds]
    );
    const memberIds = membersResult.rows.map(m => m.id);
    if (!memberIds.length) return res.json({ users: [], summary: {} });

    const entriesResult = await query(
      `SELECT de.user_id, de.entry_date::text as entry_date, de.status,
              json_agg(wi.* ORDER BY wi.sort_order) FILTER (WHERE wi.id IS NOT NULL AND wi.deleted_at IS NULL) as work_items
       FROM daily_entries de
       LEFT JOIN work_items wi ON wi.entry_id = de.id AND wi.deleted_at IS NULL
       WHERE de.user_id = ANY($1) AND de.entry_date >= $2
         AND de.entry_date < ($2::date + interval '7 days') AND de.deleted_at IS NULL
       GROUP BY de.id ORDER BY de.entry_date`,
      [memberIds, weekStart]
    );

    const workTypeStats = {};
    const submittedByUser = {};
    entriesResult.rows.forEach(e => {
      if (!workTypeStats[e.user_id]) workTypeStats[e.user_id] = {};
      (e.work_items || []).forEach(wi => {
        const wt = wi.work_type || 'other';
        workTypeStats[e.user_id][wt] = (workTypeStats[e.user_id][wt] || 0) + (wi.time_minutes || 0);
      });
      if (e.status === 'submitted') submittedByUser[e.user_id] = (submittedByUser[e.user_id] || 0) + 1;
    });

    res.json({
      users: membersResult.rows.map(m => ({
        ...m,
        submittedDays: submittedByUser[m.id] || 0,
        workTypeStats: workTypeStats[m.id] || {},
        entries: entriesResult.rows.filter(e => e.user_id === m.id),
      })),
      weekStart,
    });
  } catch (err) {
    console.error('Weekly summary error:', err);
    res.status(500).json({ error: 'Failed to fetch weekly summary' });
  }
};

exports.getChartData = async (req, res) => {
  const { from, to } = req.query;
  const managerId = req.user.id;
  try {
    const teamsResult = await query(
      `SELECT t.id FROM manager_teams mt JOIN teams t ON t.id = mt.team_id WHERE mt.manager_id = $1`,
      [managerId]
    );
    const teamIds = teamsResult.rows.map(t => t.id);
    if (!teamIds.length) return res.json({});

    const memberResult = await query(
      `SELECT DISTINCT u.id FROM user_teams ut JOIN users u ON u.id = ut.user_id
       WHERE ut.team_id = ANY($1) AND u.is_active = true AND u.deleted_at IS NULL`,
      [teamIds]
    );
    const memberIds = memberResult.rows.map(m => m.id);
    if (!memberIds.length) return res.json({});

    const [workTypeData, dailyData, missedData] = await Promise.all([
      query(
        `SELECT wi.work_type, SUM(wi.time_minutes) as total_minutes
         FROM work_items wi JOIN daily_entries de ON de.id = wi.entry_id
         WHERE de.user_id = ANY($1) AND de.entry_date BETWEEN $2 AND $3
           AND de.status = 'submitted' AND wi.deleted_at IS NULL AND de.deleted_at IS NULL
         GROUP BY wi.work_type`,
        [memberIds, from, to]
      ),
      query(
        `SELECT entry_date::text, COUNT(*) FILTER (WHERE status = 'submitted') as submitted, COUNT(*) as total
         FROM daily_entries
         WHERE user_id = ANY($1) AND entry_date BETWEEN $2 AND $3 AND deleted_at IS NULL
         GROUP BY entry_date ORDER BY entry_date`,
        [memberIds, from, to]
      ),
      query(
        `SELECT u.id, u.first_name, u.last_name,
                COUNT(*) FILTER (WHERE de.status IS NULL OR de.status = 'draft') as missed
         FROM users u
         CROSS JOIN (SELECT generate_series($2::date, $3::date, '1 day'::interval)::date as d) dates
         LEFT JOIN daily_entries de ON de.user_id = u.id AND de.entry_date = dates.d AND de.deleted_at IS NULL
         WHERE u.id = ANY($1) AND EXTRACT(DOW FROM dates.d) BETWEEN 1 AND 5
         GROUP BY u.id, u.first_name, u.last_name`,
        [memberIds, from, to]
      ),
    ]);

    res.json({
      workTypeDistribution: workTypeData.rows,
      dailyActivity: dailyData.rows,
      missedDays: missedData.rows,
    });
  } catch (err) {
    console.error('Chart data error:', err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
};

exports.getMyTeams = async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, mt.include_child_teams, COUNT(ut.user_id) as member_count
       FROM manager_teams mt JOIN teams t ON t.id = mt.team_id
       LEFT JOIN user_teams ut ON ut.team_id = t.id
       WHERE mt.manager_id = $1
       GROUP BY t.id, mt.include_child_teams`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

// GET /manager/submissions/status?date=YYYY-MM-DD
// Submission status dashboard — Submitted / Not Submitted / Rostered Off / Holiday / Leave
exports.getSubmissionStatus = async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date required' });
  // Reuse getDayStatus logic — it already returns status with roster/holiday awareness
  req.query = { date };
  return exports.getDayStatus(req, res);
};
