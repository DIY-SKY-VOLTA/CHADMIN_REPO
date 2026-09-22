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
const Event = require('../models/Event');
const {
  unwrapMarkdownUrl,
  unwrapNextImageUrl,
  deSignUrl,
  checkImageUrl,
  probeImageUrl,
  fetchRemoteImage,
  uploadImageToR2,
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

    const allImages = await Event.find(query)
      .select('title eventType slug image media status')
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

    const totalFiltered = filteredIds.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / limit));

    const sortField = sortBy === 'eventType' ? 'eventType'
      : sortBy === 'lastChecked' ? 'image.primary.lastCheckedAt'
      : 'title';
    const events = await Event.find({ _id: { $in: filteredIds } })
      .select('title eventType slug image media status')
      .sort({ [sortField]: sortOrder, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const mapped = events.map((e) => {
      const primaryUrl = healEventUrl(e.image?.primary?.url || e.media?.hero || '') || null;
      return {
        id: e._id,
        title: e.title || 'Untitled event',
        eventType: e.eventType || null,
        slug: e.slug || null,
        imageStatus: classifyImageStatus(e),
        sourceUrl: e.source?.name || e.source?.url || null,
        image: {
          primaryUrl,
          backupUrl: e.image?.backup?.url || null,
          alt: e.image?.alt || null,
          lastCheckedAt: e.image?.primary?.lastCheckedAt || null,
          status: e.image?.primary?.status || null,
          legacyHero: !e.image?.primary?.url && !!e.media?.hero,
        },
      };
    });

    const [eventTypes] = await Promise.all([Event.distinct('eventType')]);

    res.json({
      success: true,
      events: mapped,
      pagination: { total: totalFiltered, pages },
      stats,
      facets: { eventTypes: eventTypes.filter(Boolean).sort() },
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
    const folder = `events/${eventId}`;
    const { r2Url, webpBuffer, sha256, avif } = await uploadImageToR2(buffer, folder);

    const now = new Date();
    await Event.updateOne(
      { _id: event._id },
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
          ...(avif ? { 'image.primary.variants': { webp: { url: r2Url, size: webpBuffer.length }, avif } } : {}),
        },
      },
    );

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'backup_event_image',
        description: `Backed up image to R2 for event: "${event.title || eventId}"`,
        targetId: eventId,
        targetType: 'event',
        metadata: { title: event.title, sha256, format: 'webp', sizeBytes: webpBuffer.length, sourceUrl: url },
      });
    } catch (logErr) {
      console.warn('Failed to log event image backup:', logErr.message);
    }

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

    const folder = `events/${eventId}`;
    const { r2Url, webpBuffer, sha256, avif } = await uploadImageToR2(file.buffer, folder);

    const now = new Date();
    await Event.updateOne(
      { _id: event._id },
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
          ...(avif ? { 'image.primary.variants': { webp: { url: r2Url, size: webpBuffer.length }, avif } } : {}),
        },
      },
    );

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'upload_event_image',
        description: `Uploaded replacement image for event: "${event.title || eventId}"`,
        targetId: eventId,
        targetType: 'event',
        metadata: { title: event.title, sha256, format: 'webp', sizeBytes: webpBuffer.length },
      });
    } catch (logErr) {
      console.warn('Failed to log event image upload:', logErr.message);
    }

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
