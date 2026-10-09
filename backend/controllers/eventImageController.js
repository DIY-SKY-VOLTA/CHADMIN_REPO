/**
 * Event image management — health, cleanup, R2 backup/replace, re-check.
 *
 * Why this exists: events share the contests' image schema
 * (image.primary / image.backup / image.gallery) but got NONE of the image
 * tooling — contests have health checks, R2 backup and repair workflows,
 * events had a bare drawer field. An audit found 11/12 events effectively
 * imageless (garbage media.hero values, an Eventbrite proxy URL) with zero
 * R2 backups. This controller closes that gap using the shared imagePipeline
 * util (same contract as the contest implementation).
 */
const sharp = require('sharp');
const Event = require('../models/Event');
const {
  unwrapMarkdownUrl,
  unwrapNextImageUrl,
  deSignUrl,
  checkImageUrl,
  probeImageUrl,
  fetchRemoteImage,
  uploadImageToR2,
  isPublicUrl,
  isPublicResponseUrl,
  FETCH_IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
} = require('../utils/imagePipeline');
const { logAction } = require('./activityLogController');

/* ── Status classification (mirrors contest classifyImageStatus) ───────────── */

function classifyImageStatus(event) {
  if (!event) return 'unknown';
  // primary.url OR the legacy media.hero fallback (Phase2's card builder reads
  // it when image.primary is empty — so a hero-only event HAS an image until
  // cleanup migrates it)
  const primaryUrl = event.image?.primary?.url || event.media?.hero || null;
  const hasBackup = !!event.image?.backup?.url;
  const lastStatus = event.image?.primary?.status;

  if (!primaryUrl) return 'no_image';
  if (lastStatus === 'broken' || lastStatus === 'error') return 'broken';
  if (!hasBackup) return 'no_backup';
  if (lastStatus === 'active' || lastStatus === 'healthy') return 'healthy';
  return 'unknown';
}

/** Heal a stored URL: unwrap markdown links + Next.js proxies, de-sign CDNs. */
function healEventUrl(raw) {
  let u = unwrapMarkdownUrl(raw);
  u = unwrapNextImageUrl(u);
  u = deSignUrl(u);
  return typeof u === 'string' ? u.trim() : u;
}

/**
 * Push a raw image buffer through the R2 pipeline and write the canonical
 * Mongo shape (primary + backup + variants) onto one event.
 *
 * Single source of truth for "an R2 image now belongs to this event" — shared
 * by backup / upload / upload-url / bulk-backup so all four stay identical.
 * The same helper exists on the contest side (processAndUploadImageToR2).
 */
async function persistR2ImageToEvent(eventId, rawBuffer) {
  const folder = `events/${eventId}`;
  const { r2Url, webpBuffer, metadata, sha256, avif } = await uploadImageToR2(rawBuffer, folder);

  const now = new Date();
  await Event.updateOne(
    { _id: eventId },
    {
      $set: {
        'image.primary.url': r2Url,
        'image.primary.source': 'r2',
        'image.primary.status': 'active',
        'image.primary.fileSize': webpBuffer.length,
        'image.primary.sha256': sha256,
        'image.primary.lastCheckedAt': now.toISOString(),
        'image.backup': {
          url: r2Url,
          source: 'r2',
          format: 'webp',
          status: 'active',
          createdAt: now,
        },
        ...(avif
          ? { 'image.primary.variants': { webp: { url: r2Url, size: webpBuffer.length }, avif } }
          : {}),
      },
    },
  );

  return { r2Url, webpBuffer, metadata, sha256, avif };
}

/** Fire-and-forget activity logging — never let it fail the image operation. */
async function logImageAction(req, payload) {
  try {
    await logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      ...payload,
    });
  } catch (err) {
    console.warn('Failed to log event image action:', err.message);
  }
}

/* ── GET /api/admin/events/images/health ───────────────────────────────────── */

/**
 * List events with image health info. Reads STORED statuses only (instant) —
 * live verification is the explicit re-check endpoint, same policy as the
 * contests page after its optimization.
 */
