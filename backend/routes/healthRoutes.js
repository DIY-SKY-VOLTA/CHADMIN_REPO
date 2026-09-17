const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * GET /api/admin/healthz
 *
 * Liveness + readiness probe:
 *   200 — process up AND MongoDB connected → serve traffic
 *   503 — process up but DB not ready (still booting, or DB down)
 *
 * Never touches the database itself — reads Mongoose's tracked state, so it
 * stays fast and cannot be made slow or deadlocked by a struggling DB.
 * Safe to leave unauthenticated: exposes only booleans and a version.
 */
router.get('/healthz', (req, res) => {
  const state = mongoose.connection.readyState;
  // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const connected = state === 1;

  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    checks: {
      process: 'up',
      database: connected ? 'up' : state === 2 ? 'connecting' : 'down',
    },
    uptimeSec: Math.floor(process.uptime()),
    version: process.env.APP_VERSION || 'unknown',
    time: new Date().toISOString(),
  });
});

module.exports = router;
