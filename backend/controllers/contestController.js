const Contest = require('../models/Contests');
const ContestDetail = require('../models/ContestDetail');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { logAction } = require('./activityLogController');
const {
  normalizeTags,
  mapCanonicalCategory,
  mapSubcategory,
} = require('../utils/tagNormalizer');

// ─── Markdown-wrapped URL guard ─────────────────────────────────────────────
// The external ingestion pipeline has (twice) stored raw markdown links as URL
// field values: "[https://site/x.png](https://site/x.png)" instead of the URL.
// A one-off cleanup script (Phase2 scripts/fixMarkdownWrappedUrls.js) repaired
// the stored data; this helper keeps every read path (list, re-check, backup)
// immune if ingestion ever writes it again. Extracts the href from
// "[label](href)"; passes anything else through unchanged.
const MD_LINK_RE = /^\s*\[([^\]]*)\]\(([^)]*)\)\s*$/;
function unwrapMarkdownUrl(raw) {
  if (typeof raw !== 'string') return raw;
  const m = raw.match(MD_LINK_RE);
  if (!m) return raw;
  const picked = (m[2] || '').trim() || (m[1] || '').trim();
  return /^https?:\/\//i.test(picked) ? picked : raw;
}

// ─── R2 Client ──────────────────────────────────────────────────────────────

let r2Client = null;

function getR2Client() {
  if (r2Client) return r2Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.warn('⚠️ R2 upload: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY not set');
    return null;
  }

  r2Client = new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

function getR2PublicBase() {
  return process.env.R2_PUBLIC_BASE || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME || 'ch-images';
}

// ─── Image Health Check Helpers ──────────────────────────────────────────────

const https = require('https');
const http = require('http');
const url = require('url');

const IMAGE_STATUS_CACHE = new Map();
// 30 min — URL health changes slowly. The sweep also persists statuses to
// Mongo (image.primary.status + lastCheckedAt), so the DB acts as the
// long-term cache and list views read stored statuses instead of re-verifying.
const CACHE_TTL = 30 * 60 * 1000;

function classifyImageStatus(contest) {
  if (!contest) return 'unknown';
  const hasPrimary = !!contest.image?.primary?.url;
  // image.backup is an OBJECT — a present-but-empty backup is NOT a backup
  const hasBackup = !!contest.image?.backup?.url;
  const lastStatus = contest.image?.primary?.status;

  if (!hasPrimary) return 'no_image';
  if (lastStatus === 'broken' || lastStatus === 'error') return 'broken';
  // no_backup is more actionable than unknown — surface it first
  if (!hasBackup) return 'no_backup';
  if (lastStatus === 'active' || lastStatus === 'healthy') return 'healthy';
  return 'unknown';
}

function checkImageUrl(imageUrl, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!imageUrl) {
      return resolve({ status: 'no_image', statusCode: null, reason: 'No image URL provided' });
    }

    try {
      const parsed = new URL(imageUrl);
      const fetcher = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'HEAD',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
      };

      const req = fetcher.request(options, (res) => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 400) {
          resolve({ status: 'alive', statusCode, reason: null });
        } else if (statusCode >= 400 && statusCode < 500) {
          resolve({ status: 'dead', statusCode, reason: `HTTP ${statusCode}` });
        } else {
          resolve({ status: 'server_error', statusCode, reason: `HTTP ${statusCode}` });
        }
        res.resume();
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'timeout', statusCode: null, reason: `Request timed out after ${Math.round(timeoutMs / 1000)}s` });
      });

      req.on('error', (err) => {
        const code = err.code;
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
          resolve({ status: 'dns_failed', statusCode: null, reason: `DNS lookup failed: ${err.message}` });
        } else if (code === 'ECONNREFUSED') {
          resolve({ status: 'connection_refused', statusCode: null, reason: 'Connection refused' });
        } else if (code === 'ECONNRESET') {
          resolve({ status: 'connection_reset', statusCode: null, reason: 'Connection reset' });
        } else {
          resolve({ status: 'error', statusCode: null, reason: err.message });
        }
      });

      req.end();
    } catch (err) {
      resolve({ status: 'error', statusCode: null, reason: `Invalid URL: ${err.message}` });
    }
  });
}

// ─── Health Dashboard ────────────────────────────────────────────────────────

