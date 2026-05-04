const { query } = require('../config/database');
const axios = require('axios');
const https = require('https');
const tls = require('tls');

// Node 22 + OpenSSL 3.5 rejects X25519MLKEM768 (post-quantum KEM used by Zendesk).
// Use a custom secureContext with explicit ecdhCurve to force classic key exchange.
function makeAgent() {
  const ctx = tls.createSecureContext({ ecdhCurve: 'P-256:P-384:P-521:X25519', minVersion: 'TLSv1.2' });
  return new https.Agent({ secureContext: ctx, minVersion: 'TLSv1.2', ecdhCurve: 'P-256:P-384:P-521:X25519' });
}

const zendeskRequest = async (subdomain, email, token, path) => {
  const auth = Buffer.from(email + '/token:' + token).toString('base64');
  const response = await axios.get('https://' + subdomain + '.zendesk.com/api/v2' + path, {
    httpsAgent: makeAgent(),
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: 10000,
  });
  return response.data;
};

exports.getSettings = async (req, res) => {
  try {
    const result = await query(
      "SELECT subdomain, email, enabled, CASE WHEN api_token IS NOT NULL AND api_token != '' THEN true ELSE false END as has_token FROM user_zendesk_settings WHERE user_id = $1",
      [req.user.id]
    );
    res.json(result.rows[0] || { subdomain: '', email: '', enabled: true, has_token: false });
  } catch (err) { console.error('Zendesk getSettings error:', err); res.status(500).json({ error: 'Failed to fetch Zendesk settings' }); }
};

exports.saveSettings = async (req, res) => {
  const { subdomain: rawSubdomain, email, apiToken, enabled } = req.body;
  const subdomain = (rawSubdomain || '').replace('.zendesk.com', '').replace('https://', '').replace('http://', '').trim();
  try {
    const sql = [
      'INSERT INTO user_zendesk_settings (user_id, subdomain, email, api_token, enabled, updated_at)',
      'VALUES ($1, $2, $3, $4, $5, NOW())',
      'ON CONFLICT (user_id) DO UPDATE SET subdomain = EXCLUDED.subdomain, email = EXCLUDED.email,',
      "api_token = CASE WHEN EXCLUDED.api_token != $6 THEN EXCLUDED.api_token ELSE user_zendesk_settings.api_token END,",
      'enabled = EXCLUDED.enabled, updated_at = NOW()',
    ].join(' ');
    await query(sql, [req.user.id, subdomain || '', email || '', apiToken || '', enabled !== false, '']);
    res.json({ message: 'Zendesk settings saved' });
  } catch (err) { console.error('Zendesk saveSettings error:', err); res.status(500).json({ error: 'Failed to save: ' + err.message }); }
};

