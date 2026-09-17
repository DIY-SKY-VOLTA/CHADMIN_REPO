const rateLimit = require('express-rate-limit');

// NOTE: when deployed behind a reverse proxy (nginx, Render, Railway, Fly…),
// set TRUST_PROXY=1 — server.js then enables `trust proxy` so req.ip is the
// real client IP instead of the proxy's (otherwise one actor can lock out
// everyone else).

const jsonHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests — please slow down and try again shortly.',
  });
};

/**
 * Global API limiter — a generous ceiling that only trips on abuse,
 * not normal admin usage (every page load fans out to several calls).
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // 5 req/s sustained per IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonHandler,
});

/**
 * Login limiter — brute-force protection.
 * 10 attempts / 15 min / IP is far above any human's typo budget
 * and makes online password guessing impractical.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Don't count successful logins against the budget
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Try again in 15 minutes.',
    });
  },
});

/**
 * Image-variant proxy limiter — this endpoint is the most expensive to
 * serve (Supabase signed-URL + full image fetch per hit), so cap it
 * tighter than the global limiter. A dashboard grid easily requests
 * dozens of images on load, so this still needs real headroom.
 */
const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    // Browsers expect an image; return a transparent pixel rather than JSON
    res.status(429).type('image/png').send(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      )
    );
  },
});

module.exports = { apiLimiter, loginLimiter, imageLimiter };