exports.getImagesHealth = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const filter = req.query.filter || 'all';
    const sortBy = req.query.sortBy || 'title';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    const verify = req.query.verify === 'true';

    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'source.name': { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }
    // Facet filters — narrow the base query so stats reflect the same scope
    // as search does.
    const categoryFilter = (req.query.category || '').trim();
    if (categoryFilter) query.category = categoryFilter;
    const sourceFilter = (req.query.source || '').trim();
    if (sourceFilter) query['source.name'] = sourceFilter;

    // 1. Fetch all matching items minimally to compute accurate global stats and filter
    const allImages = await Contest.find(query).select('image').lean();

    // Live verification: DB statuses go stale (URLs rot, scrapers persist 'active').
    // Re-HEAD the primary URLs (cached) and persist the real status so Broken
    // reflects reality instead of the last scraper write.
    if (verify) {
      const VERIFY_CONCURRENCY = 20;
      for (let i = 0; i < allImages.length; i += VERIFY_CONCURRENCY) {
        await Promise.all(allImages.slice(i, i + VERIFY_CONCURRENCY).map(async (c) => {
          const rawUrl = c.image?.primary?.url;
          if (!rawUrl) return;
          const url = unwrapMarkdownUrl(rawUrl);
          if (!url) return;
          // Self-heal: if ingestion stored markdown-wrapped garbage, repair the
          // stored field here so the whole pipeline is clean going forward.
          if (url !== rawUrl) {
            await Contest.updateOne(
              { _id: c._id },
              { $set: { 'image.primary.url': url } }
            ).catch(() => {});
            c.image.primary.url = url;
          }
          const cached = IMAGE_STATUS_CACHE.get(url);
          if (cached && (Date.now() - cached.checkedAt) < CACHE_TTL) return;
          const result = await checkImageUrl(url, 8000);
          IMAGE_STATUS_CACHE.set(url, { ...result, checkedAt: Date.now() });
          const dbStatus = result.status === 'alive' ? 'healthy'
            : result.status === 'dead' ? 'broken' : 'error';
          await Contest.updateOne(
            { _id: c._id, 'image.primary.url': url },
            { $set: { 'image.primary.status': dbStatus, 'image.primary.lastCheckedAt': new Date().toISOString() } }
          ).catch(() => {}); // sweep must never fail the request
          c.image.primary.status = dbStatus;
        }));
      }
    }

    // Keys MUST match classifyImageStatus() return values (snake_case) —
    // camelCase keys here silently produced NaN counts (Broken/No Image = 0).
    // 'stale' is a freshness view, not a status: never-checked or last checked
    // more than 30 days ago. It overlaps status buckets by design.
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const stats = { total: allImages.length, healthy: 0, broken: 0, no_backup: 0, no_image: 0, unknown: 0, stale: 0 };
    const filteredIds = [];

    for (const c of allImages) {
      const status = classifyImageStatus(c);
      if (stats[status] !== undefined) stats[status]++;

      const checkedAt = c.image?.primary?.lastCheckedAt
        ? new Date(c.image.primary.lastCheckedAt).getTime()
        : null;
      const isStale = !checkedAt || (now - checkedAt) > STALE_MS;
      if (isStale) stats.stale++;

      if (filter === 'all' || filter === status || (filter === 'stale' && isStale)) {
        filteredIds.push(c._id);
      }
    }

    const totalFiltered = filteredIds.length;

    // idsOnly mode: return the full list of matching IDs (across all pages) so
    // the admin UI can offer "select all matching contests" in one click.
    if (req.query.idsOnly === 'true') {
      return res.json({
        success: true,
        ids: filteredIds,
        count: totalFiltered,
        stats,
      });
    }

    const pages = Math.max(1, Math.ceil(totalFiltered / limit));

    // 2. Fetch only the requested page from the filtered results
    const sortField = sortBy === 'source' ? 'source.name'
      : sortBy === 'lastChecked' ? 'image.primary.lastCheckedAt'
      : sortBy;
    const contests = await Contest.find({ _id: { $in: filteredIds } })
      .select('title category source link image status')
      .sort({ [sortField]: sortOrder, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const mapped = contests.map((c) => {
      const primaryUrl = unwrapMarkdownUrl(c.image?.primary?.url) || null;
      // image.backup is the canonical OBJECT { url, source, format, status, createdAt }.
      // Tolerate legacy string-shaped docs (pre-fix admin-dashboard writes) so the
      // health dashboard still displays them until the backfill script runs.
      const rawBackup = c.image?.backup;
      const backupUrl = (rawBackup && typeof rawBackup === 'object') ? (rawBackup.url || null) : (rawBackup || null);
      const backupFormat = (rawBackup && typeof rawBackup === 'object') ? (rawBackup.format || null) : null;
      const imageStatus = classifyImageStatus(c);
      let originalDomain = null;
      if (primaryUrl) {
        try { originalDomain = new URL(primaryUrl).hostname; } catch {}
      }
      return {
        id: c._id,
        title: c.title || 'Untitled Contest',
        category: c.category || null,
        source: c.source || null,
        link: c.link || null,
        image: {
          primaryUrl,
          backupUrl,
          backupFormat,
          alt: c.image?.alt || null,
          tag: c.image?.tag || null,
          originalDomain,
          lastCheckedAt: c.image?.primary?.lastCheckedAt || null,
          status: imageStatus,
        },
        imageStatus,
      };
    });

    // Filter dropdown options — distinct values are small (dozens) and the
    // collection is ~1k docs, so computing them per request is cheap.
    const [categories, sources] = await Promise.all([
      Contest.distinct('category'),
      Contest.distinct('source.name'),
    ]);

    res.json({
      success: true,
      contests: mapped,
      pagination: { total: totalFiltered, pages },
      stats,
      facets: {
        categories: categories.filter(Boolean).sort(),
        sources: sources.filter(Boolean).sort(),
      },
    });
  } catch (error) {
    console.error('Contest images health error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Single Recheck ──────────────────────────────────────────────────────────

exports.recheckImage = async (req, res) => {
  try {
    const { contestId, url: imageUrl, updateDb } = req.body;

    if (!contestId || !imageUrl) {
      return res.status(400).json({ success: false, message: 'contestId and url are required' });
    }

    const result = await checkImageUrl(imageUrl);

    if (updateDb) {
      const updateFields = {
        'image.primary.lastCheckedAt': new Date().toISOString(),
      };
      if (result.status === 'alive') {
        updateFields['image.primary.status'] = 'healthy';
      } else {
        updateFields['image.primary.status'] = result.status === 'dead' ? 'broken' : 'error';
      }
      await Contest.updateOne({ _id: contestId }, { $set: updateFields });
    }

    res.json({
      success: true,
      check: {
        status: result.status,
        // Dashboard badge config is keyed by the DB status — return both so the
        // row/detail panel can render without guessing
        dbStatus: result.status === 'alive' ? 'healthy'
          : result.status === 'dead' ? 'broken' : 'error',
        statusCode: result.statusCode,
        reason: result.reason,
      },
    });
  } catch (error) {
    console.error('Recheck image error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Bulk Recheck ────────────────────────────────────────────────────────────

exports.bulkRecheck = async (req, res) => {
  try {
    const { contestIds } = req.body;

    if (!contestIds || !Array.isArray(contestIds) || contestIds.length === 0) {
      return res.status(400).json({ success: false, message: 'contestIds array is required' });
    }

    const contests = await Contest.find({ _id: { $in: contestIds } })
      .select('title image')
      .lean();

    // Pooled (10 concurrent) instead of serial — a 1000-URL deep check would
    // take ~20+ min serially; pooled it's ~2-3 min, delivered in client-driven
    // batches so the UI can show live progress per request.
    const byId = new Map(contests.map((c) => [String(c._id), c]));
    const results = [];
    const CONCURRENCY = 10;
    const queue = contestIds.map(String);
    const lastCheckedIso = new Date().toISOString();

    async function recheckWorker() {
      while (queue.length > 0) {
        const id = queue.shift();
        const contest = byId.get(id);
        if (!contest) {
          results.push({ contestId: id, status: 'no_image', statusCode: null, reason: 'Not found' });
          continue;
        }
        const primaryUrl = unwrapMarkdownUrl(contest.image?.primary?.url);
        if (!primaryUrl) {
          results.push({ contestId: contest._id, status: 'no_image', statusCode: null, reason: 'No image URL' });
          continue;
        }
        // Fresh in-memory cache (shared with the health sweep) — skip the HTTP
        // hit but still report, so repeat deep checks are near-instant.
        const cached = IMAGE_STATUS_CACHE.get(primaryUrl);
        if (cached && (Date.now() - cached.checkedAt) < CACHE_TTL) {
          results.push({ contestId: contest._id, status: cached.status, statusCode: cached.statusCode ?? null, reason: cached.reason, cached: true });
          continue;
        }
        const result = await checkImageUrl(primaryUrl, 8000);
        IMAGE_STATUS_CACHE.set(primaryUrl, { ...result, checkedAt: Date.now() });
        const imageStatus = result.status === 'alive' ? 'healthy' : (result.status === 'dead' ? 'broken' : 'error');
        // A failed per-row write must never fail the whole batch
        await Contest.updateOne(
          { _id: contest._id },
          {
            $set: {
              'image.primary.lastCheckedAt': lastCheckedIso,
              'image.primary.status': imageStatus,
            },
          }
        ).catch(() => {});
        results.push({ contestId: contest._id, status: result.status, statusCode: result.statusCode, reason: result.reason });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => recheckWorker()));

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Bulk recheck error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── SSRF guard for URL-based image fetch ───────────────────────────────────

const net = require('net');
const dns = require('dns').promises;

function isPrivateIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local (incl. AWS metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                           // multicast + reserved
  return false;
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;      // fc00::/7 ULA
  if (/^fe[89ab]/.test(lower)) return true;                               // fe80::/10 link-local
  if (lower.startsWith('ff')) return true;                                // multicast
  if (lower.startsWith('2001:db8')) return true;                          // documentation range
  if (lower.startsWith('::ffff:')) return isPrivateIpv4(lower.split(':').pop()); // v4-mapped
  return false;
}

function isPrivateHost(hostname) {
  const ipv = net.isIP(hostname);
  if (ipv === 4) return isPrivateIpv4(hostname);
  if (ipv === 6) return isPrivateIpv6(hostname);
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
  return false;
}

/**
 * Reject URLs pointing at private/loopback/link-local hosts so the admin
 * URL-fetch endpoint can't be abused as an SSRF proxy to internal services.
 * Resolves hostnames (and fails closed when resolution fails).
 */
async function isPublicImageHost(hostname) {
  if (!hostname || isPrivateHost(hostname)) return false;
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateHost(a.address));
  } catch {
    return false; // fail closed — unresolvable host is not a public image host
  }
}

/** Validate a full http(s) URL string points at a public host. */
async function isPublicUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return await isPublicImageHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Re-validate the FINAL response URL after redirects so a public URL can't
 * silently redirect to an internal host.
 */
async function isPublicResponseUrl(response) {
  try {
    return await isPublicImageHost(new URL(response.url).hostname);
  } catch {
    return false;
  }
}

const FETCH_IMAGE_TIMEOUT_MS = 15000;

// ─── Upload ─────────────────────────────────────────────────────────────────

/**
 * Upload a replacement image for a contest to R2.
 *
 * Converts to WebP (best-effort AVIF), uploads to Cloudflare R2, and writes
 * the canonical image shape back to MongoDB.
 */
async function processAndUploadImageToR2(rawBuffer, contestId) {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 storage not configured. Contact administrator.');
  }

  const bucket = getBucketName();
  const publicBase = getR2PublicBase();
  const contestKey = `contests/${contestId}`;

  // Analyze the source first — format and dimensions drive the processing below.
  const metadata = await sharp(rawBuffer).metadata();

  // Cap the output at MAX_OUTPUT_DIMENSION. Web pages never need more than
  // this (imageProxyController's "original" variant is 1600px), and encoding
  // huge sources (e.g. 6000px print-res logos) makes AVIF take 60+ seconds —
  // long enough for platform request timeouts to kill the upload.
  const MAX_OUTPUT_DIMENSION = 1600;

  // SVG sources must be rasterized at high density or they come out blurry
  // (sharp defaults to 72dpi). Small raster sources (<200px) get gently
  // upscaled 2–4x so they don't look soft next to properly sized images.
  const MIN_DIMENSION = 200;
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const hasDims = width > 0 && height > 0;
  const longest = Math.max(width, height);
  const upscale = hasDims
    ? Math.max(1, Math.min(4, Math.ceil(MIN_DIMENSION / longest)))
    : 1;
  const downscale = hasDims && longest > MAX_OUTPUT_DIMENSION
    ? MAX_OUTPUT_DIMENSION / longest
    : 1;
  const scaleFactor = upscale * downscale;
  const needsTransform = metadata.format === 'svg' || scaleFactor !== 1;

  // One shared transform: render SVGs at high density, then fit the result
  // inside the target box (preserves aspect ratio, never crops).
  const targetBox = hasDims
    ? {
        width: Math.max(1, Math.round(width * scaleFactor)),
        height: Math.max(1, Math.round(height * scaleFactor)),
        fit: 'inside',
        kernel: 'lanczos3',
        withoutEnlargement: false,
      }
    : undefined;

  let pipeline = sharp(rawBuffer, { density: 300 });
  if (needsTransform && targetBox) {
    pipeline = pipeline.resize(targetBox);
  }

  const webpBuffer = await pipeline
    .webp({ quality: 85, effort: 4 })
    .toBuffer();

  // Upload WebP to R2
  const webpKey = `${contestKey}/primary.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: webpKey,
    Body: webpBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const r2Url = `${publicBase}/${webpKey}`;

  // Best-effort AVIF conversion
  let avifBuffer = null;
  let avifKey = null;
  try {
    avifBuffer = await sharp(rawBuffer, { density: 300 })
      .resize(needsTransform && targetBox ? targetBox : undefined)
      .avif({ quality: 55, effort: 4 })
      .toBuffer();
    avifKey = `${contestKey}/primary.avif`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: avifKey,
      Body: avifBuffer,
      ContentType: 'image/avif',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (avifErr) {
    console.warn(`AVIF conversion skipped for contest ${contestId}: ${avifErr.message}`);
  }

  // Compute SHA256 of original for dedup
  const sha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');

  // Update MongoDB
  // NOTE: image.backup is the CANONICAL OBJECT shape (matches Phase2's R2
  // contract: { url, source:'r2', format, status, createdAt }). Writing it as a
  // plain string here silently corrupted the shared Atlas collection — the
  // Phase2 canonical model and every read path expect an object with .url.
  // The flat legacy fields (image.backupFormat / image.backupAvif) are removed;
  // format now lives inside image.backup.format and AVIF lives inside
  // image.primary.variants.avif (written below).
  const backupCreatedAt = new Date();
  const updateFields = {
    'image.primary.url': r2Url,
    'image.primary.source': 'r2',
    'image.primary.status': 'active',
    'image.primary.fileSize': webpBuffer.length,
    'image.primary.sha256': sha256,
    'image.primary.lastCheckedAt': backupCreatedAt.toISOString(),
    'image.backup': {
      url: r2Url,
      source: 'r2',
      format: 'webp',
      status: 'active',
      createdAt: backupCreatedAt,
    },
  };

  if (avifBuffer) {
    const avifUrl = `${publicBase}/${avifKey}`;
    updateFields['image.primary.variants'] = {
      webp: { url: r2Url, size: webpBuffer.length },
      avif: { url: avifUrl, size: avifBuffer.length },
    };
  }

  await Contest.updateOne(
    { _id: contestId },
    { $set: updateFields }
  );

  // Report the FINAL stored dimensions (after any upscale/downscale), not the
  // source's, so API consumers see what's actually on R2.
  const finalMetadata = await sharp(webpBuffer).metadata();

  return { r2Url, webpBuffer, metadata: finalMetadata, updateFields, sha256 };
}

/**
 * POST /api/admin/contests/images/upload
 * Upload a replacement image for a contest.
 */
exports.uploadContestImage = async (req, res) => {
  try {
    const { contestId } = req.body;
    const file = req.file;

    if (!contestId) {
      return res.status(400).json({ success: false, message: 'contestId is required' });
    }
    if (!file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    // Validate file is an image
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'Uploaded file must be an image' });
    }

    // Validate file size (max 15MB)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ success: false, message: 'Image must be under 15MB' });
    }

    const contest = await Contest.findById(contestId).lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    const { r2Url, webpBuffer, metadata, sha256, updateFields } = await processAndUploadImageToR2(file.buffer, contestId);

    // Log activity
    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'upload_contest_image',
        description: `Uploaded image for contest: "${contest.title || contestId}"`,
        targetId: contestId,
        targetType: 'contest',
        metadata: { title: contest.title, sha256, format: 'webp', sizeBytes: webpBuffer.length },
      });
    } catch (logErr) {
      console.warn('Failed to log upload activity:', logErr.message);
    }

    res.json({
      success: true,
      message: 'Image uploaded and contest updated successfully',
      contestId,
      image: {
        url: r2Url,
        format: 'webp',
        sizeBytes: webpBuffer.length,
        width: metadata.width,
        height: metadata.height,
        variants: updateFields['image.primary.variants'] || null,
      },
    });
  } catch (error) {
    console.error('Contest image upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/contests/images/upload-url
 * Set a contest's image from a working external URL: fetch it, validate it's
 * an image, then push it through the same R2 pipeline (WebP + best-effort
 * AVIF, primary + backup) used by file uploads.
 */
exports.uploadContestImageFromUrl = async (req, res) => {
  try {
    const { contestId, imageUrl } = req.body;

    if (!contestId) {
      return res.status(400).json({ success: false, message: 'contestId is required' });
    }
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }

    let parsed;
    try {
      parsed = new URL(imageUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol');
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid image URL. Must be a valid http(s) URL.' });
    }

    if (!(await isPublicUrl(imageUrl))) {
      return res.status(400).json({ success: false, message: 'Image URL must point to a public host' });
    }

    const contest = await Contest.findById(contestId).lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    // Fetch the remote image with a 15s timeout and a 15MB cap
    let response;
    try {
      response = await fetch(imageUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_IMAGE_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'request timed out after 15s' : err.message;
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: ${reason}` });
    }

    if (!response.ok) {
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: HTTP ${response.status} ${response.statusText}` });
    }

    // Re-validate the FINAL URL after redirects
    if (!(await isPublicResponseUrl(response))) {
      return res.status(400).json({ success: false, message: 'Redirected image URL points to a non-public host' });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'URL does not point to an image file' });
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image exceeds 15MB limit' });
    }

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    if (rawBuffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Empty image data from URL' });
    }
    if (rawBuffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image exceeds 15MB limit' });
    }

    // Confirm the bytes are actually a decodable image before the R2 pipeline
    try {
      await sharp(rawBuffer).metadata();
    } catch {
      return res.status(400).json({ success: false, message: 'URL does not point to a valid image file' });
    }

    const { r2Url, webpBuffer, metadata, sha256, updateFields } = await processAndUploadImageToR2(rawBuffer, contestId);

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'upload_contest_image_url',
        description: `Fetched image from URL and backed up for contest: "${contest.title || contestId}"`,
        targetId: contestId,
        targetType: 'contest',
        metadata: { title: contest.title, sha256, format: 'webp', sizeBytes: webpBuffer.length, sourceUrl: imageUrl },
      });
    } catch (logErr) {
      console.warn('Failed to log URL upload activity:', logErr.message);
    }

    res.json({
      success: true,
      message: 'Image fetched from URL, uploaded and backed up to R2',
      contestId,
      image: {
        url: r2Url,
        format: 'webp',
        sizeBytes: webpBuffer.length,
        width: metadata.width,
        height: metadata.height,
        variants: updateFields['image.primary.variants'] || null,
      },
    });
  } catch (error) {
    console.error('Contest image URL upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/contests/images/backup
 * Backup a primary image that doesn't have a backup to R2.
 */
exports.backupImage = async (req, res) => {
  try {
    const { contestId } = req.body;
    if (!contestId) {
      return res.status(400).json({ success: false, message: 'contestId is required' });
    }

    const contest = await Contest.findById(contestId).lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    const primaryUrl = unwrapMarkdownUrl(contest.image?.primary?.url);
    if (!primaryUrl) {
      return res.status(400).json({ success: false, message: 'Contest has no primary image URL' });
    }

    if (contest.image?.backup) {
      return res.status(400).json({ success: false, message: 'Contest already has a backup' });
    }

    // SSRF guard: refuse to fetch private/loopback/link-local hosts
    if (!(await isPublicUrl(primaryUrl))) {
      return res.status(400).json({ success: false, message: 'Primary image URL points to a non-public host; backup blocked' });
    }

    // Fetch the image (15s timeout)
    let response;
    try {
      response = await fetch(primaryUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_IMAGE_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'request timed out after 15s' : err.message;
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: ${reason}` });
    }

    if (!response.ok) {
      await Contest.updateOne(
        { _id: contestId },
        { 
          $set: { 
            'image.primary.status': 'broken',
            'image.primary.lastCheckedAt': new Date().toISOString()
          } 
        }
      );
      return res.status(400).json({ success: false, message: `Failed to fetch image from URL: ${response.statusText}` });
    }

    // Re-validate the FINAL URL after redirects
    if (!(await isPublicResponseUrl(response))) {
      return res.status(400).json({ success: false, message: 'Redirected image URL points to a non-public host' });
    }

    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    if (rawBuffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Image size exceeds 15MB limit' });
    }

    const { r2Url, webpBuffer, metadata, sha256 } = await processAndUploadImageToR2(rawBuffer, contestId);

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'backup_contest_image',
        description: `Backed up image for contest: "${contest.title || contestId}"`,
        targetId: contestId,
        targetType: 'contest',
        metadata: { title: contest.title, sha256, format: 'webp', sizeBytes: webpBuffer.length },
      });
    } catch (logErr) {
      console.warn('Failed to log backup activity:', logErr.message);
    }

    res.json({
      success: true,
      message: 'Image backed up successfully',
      image: {
        url: r2Url,
        format: 'webp',
        sizeBytes: webpBuffer.length,
        width: metadata.width,
        height: metadata.height,
      },
    });

  } catch (error) {
    console.error('Contest image backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/contests/images/bulk-backup
 * Backup multiple primary images.
 */
exports.bulkBackup = async (req, res) => {
  try {
    const { contestIds } = req.body;
    if (!contestIds || !Array.isArray(contestIds) || contestIds.length === 0) {
      return res.status(400).json({ success: false, message: 'contestIds array is required' });
    }

    const contests = await Contest.find({ _id: { $in: contestIds } }).lean();
    const results = { success: 0, failed: 0, errors: [] };

    for (const contest of contests) {
      const primaryUrl = contest.image?.primary?.url;
      if (!primaryUrl || contest.image?.backup) {
        results.failed++;
        results.errors.push({ id: contest._id, reason: 'No primary URL or already backed up' });
        continue;
      }

      try {
        // SSRF guard: skip private/loopback/link-local hosts
        if (!(await isPublicUrl(primaryUrl))) {
          throw new Error('Non-public image host');
        }

        let response;
        try {
          response = await fetch(primaryUrl, {
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_IMAGE_TIMEOUT_MS),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
          });
        } catch (err) {
          throw new Error(err.name === 'TimeoutError' ? 'Request timed out' : err.message);
        }

        if (!response.ok) {
           await Contest.updateOne(
             { _id: contest._id },
             { $set: { 'image.primary.status': 'broken', 'image.primary.lastCheckedAt': new Date().toISOString() } }
           );
           throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        // Re-validate the FINAL URL after redirects
        if (!(await isPublicResponseUrl(response))) {
          throw new Error('Redirected to a non-public host');
        }

        const arrayBuffer = await response.arrayBuffer();
        const rawBuffer = Buffer.from(arrayBuffer);
        
        if (rawBuffer.length > 15 * 1024 * 1024) throw new Error('File too large');

        await processAndUploadImageToR2(rawBuffer, contest._id);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: contest._id, reason: err.message });
      }
    }

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'bulk_backup_contest_images',
        description: `Bulk backed up ${results.success} contest images`,
        targetId: 'bulk',
        targetType: 'system',
        metadata: { success: results.success, failed: results.failed },
      });
    } catch (logErr) {}

    res.json({
      success: true,
      message: `Backed up ${results.success} images. Failed: ${results.failed}.`,
      results,
    });
  } catch (error) {
    console.error('Bulk backup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/contests/images/details
 * Returns contest details (title, description, category, tags, source, link)
 * so the admin can make an informed image externally.
 */
exports.getContestImageDetails = async (req, res) => {
  try {
    const { contestId } = req.query;

    if (!contestId) {
      return res.status(400).json({ success: false, message: 'contestId query param is required' });
    }

    const contest = await Contest.findById(contestId)
      .select('title description category tags source link image.alt image.tag image.primary.url image.primary.status image.backup')
      .lean();

    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    res.json({
      success: true,
      contest: {
        id: contest._id,
        title: contest.title || 'Untitled Contest',
        description: contest.description || null,
        category: contest.category || null,
        tags: contest.tags || [],
        source: contest.source || null,
        link: contest.link || null,
        image: {
          alt: contest.image?.alt || null,
          tag: contest.image?.tag || null,
          currentUrl: contest.image?.primary?.url || null,
          status: contest.image?.primary?.status || null,
          hasBackup: !!contest.image?.backup,
        },
      },
    });
  } catch (error) {
    console.error('Contest details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONTEST CRUD — Admin Create / Read / Update / Archive
//
//  Writes the SAME canonical document shape the automation pipeline uses
//  (Phase2 backend `models/Contests.js` v3.0 + `contest-structuring-v4.1.txt` output).
//  The admin `Contests` model is `strict: false`, so every normalizer below
//  mirrors the Phase2 model's pre('save') hooks to keep parity exactly:
//    • slug generation            (kebab-title-XXXXX from ObjectId)
//    • canonical category / subcategory mapping (tagNormalizer)
//    • tag normalization          (max 3, type-diverse)
//    • prize amount normalization (string → number, currency detection)
//    • auto-feature               (totalUSD >= 50k | official+verified | prestige tag)
//    • computed status            (open / scheduled / closed from timeline)
// ═══════════════════════════════════════════════════════════════════════════

const VALID_TYPES = ['contest', 'hackathon'];
const VALID_STATUS = ['open', 'scheduled', 'closed'];
const VALID_VERIFICATION = ['verified', 'pending', 'failed'];
const VALID_MODES = ['online', 'offline', 'in-person', 'hybrid'];
const VALID_SOURCE_TYPES = ['aggregator', 'direct', 'partner', 'official'];
const VALID_FLAGS = ['women', 'hero', 'featured', 'all', 'broken-link', 'no-image'];

const PRESTIGIOUS_TAGS = [
  'oscar-qualifying', 'grammy', 'emmy', 'bAFTA-qualifying', 'cannes', 'venice-film-festival',
  'sundance', 'tiff', 'sxsw', 'webby', 'red-dot', 'iF-design', 'd&AD', 'one-show', 'clio',
  'nobel', 'fields-medal', 'turing-award', 'pulitzer', 'rhodes', 'marshall', 'fulbright',
  'gates-millennium', 'y-combinator', 'techstars', 'unesco', 'world-bank', 'united-nations',
];

function generateSlug(title, id) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
  return `${base}-${String(id).slice(-5)}`;
}

function detectCurrencyFromString(str) {
  if (typeof str !== 'string') return null;
  if (str.includes('NT$')) return 'TWD';
  const codeMatch = str.match(/\b(USD|EUR|GBP|INR|JPY|CNY|KRW|TWD|AUD|CAD|CHF|SGD|HKD|NZD|SEK|NOK|DKK|BRL|MXN|ZAR|RUB|AED|SAR|THB|MYR|PHP|IDR|VND|TRY|PLN|NGN|KES|EGP|PKR|BDT|LKR|NPR|VND|ILS|CLP|COP|PEN)\b/i);
  if (codeMatch) return codeMatch[1].toUpperCase();
  if (str.includes('$')) return 'USD';
  if (str.includes('€')) return 'EUR';
  if (str.includes('£')) return 'GBP';
  if (str.includes('¥')) return 'JPY';
  return null;
}

function extractPrizeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const patterns = [
    /(?:totalling|totaling|total(?:\s+prize)?(?:\s+pool|\s+purse|\s+fund)?\s+(?:of|:)?\s*)\$([\d,]+(?:\.[\d]+)?)/i,
    /(?:totalling|totaling|total(?:\s+prize)?(?:\s+pool|\s+purse|\s+fund)?\s+(?:of|:)?\s*)€([\d,]+(?:\.[\d]+)?)/i,
    /(?:totalling|totaling|total(?:\s+prize)?(?:\s+pool|\s+purse|\s+fund)?\s+(?:of|:)?\s*)£([\d,]+(?:\.[\d]+)?)/i,
    /\$([\d,]+(?:\.[\d]+)?)\s+(?:in\s+)?(?:prize|prizes|award|grant|fellowship|purse)/i,
    /€([\d,]+(?:\.[\d]+)?)\s+(?:in\s+)?(?:prize|prizes|award|grant|fellowship)/i,
    /(?:prize|award|grant|fellowship)(?:\s+(?:is|of|:))?\s*\$([\d,]+(?:\.[\d]+)?)/i,
    /(?:prize|award|grant|fellowship)(?:\s+(?:is|of|:))?\s*€([\d,]+(?:\.[\d]+)?)/i,
    /\$([\d,]+(?:\.[\d]+)?)\s*(?:USD)?/i,
    /€([\d,]+(?:\.[\d]+)?)\s*(?:EUR)?/i,
    /£([\d,]+(?:\.[\d]+)?)\s*(?:GBP)?/i,
    /([\d,]+(?:\.[\d]+)?)\s*(USD|EUR|GBP)/i,
  ];
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      const cleaned = match[1].replace(/,/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0) {
        let currency = 'USD';
        if (match[0].includes('€')) currency = 'EUR';
        else if (match[0].includes('£')) currency = 'GBP';
        else if (match[2]) currency = match[2].toUpperCase();
        return { amount: num, currency };
      }
    }
  }
  return null;
}

function normalizePrizeAmounts(prize) {
  if (!prize) return;

  if (typeof prize.originalAmount === 'string') {
    const origStr = prize.originalAmount;
    const cleaned = origStr.replace(/[^0-9.]/g, '');
    const numeric = parseFloat(cleaned);
    prize.originalAmount = (!isNaN(numeric) && numeric > 0) ? numeric : 0;
    if (!prize.currency || prize.currency === 'USD') {
      const detected = detectCurrencyFromString(origStr);
      if (detected && detected !== 'USD') prize.currency = detected;
    }
  }

  if (typeof prize.totalUSD === 'string') {
    const cleaned = prize.totalUSD.replace(/[^0-9.]/g, '');
    const numeric = parseFloat(cleaned);
    prize.totalUSD = (!isNaN(numeric) && numeric > 0) ? numeric : 0;
  }

  if (prize.originalAmount !== undefined && prize.originalAmount !== null && typeof prize.originalAmount !== 'number') {
    prize.originalAmount = Number(prize.originalAmount) || 0;
  }
  if (prize.totalUSD !== undefined && prize.totalUSD !== null && typeof prize.totalUSD !== 'number') {
    prize.totalUSD = Number(prize.totalUSD) || 0;
  }

  if (prize.isMonetary && (!prize.totalUSD || prize.totalUSD <= 0)) {
    const textSource = prize.prizeSummary || prize.description || '';
    const extracted = extractPrizeFromText(textSource);
    if (extracted) {
      let totalUSD = extracted.amount;
      if (extracted.currency === 'EUR') totalUSD = Math.round(extracted.amount * 1.08);
      else if (extracted.currency === 'GBP') totalUSD = Math.round(extracted.amount * 1.26);
      prize.totalUSD = totalUSD;
      prize.originalAmount = extracted.amount;
      prize.currency = extracted.currency;
    }
  }
}

function shouldAutoFeature(contest) {
  if (contest.prize?.totalUSD && Number(contest.prize.totalUSD) >= 50000) return true;
  if (contest.source?.type === 'official' && contest.verificationStatus === 'verified') return true;
  if (contest.tags && Array.isArray(contest.tags)) {
    const tagSet = new Set(contest.tags.map(t => String(t).toLowerCase().trim()));
    if (PRESTIGIOUS_TAGS.some(pt => tagSet.has(pt))) return true;
  }
  return false;
}

function computeStatusFromDates(contestLike, now = new Date()) {
  const startValue = contestLike?.timeline?.startUTC || contestLike?.timeline?.startDateUTC;
  const start = startValue ? new Date(startValue) : null;
  const deadline = contestLike?.timeline?.submissionDeadlineUTC ? new Date(contestLike.timeline.submissionDeadlineUTC) : null;
  if (deadline && !isNaN(deadline) && deadline < now) return 'closed';
  if (start && !isNaN(start) && start > now) return 'scheduled';
  if (deadline || start) return 'open';
  return 'open';
}

function toDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function cleanNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
}