exports.getEventImagesHealth = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const filter = req.query.filter || 'all';
    const sortBy = req.query.sortBy || 'title';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'source.name': { $regex: search, $options: 'i' } },
        { eventType: { $regex: search, $options: 'i' } },
      ];
    }
    const typeFilter = (req.query.type || '').trim();
    if (typeFilter) query.eventType = typeFilter;
    const sourceFilter = (req.query.source || '').trim();
    if (sourceFilter) query['source.name'] = sourceFilter;

    const allImages = await Event.find(query)
      .select('title eventType slug image media status source')
      .lean();

    // Keys match classifyImageStatus() return values
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const stats = { total: allImages.length, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 };
    const filteredIds = [];

    for (const e of allImages) {
      const status = classifyImageStatus(e);
      if (stats[status] !== undefined) stats[status]++;

      const checkedAt = e.image?.primary?.lastCheckedAt
        ? new Date(e.image.primary.lastCheckedAt).getTime()
        : null;
      const isStale = !checkedAt || (now - checkedAt) > STALE_MS;
      if (isStale) stats.stale++;

      if (filter === 'all' || filter === status || (filter === 'stale' && isStale)) {
        filteredIds.push(e._id);
      }
    }

    // idsOnly: the list payload is discarded by the client (Deep Check and
    // "select all matching" only need the id list) — so skip the second query,
    // the document fetch and the pagination payload entirely.
    if (req.query.idsOnly === 'true') {
      const [eventTypes, sources] = await Promise.all([
        Event.distinct('eventType'),
        Event.distinct('source.name'),
      ]);
      return res.json({
        success: true,
        ids: filteredIds,
        pagination: { total: filteredIds.length, pages: 1 },
        stats,
        facets: {
          eventTypes: eventTypes.filter(Boolean).sort(),
          sources: sources.filter(Boolean).sort(),
        },
      });
    }

    const totalFiltered = filteredIds.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / limit));

    const sortField = sortBy === 'eventType' ? 'eventType'
      : sortBy === 'lastChecked' ? 'image.primary.lastCheckedAt'
      : 'title';
    const events = await Event.find({ _id: { $in: filteredIds } })
      .select('title eventType slug image media status source')
      .sort({ [sortField]: sortOrder, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const mapped = events.map((e) => {
      const primaryUrl = healEventUrl(e.image?.primary?.url || e.media?.hero || '') || null;
      // image.backup is the canonical OBJECT { url, source, format, status, createdAt }.
      const backupUrl = e.image?.backup?.url || null;
      const backupFormat = e.image?.backup?.format || null;
      const imageStatus = classifyImageStatus(e);
      // Shown in the details slide-over so an admin can see whether an image is
      // still being served by the original host or already lives in R2.
      let originalDomain = null;
      if (primaryUrl) {
        try { originalDomain = new URL(primaryUrl).hostname; } catch { /* not a parseable URL */ }
      }
      return {
        id: e._id,
        title: e.title || 'Untitled event',
        eventType: e.eventType || null,
        slug: e.slug || null,
        imageStatus,
        sourceUrl: e.source?.name || e.source?.url || null,
        source: e.source || null,
        image: {
          primaryUrl,
          backupUrl,
          backupFormat,
          alt: e.image?.alt || null,
          originalDomain,
          lastCheckedAt: e.image?.primary?.lastCheckedAt || null,
          status: e.image?.primary?.status || null,
          legacyHero: !e.image?.primary?.url && !!e.media?.hero,
        },
      };
    });

    const [eventTypes, sources] = await Promise.all([
      Event.distinct('eventType'),
      Event.distinct('source.name'),
    ]);

    res.json({
      success: true,
      events: mapped,
      pagination: { total: totalFiltered, pages },
      stats,
      facets: {
        eventTypes: eventTypes.filter(Boolean).sort(),
        sources: sources.filter(Boolean).sort(),
      },
    });
  } catch (error) {
    console.error('Event images health error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/recheck ─────────────────────────────────── */

/**
 * Live-verify ONE event's image URL (HEAD), persist the status, and heal the
 * stored URL in place if it was markdown-wrapped / proxied / signed.
 */
exports.recheckEventImage = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }

    const event = await Event.findById(eventId).select('title image media').lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const rawUrl = event.image?.primary?.url || event.media?.hero || null;
    if (!rawUrl) {
      return res.json({
        success: true,
        check: { status: 'no_image', dbStatus: 'no_image', reason: 'No image URL' },
      });
    }

    const url = healEventUrl(rawUrl);

    // Self-heal the stored field when the raw value was wrapped/proxied/signed
    if (url !== rawUrl) {
      const patch = event.image?.primary?.url
        ? { 'image.primary.url': url }
        : { 'media.hero': url, 'image.primary.url': url };
      await Event.updateOne({ _id: event._id }, { $set: patch }).catch(() => {});
    }

    const result = await checkImageUrl(url, 8000);
    const dbStatus = result.status === 'alive' ? 'healthy'
      : result.status === 'dead' ? 'broken' : 'error';

    await Event.updateOne(
      { _id: event._id },
      { $set: { 'image.primary.status': dbStatus, 'image.primary.lastCheckedAt': new Date().toISOString() } },
    ).catch(() => {});

    // Also probe content-type so a 200 HTML page (JotForm-style garbage) is
    // reported honestly rather than "alive"
    let contentType = null;
    if (result.status === 'alive') {
      const probe = await probeImageUrl(url, 8000);
      contentType = probe.contentType || null;
      if (contentType && !contentType.startsWith('image/')) {
        await Event.updateOne(
          { _id: event._id },
          { $set: { 'image.primary.status': 'broken', 'image.primary.lastCheckedAt': new Date().toISOString() } },
        ).catch(() => {});
      }
    }

    res.json({
      success: true,
      check: { ...result, dbStatus, healed: url !== rawUrl, healedUrl: url !== rawUrl ? url : null, contentType },
    });
  } catch (error) {
    console.error('Event image recheck error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/cleanup ─────────────────────────────────── */

/**
 * One-pass cleanup of pipeline garbage (the audit found real cases):
 *  1. Markdown-wrapped URLs → the href
 *  2. Next.js `_next/image?url=…` proxies → the upstream URL
 *  3. Signed CDN URLs (LinkedIn e=&t=, X-Amz-*) → de-signed
 *  4. Non-image URLs (200 but content-type text/html — e.g. a JotForm form in
 *     media.hero) → cleared + flagged
 *  5. Legacy media.hero promoted into image.primary when primary is empty
 * Every heal/persist is reported so the admin sees exactly what changed.
 */
exports.cleanupEventImages = async (req, res) => {
  try {
    const events = await Event.find({})
      .select('title image media')
      .lean();

    const changes = [];
    const CONCURRENCY = 8;
    const queue = events.map((e) => e);
    const findings = [];

    async function worker() {
      while (queue.length > 0) {
        const event = queue.shift();
        const raw = event.image?.primary?.url || event.media?.hero || null;
        if (!raw || typeof raw !== 'string') continue;

        const healed = healEventUrl(raw);
        let outcome = { eventId: event._id, title: event.title, before: raw.slice(0, 120) };

        if (healed !== raw) {
          outcome.action = 'healed';
          outcome.after = healed.slice(0, 120);
        }

        // Probe: is it actually an image?
        const probe = await probeImageUrl(healed, 8000);
        outcome.httpStatus = probe.statusCode;
        outcome.contentType = probe.contentType || null;

        const looksLikeImage = probe.status === 'alive'
          && (!probe.contentType || probe.contentType.startsWith('image/'));

        if (!looksLikeImage) {
          // Garbage (HTML page, dead link) — clear it and flag
          outcome.action = outcome.action === 'healed' ? 'healed_cleared' : 'cleared';
          outcome.after = null;
          await Event.updateOne(
            { _id: event._id },
            {
              $set: {
                'image.primary.status': 'broken',
                'image.primary.lastCheckedAt': new Date().toISOString(),
                ...(outcome.action === 'cleared' ? { 'media.hero': null } : {}),
              },
              ...(outcome.action === 'cleared' ? { $unset: { 'image.primary.url': '' } } : {}),
            },
          ).catch(() => { outcome.error = 'write failed'; });
        } else if (outcome.action === 'healed') {
          // Real image, healed URL — persist the healed form + promote to primary
          await Event.updateOne(
            { _id: event._id },
            {
              $set: {
                'image.primary.url': healed,
                'media.hero': null,
                'image.primary.lastCheckedAt': new Date().toISOString(),
              },
            },
          ).catch(() => { outcome.error = 'write failed'; });
        } else if (!event.image?.primary?.url && event.media?.hero) {
          // Healthy legacy hero with nothing to heal — promote it so the
          // dashboard and health views see it as a first-class primary
          outcome.action = 'promoted';
          outcome.after = healed.slice(0, 120);
          await Event.updateOne(
            { _id: event._id },
            { $set: { 'image.primary.url': healed, 'media.hero': null } },
          ).catch(() => { outcome.error = 'write failed'; });
        } else {
          outcome.action = outcome.action || 'ok';
        }

        findings.push(outcome);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

    changes.push(...findings);
    const summary = {
      scanned: events.length,
      healed: changes.filter((c) => c.action === 'healed' || c.action === 'healed_cleared').length,
      cleared: changes.filter((c) => c.action === 'cleared' || c.action === 'healed_cleared').length,
      promoted: changes.filter((c) => c.action === 'promoted').length,
      ok: changes.filter((c) => c.action === 'ok').length,
    };

    res.json({ success: true, summary, changes });
  } catch (error) {
    console.error('Event image cleanup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/backup ──────────────────────────────────── */

/**
 * Fetch an event's current primary image and push it through the R2 pipeline
 * (WebP + AVIF) — writes BOTH image.primary and image.backup. This is the
 * protection contests get (482 R2 backups) and events never had (0).
 */
exports.backupEventImage = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }

    const event = await Event.findById(eventId).select('title image media').lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const rawUrl = event.image?.primary?.url || event.media?.hero || null;
    if (!rawUrl) {
      return res.status(400).json({ success: false, message: 'Event has no image URL to back up — upload a replacement instead' });
    }

    const url = healEventUrl(rawUrl);
    const { buffer } = await fetchRemoteImage(url);
    const { r2Url, webpBuffer, sha256 } = await persistR2ImageToEvent(eventId, buffer);

    await logImageAction(req, {
      action: 'backup_event_image',
      description: `Backed up image to R2 for event: "${event.title || eventId}"`,
      targetId: eventId,
      targetType: 'event',
      metadata: { title: event.title, sha256, format: 'webp', sizeBytes: webpBuffer.length, sourceUrl: url },
    });

    res.json({
      success: true,
      message: 'Image backed up to R2',
      eventId,
      image: { url: r2Url, format: 'webp', sizeBytes: webpBuffer.length },
    });
  } catch (error) {
    console.error('Event image backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/bulk-backup ────────────────────────────── */

/**
 * Back up many events' primary images to R2 in one request. The frontend calls
 * this in batches so the progress modal can report live counts; each event is
 * processed independently so one bad URL can't sink the batch.
 */
exports.bulkBackupEventImages = async (req, res) => {
  try {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return res.status(400).json({ success: false, message: 'eventIds array is required' });
    }
    if (eventIds.length > 100) {
      return res.status(400).json({ success: false, message: 'eventIds is limited to 100 per batch' });
    }

    const events = await Event.find({ _id: { $in: eventIds } }).select('title image media').lean();
    const results = { success: 0, failed: 0, errors: [] };

    for (const event of events) {
      const raw = event.image?.primary?.url || event.media?.hero || null;
      if (!raw) {
        results.failed++;
        results.errors.push({ id: event._id, title: event.title, reason: 'No image URL' });
        continue;
      }
      if (event.image?.backup?.url) {
        results.failed++;
        results.errors.push({ id: event._id, title: event.title, reason: 'Already backed up' });
        continue;
      }

      try {
        const url = healEventUrl(raw);
        // SSRF guard: refuse private/loopback/link-local hosts
        if (!(await isPublicUrl(url))) throw new Error('Non-public image host');
        const { buffer } = await fetchRemoteImage(url);
        await persistR2ImageToEvent(event._id, buffer);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: event._id, title: event.title, reason: err.message });
      }
    }

    await logImageAction(req, {
      action: 'bulk_backup_event_images',
      description: `Bulk backed up ${results.success} event images`,
      targetId: 'bulk',
      targetType: 'system',
      metadata: { success: results.success, failed: results.failed, requested: eventIds.length },
    });

    res.json({
      success: true,
      message: `Backed up ${results.success} images. Failed: ${results.failed}.`,
      results,
    });
  } catch (error) {
    console.error('Bulk event image backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/upload (multipart) ──────────────────────── */

/** Upload a replacement image file for an event through the R2 pipeline. */
exports.uploadEventImage = async (req, res) => {
  try {
    const { eventId } = req.body;
    const file = req.file;

    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }
    if (!file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'Uploaded file must be an image' });
    }
    if (file.size > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image must be under 15MB' });
    }

    const event = await Event.findById(eventId).select('title').lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const { r2Url, webpBuffer, sha256 } = await persistR2ImageToEvent(eventId, file.buffer);

    await logImageAction(req, {
      action: 'upload_event_image',
      description: `Uploaded replacement image for event: "${event.title || eventId}"`,
      targetId: eventId,
      targetType: 'event',
      metadata: { title: event.title, sha256, format: 'webp', sizeBytes: webpBuffer.length },
    });

    res.json({
      success: true,
      message: 'Image uploaded and event updated successfully',
      eventId,
      image: { url: r2Url, format: 'webp', sizeBytes: webpBuffer.length },
    });
  } catch (error) {
    console.error('Event image upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/upload-url ─────────────────────────────── */

/**
 * Set an event's image from a working external URL: fetch it (SSRF-guarded,
 * size-capped, timeout-bounded), confirm it is really an image, then push it
 * through the same R2 pipeline file uploads use. This is the single biggest
 * usability win over the old file-only flow — an admin fixing 30 broken events
 * pastes 30 URLs instead of downloading and re-uploading 30 files.
 */
exports.uploadEventImageFromUrl = async (req, res) => {
  try {
    const { eventId, imageUrl } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }

    // Only http(s) — a data:/file: URL here would be an SSRF/local-read vector
    let parsed;
    try {
      parsed = new URL(imageUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported');
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid image URL. Must be a valid http(s) URL.' });
    }

    // SSRF guard: refuse private/loopback/link-local hosts before fetching
    if (!(await isPublicUrl(imageUrl))) {
      return res.status(400).json({ success: false, message: 'Image URL must point to a public host' });
    }

    const event = await Event.findById(eventId).select('title').lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    let response;
    try {
      response = await fetch(imageUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_IMAGE_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? `request timed out after ${FETCH_IMAGE_TIMEOUT_MS / 1000}s` : err.message;
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: ${reason}` });
    }

    if (!response.ok) {
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: HTTP ${response.status} ${response.statusText}` });
    }

    // Re-validate the FINAL url after redirects (redirect-to-private SSRF)
    if (!(await isPublicResponseUrl(response))) {
      return res.status(400).json({ success: false, message: 'Redirected image URL points to a non-public host' });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'URL does not point to an image file' });
    }

    const declaredLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > MAX_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: 'Image exceeds 15MB limit' });
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    if (rawBuffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Empty image data from URL' });
    }
    if (rawBuffer.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: 'Image exceeds 15MB limit' });
    }

    // uploadImageToR2 runs sharp on the buffer, which rejects non-images — but
    // fail with a clear 400 rather than an opaque 500.
    try {
      await sharp(rawBuffer).metadata();
    } catch {
      return res.status(400).json({ success: false, message: 'URL does not point to a valid image file' });
    }

    const { r2Url, webpBuffer, sha256 } = await persistR2ImageToEvent(eventId, rawBuffer);

    await logImageAction(req, {
      action: 'upload_event_image_url',
      description: `Fetched image from URL and backed up for event: "${event.title || eventId}"`,
      targetId: eventId,
      targetType: 'event',
      metadata: { title: event.title, sha256, format: 'webp', sizeBytes: webpBuffer.length, sourceUrl: imageUrl },
    });

    res.json({
      success: true,
      message: 'Image fetched from URL, uploaded and backed up to R2',
      eventId,
      image: { url: r2Url, format: 'webp', sizeBytes: webpBuffer.length },
    });
  } catch (error) {
    console.error('Event image URL upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── POST /api/admin/events/images/bulk-recheck ───────────────────────────── */

/**
 * Live-verify many events' image URLs at once (HEAD + content-type probe) and
 * persist each result. Backs the page's "Re-check selected" action and the
 * "Deep Check" full sweep. Concurrency-capped so a 100-event batch doesn't
 * open 100 sockets at the remote hosts at once.
 */
exports.bulkRecheckEventImages = async (req, res) => {
  try {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return res.status(400).json({ success: false, message: 'eventIds array is required' });
    }
    if (eventIds.length > 100) {
      return res.status(400).json({ success: false, message: 'eventIds is limited to 100 per batch' });
    }

    const events = await Event.find({ _id: { $in: eventIds } }).select('title image media').lean();
    const results = [];
    const CONCURRENCY = 8;
    const queue = events.slice();

    async function worker() {
      while (queue.length > 0) {
        const event = queue.shift();
        const raw = event.image?.primary?.url || event.media?.hero || null;

        if (!raw) {
          results.push({
            id: event._id, title: event.title,
            status: 'no_image', dbStatus: 'no_image', reason: 'No image URL',
          });
          continue;
        }

        const url = healEventUrl(raw);
        try {
          const result = await checkImageUrl(url, 8000);
          let dbStatus = result.status === 'alive' ? 'healthy'
            : result.status === 'dead' ? 'broken' : 'error';
          let contentType = null;

          if (result.status === 'alive') {
            const probe = await probeImageUrl(url, 8000);
            contentType = probe.contentType || null;
            // A 200 HTML page (a JotForm form captured as media.hero) is not
            // an image — report it as broken rather than "alive".
            if (contentType && !contentType.startsWith('image/')) dbStatus = 'broken';
          }

          // Heal the stored URL in place when it was wrapped/proxied/signed
          const patch = {};
          if (url !== raw) {
            patch['image.primary.url'] = url;
            patch['media.hero'] = null;
          }
          patch['image.primary.status'] = dbStatus;
          patch['image.primary.lastCheckedAt'] = new Date().toISOString();
          await Event.updateOne({ _id: event._id }, { $set: patch }).catch(() => {});

          results.push({
            id: event._id, title: event.title,
            status: result.status, dbStatus, contentType,
            reason: result.reason, healed: url !== raw,
          });
        } catch (err) {
          await Event.updateOne(
            { _id: event._id },
            { $set: { 'image.primary.status': 'error', 'image.primary.lastCheckedAt': new Date().toISOString() } },
          ).catch(() => {});
          results.push({
            id: event._id, title: event.title,
            status: 'error', dbStatus: 'error', reason: err.message,
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
    );

    res.json({ success: true, results });
  } catch (error) {
    console.error('Bulk event image recheck error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ── GET /api/admin/events/images/details ─────────────────────────────────── */

/**
 * Event context for the details slide-over: title, dates, location, organizer,
 * source, tags — everything an admin needs to judge what the right image is,
 * or to copy the context into the source site to find the original asset.
 */
exports.getEventImageDetails = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId query param is required' });
    }

    const event = await Event.findById(eventId)
      .select('title headline eventType shortSummary detailedOverview topics tags eventDates venue location organizer source status image')
      .lean();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const start = event.eventDates?.start ? new Date(event.eventDates.start) : null;
    const end = event.eventDates?.end ? new Date(event.eventDates.end) : null;
    const fmt = { month: 'short', day: 'numeric', year: 'numeric' };
    const dateLabel = !start ? null
      : (!end || start.toString() === end.toString())
        ? start.toLocaleDateString('en-US', fmt)
        : `${start.toLocaleDateString('en-US', fmt)} – ${end.toLocaleDateString('en-US', fmt)}`;

    res.json({
      success: true,
      event: {
        id: event._id,
        title: event.title || 'Untitled Event',
        eventType: event.eventType || null,
        summary: event.shortSummary || event.detailedOverview || null,
        topics: event.topics || [],
        tags: event.tags || [],
        dateLabel,
        location:
          event.location?.display
          || [event.venue?.address?.city, event.venue?.address?.country].filter(Boolean).join(', ')
          || event.venue?.venueName
          || null,
        venueName: event.venue?.venueName || null,
        organizer: event.organizer?.name || null,
        organizerWebsite: event.organizer?.website || null,
        status: event.status || null,
        source: event.source || null,
        image: {
          alt: event.image?.alt || null,
          currentUrl: event.image?.primary?.url || event.media?.hero || null,
          status: event.image?.primary?.status || null,
          lastCheckedAt: event.image?.primary?.lastCheckedAt || null,
          hasBackup: !!event.image?.backup?.url,
        },
      },
    });
  } catch (error) {
    console.error('Event image details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
