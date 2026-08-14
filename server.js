const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// ✅ Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Serve static HTML pages from /public
app.use(express.static(path.join(__dirname, 'public')));

// ✅ API Routes — all 4 modules
app.use('/mobile', require('./routes/mobile'));
app.use('/gate',   require('./routes/gate'));
app.use('/admin',  require('./routes/admin'));
app.use('/chain',  require('./routes/chain'));

// ✅ Root → redirect to hub page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chaingate-index.html'));
});

// ✅ Health check (returns uptime for status dot)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: Math.round(process.uptime()) });
});

// ✅ Server start
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`\n  Hub         → http://localhost:${PORT}/`);
  console.log(`  Admin Panel → http://localhost:${PORT}/chaingate-admin.html`);
  console.log(`  Gate Station→ http://localhost:${PORT}/chaingate-gate.html`);
  console.log(`  Mobile App  → http://localhost:${PORT}/chaingate-mobile.html`);
  console.log(`  Blockchain  → http://localhost:${PORT}/chaingate-chain.html\n`);
});