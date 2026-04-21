/**
 * AI Service — Provider abstraction layer for Pulse
 * Supports Azure OpenAI. Designed to swap providers without changing feature code.
 * All calls are audited and gated by the azure_openai_enabled feature flag.
 */

const { query } = require('../config/database');
const { audit } = require('./audit');

// Get AI config from system_settings
const getConfig = async () => {
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key LIKE 'azure_openai_%'`
  );
  const cfg = {};
  for (const row of result.rows) cfg[row.key] = row.value;
  return {
    endpoint: cfg.azure_openai_endpoint || '',
    deployment: cfg.azure_openai_deployment || '',
    apiKey: cfg.azure_openai_api_key || '',
    apiVersion: cfg.azure_openai_api_version || '2024-02-01',
    enabled: cfg.azure_openai_enabled === 'true',
  };
};

// Check if AI is enabled and configured
const isEnabled = async () => {
  const cfg = await getConfig();
  return cfg.enabled && cfg.endpoint && cfg.apiKey && cfg.deployment;
};

// Core completion call — all AI features go through here
const complete = async ({ prompt, systemPrompt, maxTokens = 1000, userId = null, useCase = 'unknown' }) => {
  const cfg = await getConfig();

  if (!cfg.enabled) throw new Error('AI features are not enabled');
  if (!cfg.endpoint || !cfg.apiKey || !cfg.deployment) throw new Error('Azure OpenAI not fully configured');

  const url = cfg.endpoint + '/openai/deployments/' + cfg.deployment + '/chat/completions?api-version=' + cfg.apiVersion;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const crypto = require('crypto');
  const jobId = crypto.randomUUID();

  // Create job record
  await query(
    `INSERT INTO ai_jobs (id, job_type, status, triggered_by, input_json, started_at)
     VALUES ($1, $2, 'running', $3, $4, NOW())`,
    [jobId, useCase, userId, JSON.stringify({ prompt: prompt.substring(0, 500) })]
  );

  try {
    const https = require('https');
    const tls = require('tls');
    const axios = require('axios');

    const ctx = tls.createSecureContext({ ecdhCurve: 'P-256:P-384:P-521:X25519', minVersion: 'TLSv1.2' });
    const agent = new https.Agent({ secureContext: ctx, minVersion: 'TLSv1.2', ecdhCurve: 'P-256:P-384:P-521:X25519' });

    const response = await axios.post(url, {
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }, {
      httpsAgent: agent,
      headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const content = response.data.choices && response.data.choices[0] && response.data.choices[0].message
      ? response.data.choices[0].message.content : '';

    await query(
      `UPDATE ai_jobs SET status = 'completed', result_json = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify({ content: content.substring(0, 1000) }), jobId]
    );

    if (userId) {
      await audit({ userId, actionType: 'ai_completion', newValue: { useCase, jobId, tokens: response.data.usage } });
    }

    return { content, jobId, usage: response.data.usage };

  } catch (err) {
    await query(
      `UPDATE ai_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [err.message, jobId]
    );
    throw err;
  }
};

// Get latest enabled prompt template for a use_case
const getPromptTemplate = async (useCase) => {
  const result = await query(
    `SELECT * FROM ai_prompt_templates WHERE use_case = $1 AND enabled = true ORDER BY version DESC LIMIT 1`,
    [useCase]
  );
  return result.rows[0] || null;
};

// Render a template — replace {{placeholder}} with values
const renderTemplate = (templateText, vars) => {
  let rendered = templateText;
  for (const key of Object.keys(vars)) {
    rendered = rendered.replace(new RegExp('{{' + key + '}}', 'g'), vars[key] || '');
  }
  return rendered;
};

module.exports = { complete, isEnabled, getConfig, getPromptTemplate, renderTemplate };
