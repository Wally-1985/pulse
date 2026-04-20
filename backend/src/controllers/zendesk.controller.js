const { query } = require('../config/database');
const https = require('https');

const zendeskRequest = (subdomain, email, token, path) => {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(email + '/token:' + token).toString('base64');
    const options = {
      hostname: subdomain + '.zendesk.com',
      path: '/api/v2' + path,
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
          else reject(new Error('Zendesk API error ' + res.statusCode + ': ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Zendesk request timed out')); });
    req.end();
  });
};

exports.getSettings = async (req, res) => {
  try {
    const result = await query(
      'SELECT subdomain, email, enabled, CASE WHEN api_token IS NOT NULL AND api_token != \'\' THEN true ELSE false END as has_token FROM user_zendesk_settings WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || { subdomain: '', email: '', enabled: true, has_token: false });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch Zendesk settings' }); }
};

exports.saveSettings = async (req, res) => {
  const { subdomain, email, apiToken, enabled } = req.body;
  try {
    const sql = [
      "INSERT INTO user_zendesk_settings",
      "(user_id, subdomain, email, api_token, enabled, updated_at)",
      "VALUES ($1, $2, $3, $4, $5, NOW())",
      "ON CONFLICT (user_id) DO UPDATE SET",
      "  subdomain = EXCLUDED.subdomain,",
      "  email = EXCLUDED.email,",
      "  api_token = CASE WHEN EXCLUDED.api_token != $6 THEN EXCLUDED.api_token ELSE user_zendesk_settings.api_token END,",
      "  enabled = EXCLUDED.enabled,",
      "  updated_at = NOW()"
    ].join(" ");
    await query(sql, [req.user.id, subdomain || "", email || "", apiToken || "", enabled !== false, ""]);
    res.json({ message: "Zendesk settings saved" });
  } catch (err) {
    console.error("Zendesk saveSettings error:", err);
    res.status(500).json({ error: "Failed to save: " + err.message });
  }
};

exports.testConnection = async (req, res) => {
  try {
    const result = await query('SELECT subdomain, email, api_token FROM user_zendesk_settings WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length || !result.rows[0].api_token) return res.status(400).json({ error: 'Zendesk not configured' });
    const { subdomain, email, api_token } = result.rows[0];
    const data = await zendeskRequest(subdomain, email, api_token, '/users/me.json');
    res.json({ success: true, name: data.user?.name, email: data.user?.email });
  } catch (err) { res.status(400).json({ error: 'Connection failed: ' + err.message }); }
};

exports.getTodayActivity = async (req, res) => {
  try {
    const result = await query('SELECT subdomain, email, api_token, enabled FROM user_zendesk_settings WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length || !result.rows[0].enabled || !result.rows[0].api_token) return res.json({ configured: false, tickets: [] });
    const { subdomain, email, api_token } = result.rows[0];
    const meData = await zendeskRequest(subdomain, email, api_token, '/users/me.json');
    const zendeskUserId = meData.user?.id;
    if (!zendeskUserId) return res.json({ configured: true, tickets: [] });
    const todayLocal = new Date();
    const dateStr = todayLocal.getFullYear() + '-' + String(todayLocal.getMonth()+1).padStart(2,'0') + '-' + String(todayLocal.getDate()).padStart(2,'0');
    const searchQuery = encodeURIComponent('type:ticket commenter:' + email + ' updated>=' + dateStr);
    const searchData = await zendeskRequest(subdomain, email, api_token, '/search.json?query=' + searchQuery + '&sort_by=updated_at&sort_order=desc&per_page=25');
    const ticketActivity = [];
    for (const ticket of searchData.results || []) {
      try {
        const commentsData = await zendeskRequest(subdomain, email, api_token, '/tickets/' + ticket.id + '/comments.json');
        const todayComments = (commentsData.comments || []).filter(c => c.created_at?.substring(0,10) === dateStr && c.author_id === zendeskUserId);
        if (todayComments.length > 0) {
          const hasPublic = todayComments.some(c => c.public === true);
          const hasInternal = todayComments.some(c => c.public === false);
          const replyType = [hasPublic ? 'Public Reply' : null, hasInternal ? 'Internal Note' : null].filter(Boolean).join(' + ');
          ticketActivity.push({ id: ticket.id, url: 'https://' + subdomain + '.zendesk.com/agent/tickets/' + ticket.id, subject: ticket.subject || 'Ticket #' + ticket.id, status: ticket.status, replyType, commentCount: todayComments.length });
        }
      } catch (err) { console.error('Error fetching comments for ticket ' + ticket.id + ':', err.message); }
    }
    res.json({ configured: true, tickets: ticketActivity });
  } catch (err) {
    console.error('Zendesk getTodayActivity error:', err);
    res.status(500).json({ error: 'Failed to fetch Zendesk activity: ' + err.message });
  }
};
