const { Pool } = require('pg');
require('dotenv').config();

// Force Node.js to use UTC for all date handling
process.env.TZ = 'UTC';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pulse_db',
  user: process.env.DB_USER || 'pulse_user',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Set timezone to UTC for every new connection
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC'");
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };