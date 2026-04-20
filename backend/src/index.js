require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const routes = require('./routes');
const { startScheduler } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── SECURITY ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ─── BODY PARSING ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── REQUEST LOGGING (dev) ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ─── ROUTES ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🫀 Pulse API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);

  // Start daily reminder scheduler
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
});

module.exports = app;
