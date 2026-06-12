const Contest = require('../models/Contests');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const crypto = require('crypto');
const { logAction } = require('./activityLogController');

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
const CACHE_TTL = 5 * 60 * 1000;

function classifyImageStatus(contest) {
  if (!contest) return 'unknown';
  const hasPrimary = !!contest.image?.primary?.url;
  const hasBackup = !!contest.image?.backup;
  const lastStatus = contest.image?.primary?.status;

  if (!hasPrimary) return 'no_image';
  if (lastStatus === 'broken' || lastStatus === 'error') return 'broken';
  if (!lastStatus || lastStatus === 'unknown') return 'unknown';
  if (!hasBackup && hasPrimary) return 'no_backup';
  if (lastStatus === 'active' || lastStatus === 'healthy') return 'healthy';
  return 'unknown';
}

function checkImageUrl(imageUrl) {
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
        timeout: 10000,
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
        resolve({ status: 'timeout', statusCode: null, reason: 'Request timed out after 10s' });
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

    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'source.name': { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    // 1. Fetch all matching items minimally to compute accurate global stats and filter
    const allImages = await Contest.find(query).select('image').lean();
    
    const stats = { total: allImages.length, healthy: 0, broken: 0, noBackup: 0, noImage: 0, unknown: 0 };
    const filteredIds = [];

    for (const c of allImages) {
      const status = classifyImageStatus(c);
      if (stats[status] !== undefined) stats[status]++;
      
      if (filter === 'all' || filter === status) {
        filteredIds.push(c._id);
      }
    }

    const totalFiltered = filteredIds.length;
    const pages = Math.max(1, Math.ceil(totalFiltered / limit));

    // 2. Fetch only the requested page from the filtered results
    const sortField = sortBy === 'source' ? 'source.name' : sortBy;
    const contests = await Contest.find({ _id: { $in: filteredIds } })
      .select('title category source link image status')
      .sort({ [sortField]: sortOrder, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const mapped = contests.map((c) => {
      const primaryUrl = c.image?.primary?.url || null;
      const backupUrl = c.image?.backup || null;
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
          alt: c.image?.alt || null,
          tag: c.image?.tag || null,
          originalDomain,
          lastCheckedAt: c.image?.primary?.lastCheckedAt || null,
          status: imageStatus,
        },
        imageStatus,
      };
    });

    res.json({
      success: true,
      contests: mapped,
      pagination: { total: totalFiltered, pages },
      stats,
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

    const results = [];

    for (const contest of contests) {
      const primaryUrl = contest.image?.primary?.url;
      if (!primaryUrl) {
        results.push({ contestId: contest._id, status: 'no_image', statusCode: null, reason: 'No image URL' });
        continue;
      }
      const result = await checkImageUrl(primaryUrl);
      const imageStatus = result.status === 'alive' ? 'healthy' : (result.status === 'dead' ? 'broken' : 'error');
      await Contest.updateOne(
        { _id: contest._id },
        {
          $set: {
            'image.primary.lastCheckedAt': new Date().toISOString(),
            'image.primary.status': imageStatus,
          },
        }
      );
      results.push({ contestId: contest._id, status: result.status, statusCode: result.statusCode, reason: result.reason });
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Bulk recheck error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Upload ─────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/contests/images/upload
 * Upload a replacement image for a contest.
async function processAndUploadImageToR2(rawBuffer, contestId) {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 storage not configured. Contact administrator.');
  }

  const bucket = getBucketName();
  const publicBase = getR2PublicBase();
  const contestKey = `contests/${contestId}`;

  // Process with sharp — convert to WebP
  const webpBuffer = await sharp(rawBuffer)
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  const metadata = await sharp(rawBuffer).metadata();

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
    avifBuffer = await sharp(rawBuffer).avif({ quality: 50, effort: 4 }).toBuffer();
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
  const updateFields = {
    'image.primary.url': r2Url,
    'image.primary.source': 'r2',
    'image.primary.status': 'active',
    'image.primary.fileSize': webpBuffer.length,
    'image.primary.sha256': sha256,
    'image.primary.lastCheckedAt': new Date().toISOString(),
    'image.backup': r2Url,
    'image.backupFormat': 'webp',
  };

  if (avifBuffer) {
    const avifUrl = `${publicBase}/${avifKey}`;
    updateFields['image.primary.variants'] = {
      webp: { url: r2Url, size: webpBuffer.length },
      avif: { url: avifUrl, size: avifBuffer.length },
    };
    updateFields['image.backupAvif'] = avifUrl;
  }

  await Contest.updateOne(
    { _id: contestId },
    { $set: updateFields }
  );

  return { r2Url, webpBuffer, metadata, updateFields, sha256 };
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

    const primaryUrl = contest.image?.primary?.url;
    if (!primaryUrl) {
      return res.status(400).json({ success: false, message: 'Contest has no primary image URL' });
    }

    if (contest.image?.backup) {
      return res.status(400).json({ success: false, message: 'Contest already has a backup' });
    }

    // Fetch the image
    const response = await fetch(primaryUrl);
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
        const response = await fetch(primaryUrl);
        if (!response.ok) {
           await Contest.updateOne(
             { _id: contest._id },
             { $set: { 'image.primary.status': 'broken', 'image.primary.lastCheckedAt': new Date().toISOString() } }
           );
           throw new Error(`HTTP ${response.status} ${response.statusText}`);
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
exports.getContestDetails = async (req, res) => {
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