exports.testConnection = async (req, res) => {
  try {
    const result = await query('SELECT subdomain, email, api_token FROM user_zendesk_settings WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length || !result.rows[0].api_token) return res.status(400).json({ error: 'Zendesk not configured' });
    const { subdomain, email, api_token } = result.rows[0];
    const data = await zendeskRequest(subdomain, email, api_token, '/users/me.json');
    res.json({ success: true, name: data.user && data.user.name, email: data.user && data.user.email });
  } catch (err) {
    const msg = (err.response && err.response.data && (err.response.data.description || err.response.data.error)) || err.message;
    res.status(400).json({ error: 'Connection failed: ' + msg });
  }
};

exports.getTodayActivity = async (req, res) => {
  try {
    const result = await query('SELECT subdomain, email, api_token, enabled FROM user_zendesk_settings WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length || !result.rows[0].enabled || !result.rows[0].api_token) return res.json({ configured: false, tickets: [] });
    const { subdomain, email, api_token } = result.rows[0];

    const meData = await zendeskRequest(subdomain, email, api_token, '/users/me.json');
    const zendeskUserId = meData.user && meData.user.id;
    if (!zendeskUserId) return res.json({ configured: true, tickets: [] });

    // Use requested date or default to today
    const dateStr = req.query.date || (() => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    })();
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Run targeted searches to find tickets this user specifically touched today
    const searches = [
      'type:ticket commenter:' + email + ' updated>=' + dateStr,   // commented on
      'type:ticket requester:' + email + ' created>=' + dateStr,   // created
      'type:ticket assignee:' + email + ' updated>=' + dateStr,    // assigned to them and updated today
      'type:ticket submitter:' + email + ' updated>=' + dateStr,   // submitted by them
    ];

    // Collect unique ticket IDs across all searches
    const ticketMap = {};
    for (const q of searches) {
      try {
        const searchData = await zendeskRequest(subdomain, email, api_token, '/search.json?query=' + encodeURIComponent(q) + '&sort_by=updated_at&sort_order=desc&per_page=50');
        for (const t of (searchData.results || [])) {
          ticketMap[t.id] = t;
        }
        await sleep(300);
      } catch(e) { console.error('Search error:', e.message); }
    }

    const ticketActivity = [];

    for (const ticket of Object.values(ticketMap)) {
      try {
        await sleep(200);
        const auditsData = await zendeskRequest(subdomain, email, api_token, '/tickets/' + ticket.id + '/audits.json');
        const activities = [];

        for (const audit of (auditsData.audits || [])) {
          if (audit.author_id !== zendeskUserId) continue;
          if (!audit.created_at || audit.created_at.substring(0,10) !== dateStr) continue;

          // Ticket created by this user (first audit)
          if (auditsData.audits[0] && auditsData.audits[0].id === audit.id) {
            activities.push('Ticket Created');
          }

          for (const event of (audit.events || [])) {
            if (event.type === 'Comment' && event.public === false) activities.push('Internal Note');
            if (event.type === 'Comment' && event.public === true) activities.push('Public Reply');
            if (event.type === 'Change' && event.field_name === 'status') {
              const toStatus = event.value;
              const fromStatus = event.previous_value;
              if (toStatus === 'solved') activities.push('Solved');
              else if (toStatus === 'open' && ['solved','closed'].includes(fromStatus)) activities.push('Reopened');
              else if (['new','open','pending','hold'].includes(toStatus)) activities.push('Status → ' + toStatus.charAt(0).toUpperCase() + toStatus.slice(1));
            }
            if (event.type === 'Change' && event.field_name === 'assignee_id') activities.push('Reassigned');
            if (event.type === 'Change' && event.field_name === 'priority') activities.push('Priority → ' + (event.value || 'none'));
            if (event.type === 'Change' && event.field_name === 'tags') activities.push('Tags Updated');
          }
        }

        const uniqueActivities = [...new Set(activities)];
        // Show ticket if user did something, OR if they are the assignee and it was updated today
        const isAssignee = ticket.assignee_id && String(ticket.assignee_id) === String(zendeskUserId);
        const updatedToday = ticket.updated_at && ticket.updated_at.substring(0,10) === dateStr;
        if (uniqueActivities.length > 0 || (isAssignee && updatedToday)) {
          ticketActivity.push({
            id: ticket.id,
            url: 'https://' + subdomain + '.zendesk.com/agent/tickets/' + ticket.id,
            subject: ticket.subject || 'Ticket #' + ticket.id,
            status: ticket.status,
            replyType: uniqueActivities.length > 0 ? uniqueActivities.join(' · ') : 'Assigned',
          });
        }
      } catch(e) { console.error('Audits error ticket ' + ticket.id + ':', e.message); }
    }

    res.json({ configured: true, tickets: ticketActivity });
  } catch (err) { console.error('Zendesk getTodayActivity error:', err.message); res.status(500).json({ error: 'Failed to fetch: ' + err.message }); }
};

// GET /manager/zendesk/today - aggregate Zendesk activity for all team members today
exports.getTeamTodayActivity = async (req, res) => {
  try {
    // Get all users in manager's teams
    const teamUsersResult = await query(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email as pulse_email
       FROM manager_teams mt
       JOIN teams t ON t.id = mt.team_id
       JOIN user_teams ut ON ut.team_id = t.id
       JOIN users u ON u.id = ut.user_id
       WHERE mt.manager_id = $1 AND u.deleted_at IS NULL AND u.is_active = true`,
      [req.user.id]
    );

    const teamUsers = teamUsersResult.rows;
    if (!teamUsers.length) return res.json({ tickets: [], members: [] });

    const todayLocal = new Date();
    const dateStr = todayLocal.getFullYear() + '-' +
      String(todayLocal.getMonth() + 1).padStart(2, '0') + '-' +
      String(todayLocal.getDate()).padStart(2, '0');

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const allTickets = [];
    const memberIndex = {};

    // Get Zendesk settings for each team member
    const memberIds = teamUsers.map(u => u.id);
    const zdSettingsResult = await query(
      `SELECT user_id, subdomain, email, api_token, enabled
       FROM user_zendesk_settings
       WHERE user_id = ANY($1) AND enabled = true AND api_token IS NOT NULL`,
      [memberIds]
    );

    const zdByUser = {};
    for (const s of zdSettingsResult.rows) zdByUser[s.user_id] = s;

    for (const user of teamUsers) {
      const zd = zdByUser[user.id];
      if (!zd) continue;

      try {
        // Get this user's Zendesk ID
        const meData = await zendeskRequest(zd.subdomain, zd.email, zd.api_token, '/users/me.json');
        const zendeskUserId = meData.user && meData.user.id;
        if (!zendeskUserId) continue;

        memberIndex[zendeskUserId] = { id: user.id, name: user.first_name + ' ' + user.last_name, email: user.pulse_email };

        // Search tickets this user commented on or created today
        const searches = [
          'type:ticket commenter:' + zd.email + ' updated>=' + dateStr,
          'type:ticket requester:' + zd.email + ' created>=' + dateStr,
        ];

        const ticketMap = {};
        for (const q of searches) {
          try {
            await sleep(300);
            const sd = await zendeskRequest(zd.subdomain, zd.email, zd.api_token,
              '/search.json?query=' + encodeURIComponent(q) + '&sort_by=updated_at&sort_order=desc&per_page=25');
            for (const t of (sd.results || [])) ticketMap[t.id] = t;
          } catch (e) { console.error('Manager ZD search error:', e.message); }
        }

        for (const ticket of Object.values(ticketMap)) {
          try {
            await sleep(200);
            const auditsData = await zendeskRequest(zd.subdomain, zd.email, zd.api_token,
              '/tickets/' + ticket.id + '/audits.json');
            const activities = [];

            for (const audit of (auditsData.audits || [])) {
              if (audit.author_id !== zendeskUserId) continue;
              if (!audit.created_at || audit.created_at.substring(0, 10) !== dateStr) continue;
              if (auditsData.audits[0] && auditsData.audits[0].id === audit.id) activities.push('Ticket Created');
              for (const event of (audit.events || [])) {
                if (event.type === 'Comment' && event.public === false) activities.push('Internal Note');
                if (event.type === 'Comment' && event.public === true) activities.push('Public Reply');
                if (event.type === 'Change' && event.field_name === 'status') {
                  const to = event.value; const from = event.previous_value;
                  if (['new', 'open', 'solved', 'pending'].includes(to))
                    activities.push('Status → ' + to.charAt(0).toUpperCase() + to.slice(1));
                  if (['solved', 'closed'].includes(from) && to === 'open') activities.push('Reopened');
                }
              }
            }

            const unique = [...new Set(activities)];
            if (unique.length > 0) {
              // Check if ticket already added by another team member
              const existing = allTickets.find(t => t.id === ticket.id && t.subdomain === zd.subdomain);
              if (existing) {
                // Add this member's activity to the existing ticket
                if (!existing.members.find(m => m.userId === user.id)) {
                  existing.members.push({ userId: user.id, name: user.first_name + ' ' + user.last_name, activities: unique });
                }
              } else {
                allTickets.push({
                  id: ticket.id,
                  subdomain: zd.subdomain,
                  url: 'https://' + zd.subdomain + '.zendesk.com/agent/tickets/' + ticket.id,
                  subject: ticket.subject || 'Ticket #' + ticket.id,
                  status: ticket.status,
                  priority: ticket.priority,
                  updatedAt: ticket.updated_at,
                  assigneeName: ticket.assignee_id ? null : null, // resolved client-side
                  members: [{ userId: user.id, name: user.first_name + ' ' + user.last_name, activities: unique }],
                  awaitingResponse: ticket.status === 'open' || ticket.status === 'new',
                });
              }
            }
          } catch (e) { console.error('Manager ZD audit error ticket ' + ticket.id + ':', e.message); }
        }
        await sleep(300);
      } catch (e) { console.error('Manager ZD user error ' + user.id + ':', e.message); }
    }

    // Sort by updatedAt desc
    allTickets.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      tickets: allTickets,
      date: dateStr,
      memberCount: teamUsers.length,
      configuredCount: Object.keys(zdByUser).length,
    });
  } catch (err) {
    console.error('getTeamTodayActivity error:', err.message);
    res.status(500).json({ error: 'Failed to fetch team Zendesk activity: ' + err.message });
  }
};
