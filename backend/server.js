const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ quiet: true }); // quiet: keep prod stdout pure JSON

const { logger, serializeError } = require('./utils/logger');

// In production this also bridges console.* → structured JSON, so it must be
// required before anything (morgan included) has a chance to write.
if (process.env.NODE_ENV === 'production') {
  require('./utils/logger');
}

const log = logger.child('boot');

const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const blogRoutes = require('./routes/blogRoutes');
const imageRoutes = require('./routes/imageRoutes');
const userRoutes = require('./routes/userRoutes');
const commentRoutes = require('./routes/commentRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const contestCategoryRoutes = require('./routes/contestCategoryRoutes');
const eventTypeRoutes = require('./routes/eventTypeRoutes');
const reviewQueueRoutes = require('./routes/reviewQueueRoutes');
const eventRoutes = require('./routes/eventRoutes');
const publishedRoutes = require('./routes/publishedRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const contestRoutes = require('./routes/contestRoutes');
const statsRoutes = require('./routes/statsRoutes');
const activityRoutes = require('./routes/activityRoutes');
const exportRoutes = require('./routes/exportRoutes');
const previewRoutes = require('./routes/previewRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const healthRoutes = require('./routes/healthRoutes');
const { apiLimiter } = require('./middleware/rateLimiters');

const app = express();

// Behind a reverse proxy (nginx/Render/Railway/Fly…)? Set TRUST_PROXY=1 so
// req.ip is the real client IP — without it, rate limiting keys on the proxy
// IP and one bad actor can lock everyone out.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL?.replace(/\/$/, ''),
  credentials: true
}));
// Cap request body size — the largest legitimate payloads are rich-text
// contest/blog bodies; 2mb covers them with headroom without allowing OOM abuse.
app.use(express.json({ limit: '2mb' }));

// Request logging:
//   dev → morgan's colored concise format (dev convenience only)
//   prod → morgan writes into the structured JSON bridge ('app' scope)
if (process.env.NODE_ENV === 'production') {
  app.use(morgan((tokens, req, res) => JSON.stringify({
    time: new Date().toISOString(),
    level: 'info',
    scope: 'http',
    msg: `${req.method} ${req.originalUrl} ${res.statusCode}`,
    meta: {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(tokens['response-time'](req, res)).toFixed(1),
      contentLength: tokens.res(req, res, 'content-length'),
    },
  })));
} else {
  app.use(morgan('dev'));
}

// Health checks — mounted before the rate limiter so probes are never 429'd
app.use('/api/admin', healthRoutes);

// Global API rate limit — a generous abuse ceiling, applied to everything below
app.use('/api', apiLimiter);

// Routes
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/blogs', blogRoutes);
app.use('/api/admin/images', imageRoutes);
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/comments', commentRoutes);
app.use('/api/admin/categories', categoryRoutes);
app.use('/api/admin/contest-categories', contestCategoryRoutes);
app.use('/api/admin/event-types', eventTypeRoutes);
app.use('/api/admin/events', eventRoutes);
app.use('/api/admin/review-queue', reviewQueueRoutes);
app.use('/api/admin/published', publishedRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/admin/contests', contestRoutes);
app.use('/api/admin/stats', statsRoutes);
app.use('/api/admin/activity', activityRoutes);
app.use('/api/admin/export', exportRoutes);
app.use('/api/admin/preview', previewRoutes);
app.use('/api/uploads', uploadRoutes);

// Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error('Unhandled request error', {
    error: serializeError(err),
    method: req.method,
    url: req.originalUrl,
  });
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// ---------------------------------------------------------------------------
// Database connection — with timeouts, pool settings, and retry with backoff.
// Prevents slow queries from exhausting the connection pool; retries with
// backoff so transient failures (e.g. DNS blips) don't leave the server
// running with no database. Mongoose does NOT retry the initial connect.
// ---------------------------------------------------------------------------
const connectDB = async (attempt = 1) => {
  if (shuttingDown) return; // don't reconnect while shutting down
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,   // fail fast if cluster is unresponsive (was default 30000)
      socketTimeoutMS: 45000,            // max 45s per query (was default 0 = no timeout)
      maxPoolSize: 10,                   // limit concurrent connections
      heartbeatFrequencyMS: 10000,       // check cluster health every 10s
    });
    log.info('MongoDB connected');
  } catch (err) {
    const delay = Math.min(1000 * 2 ** (attempt - 1), 15000); // 1s, 2s, 4s, ... max 15s
    log.warn('Database connection failed — retrying', {
      attempt,
      delayMs: delay,
      error: serializeError(err),
    });
    setTimeout(() => connectDB(attempt + 1), delay);
  }
};

// Log connectivity flips so DB blips are visible in prod logs/metrics
mongoose.connection.on('connected', () => log.info('MongoDB connection opened'));
mongoose.connection.on('disconnected', () => log.warn('MongoDB connection lost'));
mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));

const PORT = process.env.PORT || 5001;

// Distinguish "process listening" from "ready to serve" — the port opens
// immediately while the DB may still be retrying; /healthz reflects the rest.
const server = app.listen(PORT, () => {
  log.info(`HTTP server listening on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development',
    node: process.version,
  });
  connectDB();
});

// ---------------------------------------------------------------------------
// Graceful shutdown — SIGTERM (deploy/stop) and SIGINT (Ctrl+C):
// 1. stop accepting new connections
// 2. let in-flight requests finish (force-kill after the timeout)
// 3. close the MongoDB pool
// ---------------------------------------------------------------------------
const SHUTDOWN_TIMEOUT_SEC = Number(process.env.SHUTDOWN_TIMEOUT_SEC) || 30;

let shuttingDown = false;
async function shutdown(signal, exitCode) {
  if (shuttingDown) return; // second signal = shutdown already in progress
  shuttingDown = true;
  log.info(`Received ${signal} — shutting down gracefully`);

  const forceKillTimer = setTimeout(() => {
    log.error('Graceful shutdown timed out — forcing exit', { timeoutSec: SHUTDOWN_TIMEOUT_SEC });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_SEC * 1000);
  forceKillTimer.unref();

  try {
    await new Promise((resolve) => server.close(resolve));
    log.info('HTTP server closed — in-flight requests drained');
    await mongoose.connection.close();
    log.info('MongoDB connection closed — exiting cleanly');
    clearTimeout(forceKillTimer);
    process.exit(exitCode);
  } catch (err) {
    log.error('Error during shutdown', { error: serializeError(err) });
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// Fail loudly but with structured logs on unexpected faults
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', { error: serializeError(reason) });
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception — exiting', { error: serializeError(err) });
  // State is unknown after an uncaught exception; exit and let the
  // supervisor (PM2/Docker/systemd) restart a clean process.
  shutdown('uncaughtException', 1);
});