function cleanStrings(value) {
  if (typeof value !== 'object' || value === null) return null;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const s = cleanString(v);
    if (s !== null) out[k] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Merge a raw form payload into a clean, canonical contest document.
 * Mirrors Phase2 model pre('save') hooks + contest-structuring-v4.1.txt schema.
 */
function normalizeContestPayload(raw) {
  const doc = {};

  // ── Identity ────────────────────────────────────────────────
  const title = cleanString(raw.title);
  if (!title) throw new Error('Title is required');
  doc.title = title;
  doc.type = VALID_TYPES.includes(raw.type) ? raw.type : 'contest';
  doc.description = cleanString(raw.description) || '';
  doc.descriptionDetailed = cleanString(raw.descriptionDetailed);
  doc.link = cleanString(raw.link);

  // Category pipeline — canonical mapped (rawCategory field retired from the schema)
  const rawCategory = cleanString(raw.category);
  if (!rawCategory) throw new Error('Category is required');
  doc.category = mapCanonicalCategory(rawCategory);
  doc.subCategory = cleanString(raw.subCategory) ?? mapSubcategory(rawCategory);

  // Tags — normalized with canonical category + filterKeys (max 3, type-diverse)
  doc.filterKeys = normalizeFilterKeys(raw.filterKeys, doc.category);
  doc.tags = normalizeTags(raw.tags || [], doc.category, doc.filterKeys);

  // Flags — whitelisted, deduped, auto-feature
  const flags = cleanStringArray(raw.flags).filter(f => VALID_FLAGS.includes(f));
  doc.flags = flags;
  doc.verificationStatus = VALID_VERIFICATION.includes(raw.verificationStatus) ? raw.verificationStatus : 'pending';
  doc.lastVerifiedAt = toDate(raw.lastVerifiedAt);
  doc.trendingUntil = toDate(raw.trendingUntil);
  doc.archivedAt = toDate(raw.archivedAt);

  // ── Image ───────────────────────────────────────────────────
  const image = {};
  const primaryUrl = cleanString(raw.image?.primary?.url);
  if (primaryUrl) {
    image.primary = {
      url: primaryUrl,
      source: ['external', 'uploaded', 'generated', 'r2'].includes(raw.image?.primary?.source) ? raw.image.primary.source : 'external',
      status: ['active', 'broken', 'pending'].includes(raw.image?.primary?.status) ? raw.image.primary.status : 'active',
    };
  } else {
    image.primary = { url: null, source: 'external', status: 'pending' };
  }
  if (raw.image?.backup && typeof raw.image.backup === 'object' && raw.image.backup.url) {
    image.backup = {
      url: cleanString(raw.image.backup.url),
      source: cleanString(raw.image.backup.source) || 'r2',
      format: cleanString(raw.image.backup.format),
      status: ['active', 'broken'].includes(raw.image.backup.status) ? raw.image.backup.status : 'active',
      createdAt: toDate(raw.image.backup.createdAt) || new Date(),
    };
  }
  const alt = cleanString(raw.image?.alt);
  if (alt) image.alt = alt;
  const tag = cleanString(raw.image?.tag);
  if (tag) image.tag = tag;
  if (Object.keys(image).length > 0) doc.image = image;

  // ── Entry ───────────────────────────────────────────────────
  const entry = {};
  if (raw.entry && typeof raw.entry === 'object') {
    entry.isFree = raw.entry.isFree === true || raw.entry.isFree === 'true' ? true
      : raw.entry.isFree === false || raw.entry.isFree === 'false' ? false
      : null;
    const feeUSD = cleanNumber(raw.entry.feeUSD);
    if (feeUSD !== null) entry.feeUSD = feeUSD;
    entry.feeConfidence = ['confirmed', 'extracted', 'unknown'].includes(raw.entry.feeConfidence) ? raw.entry.feeConfidence : 'unknown';
    const feeNote = cleanString(raw.entry.feeNote);
    if (feeNote) entry.feeNote = feeNote;
    const feeAmount = cleanNumber(raw.entry.fee?.amount);
    if (feeAmount !== null) {
      entry.fee = { amount: feeAmount, currency: cleanString(raw.entry.fee?.currency) || 'USD' };
    }
    doc.entry = entry;
  }

  // ── Prize ───────────────────────────────────────────────────
  if (raw.prize && typeof raw.prize === 'object') {
    const prize = {};
    prize.isMonetary = raw.prize.isMonetary === true || raw.prize.isMonetary === 'true' ? true : false;
    const originalAmount = cleanNumber(raw.prize.originalAmount);
    if (originalAmount !== null) prize.originalAmount = originalAmount;
    const totalUSD = cleanNumber(raw.prize.totalUSD);
    if (totalUSD !== null) prize.totalUSD = totalUSD;
    const currency = cleanString(raw.prize.currency);
    if (currency) prize.currency = currency;
    const prizeSummary = cleanString(raw.prize.prizeSummary);
    if (prizeSummary) prize.prizeSummary = prizeSummary;
    const prizeDesc = cleanString(raw.prize.description);
    if (prizeDesc) prize.description = prizeDesc;
    const breakdown = cleanString(raw.prize.breakdown);
    if (breakdown) prize.breakdown = breakdown;
    normalizePrizeAmounts(prize);
    doc.prize = prize;
  }

  // ── Audience ────────────────────────────────────────────────
  if (raw.audience && typeof raw.audience === 'object') {
    const audience = {};
    const eligibilityLabel = cleanString(raw.audience.eligibilityLabel);
    if (eligibilityLabel) audience.eligibilityLabel = eligibilityLabel;
    const eligibilityDetail = cleanString(raw.audience.eligibilityDetail);
    if (eligibilityDetail) audience.eligibilityDetail = eligibilityDetail;
    if (VALID_MODES.includes(raw.audience.mode)) audience.mode = raw.audience.mode;
    const location = cleanString(raw.audience.location);
    if (location) audience.location = location;
    const skillLevels = cleanStringArray(raw.audience.skillLevels);
    if (skillLevels.length > 0) audience.skillLevels = skillLevels;
    const primarySkillLevel = cleanString(raw.audience.primarySkillLevel);
    if (primarySkillLevel) audience.primarySkillLevel = primarySkillLevel;
    if (['explicit', 'inferred', 'default'].includes(raw.audience.skillLevelSource)) {
      audience.skillLevelSource = raw.audience.skillLevelSource;
    }
    if (raw.audience.age && (cleanNumber(raw.audience.age.min) !== null || cleanNumber(raw.audience.age.max) !== null)) {
      audience.age = {};
      const ageMin = cleanNumber(raw.audience.age.min);
      if (ageMin !== null) audience.age.min = ageMin;
      const ageMax = cleanNumber(raw.audience.age.max);
      if (ageMax !== null) audience.age.max = ageMax;
    }
    if (raw.audience.constraints && typeof raw.audience.constraints === 'object') {
      const constraints = {};
      const participantType = cleanStringArray(raw.audience.constraints.participantType);
      if (participantType.length > 0) constraints.participantType = participantType;
      const academicStatus = cleanString(raw.audience.constraints.academicStatus);
      if (academicStatus) constraints.academicStatus = academicStatus;
      const graduationAfter = cleanString(raw.audience.constraints.graduationAfter);
      if (graduationAfter) constraints.graduationAfter = graduationAfter;
      const organizationFoundedAfter = cleanString(raw.audience.constraints.organizationFoundedAfter);
      if (organizationFoundedAfter) constraints.organizationFoundedAfter = organizationFoundedAfter;
      if (raw.audience.constraints.teamSize && (cleanNumber(raw.audience.constraints.teamSize.min) !== null || cleanNumber(raw.audience.constraints.teamSize.max) !== null)) {
        constraints.teamSize = {};
        const tMin = cleanNumber(raw.audience.constraints.teamSize.min);
        if (tMin !== null) constraints.teamSize.min = tMin;
        const tMax = cleanNumber(raw.audience.constraints.teamSize.max);
        if (tMax !== null) constraints.teamSize.max = tMax;
      }
      if (Object.keys(constraints).length > 0) audience.constraints = constraints;
    }
    doc.audience = audience;
  }

  // ── Timeline ────────────────────────────────────────────────
  if (raw.timeline && typeof raw.timeline === 'object') {
    const timeline = {};
    const startUTC = toDate(raw.timeline.startUTC);
    if (startUTC) timeline.startUTC = startUTC;
    const startDateUTC = toDate(raw.timeline.startDateUTC);
    if (startDateUTC) timeline.startDateUTC = startDateUTC;
    const registrationDeadlineUTC = toDate(raw.timeline.registrationDeadlineUTC);
    if (registrationDeadlineUTC) timeline.registrationDeadlineUTC = registrationDeadlineUTC;
    const submissionDeadlineUTC = toDate(raw.timeline.submissionDeadlineUTC);
    if (submissionDeadlineUTC) timeline.submissionDeadlineUTC = submissionDeadlineUTC;
    const eventEndUTC = toDate(raw.timeline.eventEndUTC);
    if (eventEndUTC) timeline.eventEndUTC = eventEndUTC;
    const organizerTimeZone = cleanString(raw.timeline.organizerTimeZone);
    if (organizerTimeZone) timeline.organizerTimeZone = organizerTimeZone;
    doc.timeline = timeline;
  }
  if (!doc.timeline || !doc.timeline.submissionDeadlineUTC) {
    throw new Error('Submission deadline is required');
  }

  // ── Source ──────────────────────────────────────────────────
  if (raw.source && typeof raw.source === 'object') {
    const source = {};
    const sourceName = cleanString(raw.source.name);
    if (sourceName) source.name = sourceName;
    const sourceUrl = cleanString(raw.source.url);
    if (sourceUrl) source.url = sourceUrl;
    source.type = VALID_SOURCE_TYPES.includes(raw.source.type) ? raw.source.type : 'aggregator';
    doc.source = source;
  }

  // ── Hackathon (sparse, only for type === 'hackathon') ───────
  if (doc.type === 'hackathon' && raw.hackathon && typeof raw.hackathon === 'object') {
    const h = raw.hackathon;
    const hackathon = {};
    const duration = cleanString(h.duration);
    if (duration) hackathon.duration = duration;
    const platform = cleanString(h.platform);
    if (platform) hackathon.platform = platform;
    const techStack = cleanStringArray(h.techStack);
    if (techStack.length > 0) hackathon.techStack = techStack;
    hackathon.mentorship = h.mentorship === true || h.mentorship === 'true';
    const submissionRequirements = cleanStringArray(h.submissionRequirements);
    if (submissionRequirements.length > 0) hackathon.submissionRequirements = submissionRequirements;
    if (Array.isArray(h.tracks)) {
      const tracks = h.tracks
        .map(t => {
          const name = cleanString(t.name);
          if (!name) return null;
          const track = { name };
          const desc = cleanString(t.description);
          if (desc) track.description = desc;
          const prizeUSD = cleanNumber(t.prizeUSD);
          if (prizeUSD !== null) track.prizeUSD = prizeUSD;
          return track;
        })
        .filter(Boolean);
      if (tracks.length > 0) hackathon.tracks = tracks;
    }
    if (Array.isArray(h.judgingCriteria)) {
      const judgingCriteria = h.judgingCriteria
        .map(j => {
          const name = cleanString(j.name);
          if (!name) return null;
          const jc = { name };
          const desc = cleanString(j.description);
          if (desc) jc.description = desc;
          const weight = cleanNumber(j.weight);
          if (weight !== null) jc.weight = weight;
          return jc;
        })
        .filter(Boolean);
      if (judgingCriteria.length > 0) hackathon.judgingCriteria = judgingCriteria;
    }
    if (Array.isArray(h.prizeBreakdown)) {
      const prizeBreakdown = h.prizeBreakdown
        .map(p => {
          const place = cleanString(p.place);
          if (!place) return null;
          const pb = { place };
          const track = cleanString(p.track);
          if (track) pb.track = track;
          const amount = cleanString(p.amount);
          if (amount) pb.amount = amount;
          return pb;
        })
        .filter(Boolean);
      if (prizeBreakdown.length > 0) hackathon.prizeBreakdown = prizeBreakdown;
    }
    if (h.engagement && typeof h.engagement === 'object') {
      const engagement = {};
      const totalParticipants = cleanNumber(h.engagement.totalParticipants);
      if (totalParticipants !== null) engagement.totalParticipants = totalParticipants;
      const projectsSubmitted = cleanNumber(h.engagement.projectsSubmitted);
      if (projectsSubmitted !== null) engagement.projectsSubmitted = projectsSubmitted;
      if (Object.keys(engagement).length > 0) hackathon.engagement = engagement;
    }
    if (h.teamSize && (cleanNumber(h.teamSize.min) !== null || cleanNumber(h.teamSize.max) !== null)) {
      hackathon.teamSize = {};
      const hMin = cleanNumber(h.teamSize.min);
      if (hMin !== null) hackathon.teamSize.min = hMin;
      const hMax = cleanNumber(h.teamSize.max);
      if (hMax !== null) hackathon.teamSize.max = hMax;
    }
    doc.hackathon = hackathon;
  }

  // ── Status (computed from timeline unless explicitly provided) ──
  doc.status = VALID_STATUS.includes(raw.status) ? raw.status : computeStatusFromDates(doc);

  return doc;
}

function normalizeFilterKeys(rawFilterKeys, category) {
  const fk = {};
  const DOMAIN_MAP = {
    'Creative Arts': 'creative-arts',
    'Technology & AI': 'technology-ai',
    'Science & Research': 'science-research',
    'Business & Innovation': 'business-innovation',
    'Writing & Media': 'writing-media',
    'Environment & Sustainability': 'environment-sustainability',
    'Food & Cooking': 'food-cooking',
    'Education & Learning': 'education-learning',
    'Social Impact & Leadership': 'social-impact-leadership',
    'Open / Multidisciplinary': 'open-multidisciplinary',
  };
  if (category && DOMAIN_MAP[category]) fk.domain = DOMAIN_MAP[category];
  if (rawFilterKeys && typeof rawFilterKeys === 'object') {
    if (rawFilterKeys.domain) fk.domain = cleanString(rawFilterKeys.domain) || fk.domain;
    const format = cleanStringArray(rawFilterKeys.format);
    if (format.length > 0) fk.format = format;
    const medium = cleanStringArray(rawFilterKeys.medium);
    if (medium.length > 0) fk.medium = medium;
    const themes = cleanStringArray(rawFilterKeys.themes);
    if (themes.length > 0) fk.themes = themes;
  }
  return fk;
}

const contestSelectFields = {
  title: 1,
  slug: 1,
  type: 1,
  category: 1,
  subCategory: 1,
  description: 1,
  link: 1,
  tags: 1,
  flags: 1,
  status: 1,
  verificationStatus: 1,
  trendingUntil: 1,
  archivedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  image: 1,
  prize: 1,
  entry: 1,
  timeline: 1,
  audience: 1,
  source: 1,
};

/**
 * GET /api/admin/contests
 * Admin list of all contests (including archived), with search + filters.
 */
exports.listContests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const search = (req.query.search || '').trim();
    const type = req.query.type || 'all';
    const status = req.query.status || 'all';
    const category = req.query.category || 'all';
    const showArchived = req.query.archived === 'true';

    const query = {};
    if (!showArchived) query.archivedAt = null;
    if (type && type !== 'all') query.type = type;
    if (status && status !== 'all') query.status = status;
    if (category && category !== 'all') query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const [contests, total] = await Promise.all([
      Contest.find(query)
        .select(contestSelectFields)
        .sort({ 'timeline.submissionDeadlineUTC': -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Contest.countDocuments(query),
    ]);

    res.json({
      success: true,
      contests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('List contests error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/contests/categories
 * All distinct contest categories in the DB (used to populate the category
 * filter dropdown — previously it only showed categories from the current page).
 */
exports.listContestCategories = async (req, res) => {
  try {
    const values = await Contest.distinct('category');
    const categories = values
      .filter((c) => typeof c === 'string' && c.trim())
      .sort((a, b) => a.localeCompare(b));
    res.json({ success: true, categories });
  } catch (error) {
    console.error('List contest categories error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/contests/with-details
 * Admin list of ONLY contests that have a DETAILED GUIDE (contest_details) doc.
 * Joins each contest with its guide metadata (version, status, quality score,
 * last updated) so the admin can see at a glance which live pages are covered.
 */
exports.listContestsWithDetails = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const search = (req.query.search || '').trim();
    const type = req.query.type || 'all';
    const status = req.query.status || 'all';
    const showArchived = req.query.archived === 'true';

    const match = {};
    if (!showArchived) match.archivedAt = null;
    if (type && type !== 'all') match.type = type;
    if (status && status !== 'all') match.status = status;
    if (search) {
      match.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const [result] = await Contest.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'contest_details',
          localField: '_id',
          foreignField: 'contestId',
          as: 'guide',
        },
      },
      // Keep only contests that actually have a details doc
      { $match: { 'guide.0': { $exists: true } } },
      {
        $project: {
          title: 1,
          slug: 1,
          type: 1,
          category: 1,
          status: 1,
          link: 1,
          image: 1,
          prize: 1,
          timeline: 1,
          archivedAt: 1,
          createdAt: 1,
          detail: { $arrayElemAt: ['$guide', 0] },
        },
      },
      { $sort: { 'detail.updatedAt': -1, createdAt: -1 } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    const total = result.total.length > 0 ? result.total[0].count : 0;

    res.json({
      success: true,
      contests: result.rows || [],
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('List contests with details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/admin/contests/:id
 * Full contest document for the edit form.
 */
exports.getContest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const contest = await Contest.findById(id).lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }
    res.json({ success: true, contest });
  } catch (error) {
    console.error('Get contest error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/contests
 * Create a contest with the exact canonical pipeline structure.
 */
exports.createContest = async (req, res) => {
  try {
    const payload = normalizeContestPayload(req.body);
    const id = new mongoose.Types.ObjectId();
    payload._id = id;
    payload.slug = generateSlug(payload.title, id);
    payload.status = VALID_STATUS.includes(payload.status) ? payload.status : computeStatusFromDates(payload);
    if (shouldAutoFeature(payload) && !payload.flags.includes('featured')) {
      payload.flags.push('featured');
    }

    const contest = await Contest.create(payload);

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'create_contest',
        description: `Created contest: "${contest.title}"`,
        targetId: contest._id,
        targetType: 'contest',
        metadata: { title: contest.title, type: contest.type, category: contest.category },
      });
    } catch (logErr) {
      console.warn('Failed to log create contest activity:', logErr.message);
    }

    res.status(201).json({ success: true, message: 'Contest created successfully', contest });
  } catch (error) {
    console.error('Create contest error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/admin/contests/:id
 * Update a contest, preserving operational fields not sent by the form.
 */
exports.updateContest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }

    const existing = await Contest.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    const payload = normalizeContestPayload(req.body);
    // Preserve operational image fields not sent by the form (R2 backup object,
    // primary source/status/variants/fileSize/sha256/lastCheckedAt). Without this
    // the $set below would silently wipe image.backup and mislabel R2 sources on
    // every edit. Only the primary URL (and alt/tag when non-empty) are overridden.
    if (payload.image && existing.image && typeof existing.image === 'object') {
      const existingPrimary = (existing.image.primary && typeof existing.image.primary === 'object') ? existing.image.primary : {};
      payload.image = {
        ...existing.image,
        alt: payload.image.alt ?? existing.image.alt,
        tag: payload.image.tag ?? existing.image.tag,
        primary: {
          ...existingPrimary,
          url: payload.image.primary?.url ?? null,
        },
      };
    }
    payload.slug = generateSlug(payload.title, existing._id);
    if (shouldAutoFeature(payload) && !payload.flags.includes('featured')) {
      payload.flags.push('featured');
    }

    // When a doc switches away from type 'hackathon', drop the stale hackathon
    // subdocument — normalizeContestPayload only writes it for hackathon type,
    // so the $set alone would leave orphaned tracks/judgingCriteria behind.
    const setOp = { $set: payload };
    if (existing.type === 'hackathon' && payload.type !== 'hackathon' && existing.hackathon) {
      setOp.$unset = { hackathon: 1 };
    }

    const contest = await Contest.findByIdAndUpdate(id, setOp, { new: true, runValidators: false }).lean();

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'update_contest',
        description: `Updated contest: "${contest.title}"`,
        targetId: id,
        targetType: 'contest',
        metadata: { title: contest.title, type: contest.type, category: contest.category },
      });
    } catch (logErr) {
      console.warn('Failed to log update contest activity:', logErr.message);
    }

    res.json({ success: true, message: 'Contest updated successfully', contest });
  } catch (error) {
    console.error('Update contest error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/admin/contests/:id
 * Soft-delete a contest (sets archivedAt) — matches how the system archives.
 */
exports.archiveContest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const result = await Contest.updateOne({ _id: id }, { $set: { archivedAt: new Date() } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'archive_contest',
        description: `Archived contest: ${id}`,
        targetId: id,
        targetType: 'contest',
      });
    } catch (logErr) {
      console.warn('Failed to log archive activity:', logErr.message);
    }

    res.json({ success: true, message: 'Contest archived' });
  } catch (error) {
    console.error('Archive contest error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/admin/contests/:id/restore
 * Bring an archived contest back.
 */
exports.restoreContest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const result = await Contest.updateOne({ _id: id }, { $set: { archivedAt: null } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'restore_contest',
        description: `Restored contest: ${id}`,
        targetId: id,
        targetType: 'contest',
      });
    } catch (logErr) {
      console.warn('Failed to log restore activity:', logErr.message);
    }

    res.json({ success: true, message: 'Contest restored' });
  } catch (error) {
    console.error('Restore contest error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONTEST DETAILS (DETAILED GUIDE) — admin CRUD
//
//  Reads/writes the shared `contest_details` collection that the public
//  contest detail page renders as its "DETAILED GUIDE" (AI-POWERED INSIGHTS)
//  section. Every field below mirrors Phase2 `models/ContestDetail.js`.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/contests/:id/details
 * Full contest_details doc for the admin details editor (null if none yet).
 */
exports.getContestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const contest = await Contest.findById(id).select('title slug type category').lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }
    const details = await ContestDetail.findOne({ contestId: id }).lean();
    res.json({ success: true, contest, details });
  } catch (error) {
    console.error('Get contest details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const cleanStr = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const cleanStrList = (v) => {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
};

const cleanNum = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

/**
 * PUT /api/admin/contests/:id/details
 * Create or update the DETAILED GUIDE content for a contest.
 * Upserts into the shared contest_details collection.
 */
exports.saveContestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const contest = await Contest.findById(id).select('title type').lean();
    if (!contest) {
      return res.status(404).json({ success: false, message: 'Contest not found' });
    }

    const raw = req.body || {};
    const rawContent = raw.content && typeof raw.content === 'object' ? raw.content : {};
    const rawResearch = raw.research && typeof raw.research === 'object' ? raw.research : {};
    const rawSeo = raw.seo && typeof raw.seo === 'object' ? raw.seo : {};
    const rawMetadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};

    const content = {};
    if (rawContent.hero && typeof rawContent.hero === 'object') {
      const hero = {};
      const subheadline = cleanStr(rawContent.hero.subheadline);
      if (subheadline) hero.subheadline = subheadline;
      const valueProposition = cleanStr(rawContent.hero.valueProposition);
      if (valueProposition) hero.valueProposition = valueProposition;
      if (Object.keys(hero).length > 0) content.hero = hero;
    }
    const whyJoin = cleanStr(rawContent.whyJoin);
    if (whyJoin) content.whyJoin = whyJoin;
    const whoShouldApply = cleanStr(rawContent.whoShouldApply);
    if (whoShouldApply) content.whoShouldApply = whoShouldApply;
    const benefits = cleanStrList(rawContent.benefits);
    if (benefits.length > 0) content.benefits = benefits;
    const tips = cleanStrList(rawContent.tips);
    if (tips.length > 0) content.tips = tips;
    const readingTime = cleanNum(rawContent.readingTime);
    if (readingTime !== null) content.readingTime = readingTime;
    const judgingProcess = cleanStr(rawContent.judgingProcess);
    if (judgingProcess) content.judgingProcess = judgingProcess;
    const mentorshipDetails = cleanStr(rawContent.mentorshipDetails);
    if (mentorshipDetails) content.mentorshipDetails = mentorshipDetails;

    if (Array.isArray(rawContent.submissionGuide)) {
      const guide = rawContent.submissionGuide
        .map((g) => {
          const step = cleanStr(g && g.step);
          if (!step) return null;
          const item = { step };
          const detail = cleanStr(g && g.detail);
          if (detail) item.detail = detail;
          return item;
        })
        .filter(Boolean);
      if (guide.length > 0) content.submissionGuide = guide;
    }
    if (Array.isArray(rawContent.timelineSummary)) {
      const summary = rawContent.timelineSummary
        .map((t) => {
          const phase = cleanStr(t && t.phase);
          const label = cleanStr(t && t.label);
          if (!phase && !label) return null;
          const item = {};
          if (phase) item.phase = phase;
          if (label) item.label = label;
          const date = cleanStr(t && t.date);
          if (date) item.date = date;
          return item;
        })
        .filter(Boolean);
      if (summary.length > 0) content.timelineSummary = summary;
    }
    if (Array.isArray(rawContent.faq)) {
      const faq = rawContent.faq
        .map((f) => {
          const question = cleanStr(f && f.question);
          if (!question) return null;
          const item = { question };
          const answer = cleanStr(f && f.answer);
          if (answer) item.answer = answer;
          return item;
        })
        .filter(Boolean);
      if (faq.length > 0) content.faq = faq;
    }
    if (rawContent.shouldYouApply && typeof rawContent.shouldYouApply === 'object') {
      const sya = rawContent.shouldYouApply;
      const shouldYouApply = {};
      const idealFor = cleanStr(sya.idealFor);
      if (idealFor) shouldYouApply.idealFor = idealFor;
      const goodFit = cleanStrList(sya.goodFit);
      if (goodFit.length > 0) shouldYouApply.goodFit = goodFit;
      const notIdealFor = cleanStrList(sya.notIdealFor);
      if (notIdealFor.length > 0) shouldYouApply.notIdealFor = notIdealFor;
      if (Object.keys(shouldYouApply).length > 0) content.shouldYouApply = shouldYouApply;
    }
    if (Array.isArray(rawContent.resourceOfferings)) {
      const offerings = rawContent.resourceOfferings
        .map((o) => {
          const type = cleanStr(o && o.type);
          if (!type) return null;
          const item = { type };
          const provider = cleanStr(o && o.provider);
          if (provider) item.provider = provider;
          const value = cleanStr(o && o.value);
          if (value) item.value = value;
          const description = cleanStr(o && o.description);
          if (description) item.description = description;
          return item;
        })
        .filter(Boolean);
      if (offerings.length > 0) content.resourceOfferings = offerings;
    }

    let research = {};
    if (rawResearch.officialWebsite && typeof rawResearch.officialWebsite === 'object') {
      const url = cleanStr(rawResearch.officialWebsite.url);
      if (url) research.officialWebsite = { url };
    }
    const pastWinners = cleanStrList(rawResearch.pastWinners);
    if (pastWinners.length > 0) research.pastWinners = pastWinners;
    const communityTips = cleanStrList(rawResearch.communityTips);
    if (communityTips.length > 0) research.communityTips = communityTips;

    const seo = {};
    const metaTitle = cleanStr(rawSeo.metaTitle);
    if (metaTitle) seo.metaTitle = metaTitle;
    const metaDescription = cleanStr(rawSeo.metaDescription);
    if (metaDescription) seo.metaDescription = metaDescription;
    const keywords = cleanStrList(rawSeo.keywords);
    if (keywords.length > 0) seo.keywords = keywords;

    let metadata = {};
    const qualityScore = cleanNum(rawMetadata.qualityScore);
    if (qualityScore !== null) metadata.qualityScore = qualityScore;
    const pipelineSteps = cleanStrList(rawMetadata.pipelineSteps);
    if (pipelineSteps.length > 0) metadata.pipelineSteps = pipelineSteps;
    const errors = cleanStrList(rawMetadata.errors);
    if (errors.length > 0) metadata.errors = errors;

    const existing = await ContestDetail.findOne({ contestId: id }).lean();
    const isNew = !existing;

    // The admin form only manages content + a few research/seo fields. Preserve
    // pipeline-owned audit data (metadata.qualityScore/pipelineSteps/errors and
    // research.faqSources/redditThreads/officialWebsite.lastFetched) instead of
    // wiping them with a wholesale $set on a shared pipeline collection.
    if (existing) {
      if (Object.keys(metadata).length === 0 && existing.metadata) {
        metadata = existing.metadata;
      }
      const existingResearch = (existing.research && typeof existing.research === 'object') ? existing.research : {};
      research = {
        ...existingResearch,
        ...research,
        officialWebsite: {
          ...(existingResearch.officialWebsite && typeof existingResearch.officialWebsite === 'object' ? existingResearch.officialWebsite : {}),
          ...(research.officialWebsite || {}),
        },
      };
    }

    const setFields = {
      status: 'completed',
      generatedBy: 'admin',
      generatedAt: new Date(),
      content,
      research,
      seo,
      metadata,
    };
    if (isNew) {
      setFields.contestId = id;
      setFields.version = 1;
      setFields.schemaVersion = 1;
    } else {
      setFields.version = (existing.version ?? 1) + 1;
      setFields.previousVersionAt = existing.generatedAt || new Date();
      setFields.changeLog = cleanStr(raw.changeLog) || 'Updated via admin dashboard';
    }

    const details = await ContestDetail.findOneAndUpdate(
      { contestId: id },
      { $set: setFields, $setOnInsert: { contestId: id } },
      { upsert: true, new: true }
    ).lean();

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: isNew ? 'create_contest_details' : 'update_contest_details',
        description: `${isNew ? 'Created' : 'Updated'} DETAILED GUIDE for contest: "${contest.title}"`,
        targetId: id,
        targetType: 'contest',
        metadata: { title: contest.title, version: details.version },
      });
    } catch (logErr) {
      console.warn('Failed to log contest details activity:', logErr.message);
    }

    res.json({ success: true, message: isNew ? 'Detailed guide created' : 'Detailed guide updated', details });
  } catch (error) {
    console.error('Save contest details error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/admin/contests/:id/details
 * Remove the DETAILED GUIDE doc (back to 'No details available yet').
 */
exports.deleteContestDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid contest id' });
    }
    const result = await ContestDetail.deleteOne({ contestId: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'No detailed guide found for this contest' });
    }

    try {
      await logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'delete_contest_details',
        description: `Deleted DETAILED GUIDE for contest: ${id}`,
        targetId: id,
        targetType: 'contest',
      });
    } catch (logErr) {
      console.warn('Failed to log delete details activity:', logErr.message);
    }

    res.json({ success: true, message: 'Detailed guide deleted' });
  } catch (error) {
    console.error('Delete contest details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
