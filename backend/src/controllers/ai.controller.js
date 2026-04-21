const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const aiService = require('../services/ai');
const { audit } = require('../services/audit');

// GET /ai/settings
exports.getSettings = async (req, res) => {
  try {
    const cfg = await aiService.getConfig();
    // Never return the actual API key — just whether it's set
    res.json({
      endpoint: cfg.endpoint,
      deployment: cfg.deployment,
      apiVersion: cfg.apiVersion,
      enabled: cfg.enabled,
      hasApiKey: !!cfg.apiKey,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch AI settings' }); }
};

// PUT /ai/settings
exports.saveSettings = async (req, res) => {
  const { endpoint, deployment, apiKey, apiVersion, enabled } = req.body;
  try {
    const settings = [
      ['azure_openai_endpoint', endpoint || ''],
      ['azure_openai_deployment', deployment || ''],
      ['azure_openai_api_version', apiVersion || '2024-02-01'],
      ['azure_openai_enabled', enabled ? 'true' : 'false'],
    ];
    // Only update api_key if a new one is provided
    if (apiKey && apiKey !== '***') {
      settings.push(['azure_openai_api_key', apiKey]);
    }
    for (const [key, value] of settings) {
      await query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }
    await audit({ userId: req.user.id, actionType: 'ai_settings_updated', newValue: { endpoint, deployment, enabled }, req });
    res.json({ message: 'AI settings saved' });
  } catch (err) { res.status(500).json({ error: 'Failed to save AI settings' }); }
};

// POST /ai/settings/test
exports.testConnection = async (req, res) => {
  try {
    const result = await aiService.complete({
      prompt: 'Say "Pulse AI connected" and nothing else.',
      maxTokens: 20,
      userId: req.user.id,
      useCase: 'connection_test',
    });
    res.json({ success: true, response: result.content.trim() });
  } catch (err) {
    res.status(400).json({ error: 'Connection failed: ' + err.message });
  }
};

// GET /ai/prompt-templates
exports.getPromptTemplates = async (req, res) => {
  try {
    const result = await query(
      `SELECT pt.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM ai_prompt_templates pt
       LEFT JOIN users u ON u.id = pt.created_by
       ORDER BY pt.use_case, pt.version DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch templates' }); }
};

// POST /ai/prompt-templates
exports.createPromptTemplate = async (req, res) => {
  const { name, templateText, useCase } = req.body;
  if (!name || !templateText || !useCase) return res.status(400).json({ error: 'name, templateText and useCase required' });
  try {
    // Auto-increment version for same name
    const existing = await query(
      `SELECT MAX(version) as max_v FROM ai_prompt_templates WHERE name = $1`, [name]
    );
    const version = (existing.rows[0].max_v || 0) + 1;
    const id = uuidv4();
    await query(
      `INSERT INTO ai_prompt_templates (id, name, version, template_text, use_case, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, version, templateText, useCase, req.user.id]
    );
    res.status(201).json({ id, version });
  } catch (err) { res.status(500).json({ error: 'Failed to create template' }); }
};

// PUT /ai/prompt-templates/:id
exports.updatePromptTemplate = async (req, res) => {
  const { enabled } = req.body;
  try {
    await query(
      `UPDATE ai_prompt_templates SET enabled = $1, updated_at = NOW() WHERE id = $2`,
      [enabled, req.params.id]
    );
    res.json({ message: 'Template updated' });
  } catch (err) { res.status(500).json({ error: 'Failed to update template' }); }
};

// GET /ai/jobs
exports.getJobs = async (req, res) => {
  try {
    const result = await query(
      `SELECT j.*, u.first_name || ' ' || u.last_name as triggered_by_name
       FROM ai_jobs j LEFT JOIN users u ON u.id = j.triggered_by
       ORDER BY j.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch jobs' }); }
};
