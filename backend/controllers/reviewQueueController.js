/**
 * Review Queue Controller (admin-dashboard)
 *
 * Serves the ingest-blocked records worklist exported by the pipeline
 * (autoContestHopperai/export_worklist.py → data/outputs/human_queue.json).
 *
 * These records are NOT in MongoDB — they were refused by the pipeline's
 * hard-requirements gate (missing dates, product-page titles, ...) and wait
 * for a human decision here before being fixed/re-pushed. The file is the
 * pipeline's export contract:
 *   { generatedAt, count, note, items: [{ identity, title, eventType, slug,
 *     sourceUrl, bannerUrl, rawLocation, problems[], warnings[],
 *     suggestedActions[], lastStructuredAt }] }
 *
 * The file is read on demand (no polling loop) with an mtime cache, so the
 * endpoint stays cheap no matter how often the dashboard refreshes.
 */

const fs = require('fs');
const path = require('path');

// Where the pipeline drops its export. Override with WORKLIST_PATH; the
// default points at the sibling autoContestHopperai checkout.
const WORKLIST_PATH =
  process.env.WORKLIST_PATH ||
  path.resolve(__dirname, '../../../../autoContestHopperai/data/outputs/human_queue.json');

// mtime-keyed cache: re-read the file only when it changed.
let cache = { mtimeMs: -1, size: -1, payload: null };

function readWorklist() {
  let stat;
  try {
    stat = fs.statSync(WORKLIST_PATH);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error('Worklist not found');
      e.statusCode = 404;
      e.details =
        'human_queue.json does not exist yet. Run `python export_worklist.py` ' +
        'in the autoContestHopperai pipeline to generate it.';
      throw e;
    }
    e = new Error('Worklist unreadable');
    e.statusCode = 500;
    e.details = err.message;
    throw e;
  }

  if (
    cache.payload &&
    cache.mtimeMs === stat.mtimeMs &&
    cache.size === stat.size
  ) {
    return cache.payload;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(WORKLIST_PATH, 'utf-8'));
    const payload = {
      generatedAt: raw.generatedAt || null,
      note: raw.note || null,
      count: Array.isArray(raw.items) ? raw.items.length : 0,
      items: Array.isArray(raw.items) ? raw.items : [],
    };
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, payload };
    return payload;
  } catch (err) {
    const e = new Error('Worklist file is not valid JSON');
    e.statusCode = 500;
    e.details = err.message;
    throw e;
  }
}

/**
 * GET /api/admin/review-queue
 * Full worklist (the file is small — tens of items — so no pagination).
 */
const getReviewQueue = (req, res) => {
  try {
    const payload = readWorklist();
    res.json({ success: true, data: payload });
  } catch (err) {
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message, details: err.details });
  }
};

/**
 * GET /api/admin/review-queue/:identity
 * Single record by its pipeline identity key (URL or title-slug).
 * Identities are URLs — encodeURIComponent on the client side.
 */
const getReviewQueueItem = (req, res) => {
  try {
    const payload = readWorklist();
    const identity = req.params.identity;
    const item = payload.items.find((it) => it.identity === identity);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: 'Record not found in the current worklist' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message, details: err.details });
  }
};

module.exports = { getReviewQueue, getReviewQueueItem };
