const { query } = require('../config/database');
const yeastar = require('../services/yeastar');

// GET /yeastar/settings (admin)
exports.getSettings = async (req, res) => {
  try {
    const cfg = await yeastar.getConfig();
    res.json({
      host: cfg.host,
      clientId: cfg.clientId,
      hasClientSecret: !!cfg.clientSecret,
      enabled: cfg.enabled,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch Yeastar settings' }); }
};

// PUT /yeastar/settings (admin)
exports.saveSettings = async (req, res) => {
  const { host, clientId, clientSecret, enabled } = req.body;
  try {
    const settings = [
      ['yeastar_host', (host || '').trim()],
      ['yeastar_client_id', (clientId || '').trim()],
      ['yeastar_enabled', enabled ? 'true' : 'false'],
    ];
    if (clientSecret && clientSecret !== '***') {
      settings.push(['yeastar_client_secret', clientSecret.trim()]);
    }
    for (const [key, value] of settings) {
      await query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }
    res.json({ message: 'Yeastar settings saved' });
  } catch (err) { res.status(500).json({ error: 'Failed to save Yeastar settings' }); }
};

// POST /yeastar/settings/test (admin)
exports.testConnection = async (req, res) => {
  try {
    await yeastar.testConnection();
    res.json({ success: true, message: 'Connected successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Connection failed: ' + err.message });
  }
};

// GET /yeastar/today — today's calls for the current user's extension
exports.getTodayActivity = async (req, res) => {
  try {
    // Get user's extension number
    const userResult = await query(
      `SELECT extension_number FROM users WHERE id = $1`, [req.user.id]
    );
    const extensionNumber = userResult.rows[0]?.extension_number;

    if (!extensionNumber) {
      return res.json({ configured: false, reason: 'no_extension', calls: [] });
    }

    const enabled = await yeastar.isEnabled();
    if (!enabled) {
      return res.json({ configured: false, reason: 'not_configured', calls: [] });
    }

    const calls = await yeastar.getTodayCDR(extensionNumber);
    res.json({ configured: true, extension: extensionNumber, calls });
  } catch (err) {
    console.error('Yeastar getTodayActivity error:', err.message);
    res.status(500).json({ error: 'Failed to fetch call logs: ' + err.message });
  }
};
