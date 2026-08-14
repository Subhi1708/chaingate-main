// server/index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
const express = require('express');

app.use(express.json()); // ✅ ADD THIS

app.use('/api/gate', require('./routes/gate'));

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // allow inline scripts in HTML files
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGIN
    : '*',
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { success: false, message: 'Too many requests — slow down' },
});

const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // max 5 QR generates per minute per IP
  message: { success: false, message: 'QR rate limit exceeded' },
});

app.use('/api/', apiLimiter);
app.use('/api/mobile/generate-qr', qrLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Large limit for base64 photo data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
}

// ── Static files (the 4 HTML pages) ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/admin',  require('../routes/admin'));
app.use('/api/gate',   require('../routes/gate'));
app.use('/api/mobile', require('../routes/mobile'));
app.use('/api/chain',  require('../routes/chain'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    ts: Date.now(),
  });
});

// ── Fallback: serve index (SPA style) ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   ChainGate Server — running on :${PORT}   ║
╚══════════════════════════════════════════╝

  Admin Panel  →  http://localhost:${PORT}/admin.html
  Gate Station →  http://localhost:${PORT}/gate.html
  Mobile App   →  http://localhost:${PORT}/mobile.html
  Blockchain   →  http://localhost:${PORT}/chain.html
  API Health   →  http://localhost:${PORT}/health
  `);
});

module.exports = app;