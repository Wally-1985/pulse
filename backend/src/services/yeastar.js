/**
 * Yeastar P-Series service
 * OAuth 2.0: POST credentials → access_token (30min) + refresh_token (24h)
 * Token is cached in memory and refreshed automatically.
 */

const axios = require('axios');
const { query } = require('../config/database');

const getBaseUrl = (host) => {
  // Strip any existing protocol/port then build with correct port
  const clean = host.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  return `http://${clean}:8088`;
};

// In-memory token cache
let tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

const getConfig = async () => {
  const result = await query(`SELECT key, value FROM system_settings WHERE key LIKE 'yeastar_%'`);
  const cfg = {};
  for (const row of result.rows) cfg[row.key] = row.value;
  return {
    host: cfg.yeastar_host || '',
    clientId: cfg.yeastar_client_id || '',
    clientSecret: cfg.yeastar_client_secret || '',
    enabled: cfg.yeastar_enabled === 'true',
  };
};

const isEnabled = async () => {
  const cfg = await getConfig();
  return cfg.enabled && cfg.host && cfg.clientId && cfg.clientSecret;
};

const HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' };

const getToken = async (cfg) => {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60000) {
    return tokenCache.accessToken;
  }

  // Try refresh token if available and not expired (within 24h)
  if (tokenCache.refreshToken && tokenCache.expiresAt > now - 23 * 60 * 60 * 1000) {
    try {
      const url = `${getBaseUrl(cfg.host)}/openapi/v1.0/refresh_token`;
      const res = await axios.post(url,
        { refresh_token: tokenCache.refreshToken },
        { headers: HEADERS, timeout: 10000 }
      );
      if (res.data.errcode === 0) {
        tokenCache = {
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token,
          expiresAt: now + 30 * 60 * 1000,
        };
        return tokenCache.accessToken;
      }
    } catch { /* fall through to full re-auth */ }
  }

  // Full authentication — username = clientId, password = clientSecret
  const url = `${getBaseUrl(cfg.host)}/openapi/v1.0/get_token`;
  let res;
  try {
    res = await axios.post(url,
      { username: cfg.clientId, password: cfg.clientSecret },
      { headers: HEADERS, timeout: 10000 }
    );
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[Yeastar] Auth request failed:', err.response?.status, detail);
    throw new Error('Auth request failed (' + (err.response?.status || 'no response') + '): ' + detail);
  }

  console.log('[Yeastar] Auth response:', JSON.stringify(res.data));

  if (res.data.errcode !== 0) {
    throw new Error('Yeastar auth failed: ' + res.data.errmsg);
  }

  tokenCache = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: now + 30 * 60 * 1000,
  };
  return tokenCache.accessToken;
};

// Fetch today's CDR for a given extension number
const getTodayCDR = async (extensionNumber) => {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.host || !cfg.clientId || !cfg.clientSecret) {
    throw new Error('Yeastar not configured');
  }

  const token = await getToken(cfg);

  // Build today's date range (local time)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const startTime = `${yyyy}-${mm}-${dd} 00:00:00`;
  const endTime = `${yyyy}-${mm}-${dd} 23:59:59`;

  const res = await axios.get(`${getBaseUrl(cfg.host)}/openapi/v1.0/cdr/list`, {
    params: { access_token: token, start_time: startTime, end_time: endTime, call_from: extensionNumber, page: 1, page_size: 100 },
    headers: HEADERS,
    timeout: 15000,
  });

  const fromCalls = (res.data.errcode === 0) ? (res.data.data || []) : [];

  const res2 = await axios.get(`${getBaseUrl(cfg.host)}/openapi/v1.0/cdr/list`, {
    params: { access_token: token, start_time: startTime, end_time: endTime, call_to: extensionNumber, page: 1, page_size: 100 },
    headers: HEADERS,
    timeout: 15000,
  });

  const toCalls = (res2.data.errcode === 0) ? (res2.data.data || []) : [];

  // Merge and deduplicate by uid
  const allCalls = [...fromCalls];
  for (const call of toCalls) {
    if (!allCalls.find(c => c.uid === call.uid)) allCalls.push(call);
  }

  // Sort by time desc, filter answered only
  return allCalls
    .filter(c => c.disposition === 'ANSWERED' && parseInt(c.talk_duration) > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
};

// Test connection with stored credentials
const testConnection = async () => {
  tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 }; // force re-auth
  const cfg = await getConfig();
  const token = await getToken(cfg);
  return !!token;
};

module.exports = { getConfig, isEnabled, getTodayCDR, testConnection };
