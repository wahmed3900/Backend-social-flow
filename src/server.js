require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const connectDB  = require('./config/db');
const scheduler  = require('./services/scheduler');

const app = express();

// ── Database ───────────────────────────────────────────────────
connectDB();

// ── Security middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/posts',     require('./routes/posts'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/ai',        require('./routes/ai'));

// ── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// ── 404 handler ─────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 SocialFlow API running on port ${PORT}`);
  console.log(`   Env: ${process.env.NODE_ENV}`);
  scheduler.start(); // kick off the post-publishing cron job
});
