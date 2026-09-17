/**
 * Minimal structured logger — zero dependencies.
 *
 * Development: human-readable lines, same as before.
 * Production (NODE_ENV=production): one JSON object per line to stdout,
 * ready for any log shipper (CloudWatch, Datadog, Loki, Better Stack…).
 *
 * `console.*` calls elsewhere in the codebase keep working: in production
 * they are bridged through this logger so even old ad-hoc lines (morgan
 * fallbacks, library warnings) become structured JSON.
 */

const isProd = process.env.NODE_ENV === 'production';

// Original console methods, captured before the production bridge replaces
// console.* — emit() must write through these or it would recurse forever
// once the bridge is installed.
const origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? (isProd ? LEVELS.info : LEVELS.debug);

function serializeError(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.LOG_STACKS === 'false' ? undefined : err.stack,
      ...(err.code ? { code: err.code } : {}),
    };
  }
  if (typeof err === 'string') return { message: err };
  return err;
}

function emit(level, scope, msg, meta) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const ts = new Date().toISOString();

  if (!isProd) {
    const prefix = `${ts} ${scope}`;
    const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const out = `${prefix} ${msg}${suffix}`;
    if (level === 'error') origConsole.error(out);
    else if (level === 'warn') origConsole.warn(out);
    else origConsole.log(out);
    return;
  }

  const entry = {
    time: ts,
    level,
    scope,
    msg,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') origConsole.error(line);
  else if (level === 'warn') origConsole.warn(line);
  else process.stdout.write(line + '\n');
}

function makeLogger(scope) {
  return {
    debug: (msg, meta) => emit('debug', scope, msg, meta),
    info: (msg, meta) => emit('info', scope, msg, meta),
    warn: (msg, meta) => emit('warn', scope, msg, meta),
    error: (msg, meta) => emit('error', scope, msg, meta),
  };
}

const logger = makeLogger('server');
logger.child = makeLogger;

/**
 * Bridge console.log/warn/error through the logger in production so that
 * un-migrated call sites (and library output) still ship structured JSON.
 * dev console keeps its natural behavior.
 */
if (isProd) {
  const bridge = (method, level) => (...args) => {
    const [first, ...rest] = args;
    const msg = typeof first === 'string' ? first : JSON.stringify(first);
    let meta;
    if (rest.length) {
      // Support the common `console.x('msg', err)` pattern
      const [second] = rest;
      meta = second instanceof Error || typeof second === 'string'
        ? { error: serializeError(second) }
        : { extra: rest.map((a) => (a instanceof Error ? serializeError(a) : a)) };
    }
    emit(level, 'app', msg, meta);
  };
  console.log = bridge('log', 'info');
  console.warn = bridge('warn', 'warn');
  console.error = bridge('error', 'error');
}

module.exports = { logger, serializeError };
