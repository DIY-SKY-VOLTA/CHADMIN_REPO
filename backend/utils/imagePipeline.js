/**
 * Shared image pipeline — health checks, SSRF guard, R2 upload, URL healing.
 *
 * Events previously had NO image tooling (no health checks, no R2 backup) —
 * everything lived inline in contestController.js. This module is the
 * canonical copy for NEW consumers (events); contestController still carries
 * its own inline copy for historical reasons and can be re-pointed here later.
 *
 * Contract notes carried over from the contest implementation:
 *  - image.backup is an OBJECT { url, source:'r2', format, createdAt } — never
 *    a plain string (a string backup silently corrupted the shared collection).
 *  - URL-fetch endpoints must SSRF-guard (public hosts only, re-check after
 *    redirects) because admins can submit arbitrary URLs.
 */
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const net = require('net');
const dns = require('dns').promises;

/* ── Markdown-wrapped URL guard ────────────────────────────────────────────── */
// Ingestion has (twice) stored raw markdown links as URL values:
// "[https://site/x.png](https://site/x.png)". Extract the href; pass through
// anything else unchanged.
const MD_LINK_RE = /^\s*\[([^\]]*)\]\(([^)]*)\)\s*$/;
function unwrapMarkdownUrl(raw) {
  if (typeof raw !== 'string') return raw;
  const m = raw.match(MD_LINK_RE);
  if (!m) return raw;
  const picked = (m[2] || '').trim() || (m[1] || '').trim();
  return /^https?:\/\//i.test(picked) ? picked : raw;
}

/* ── URL healing for cleanup passes ────────────────────────────────────────── */

/**
 * Unwrap framework image proxies: Next.js `_next/image?url=<real>&w=...`
 * → the real upstream URL. Proxy URLs break when the origin redeploys and
 * double-fetch on every render.
 */
function unwrapNextImageUrl(u) {
  if (typeof u !== 'string') return u;
  try {
    const parsed = new URL(u);
    if (parsed.pathname.endsWith('/_next/image') && parsed.searchParams.get('url')) {
      const inner = parsed.searchParams.get('url');
      return /^https?:\/\//i.test(inner) ? inner : u;
    }
  } catch { /* fall through */ }
  return u;
}

/**
 * Strip ephemeral CDN signatures (LinkedIn e=&t=, S3 X-Amz-*) — signed URLs
 * 404 within days. Mirrors Phase2's deSignUrl in event.model.js.
 */
function deSignUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return u;
  return /[?&](e|t|sig|expires|X-Amz-Signature)=/i.test(u) ? u.split('?')[0] : u.trim();
}

/* ── R2 client ─────────────────────────────────────────────────────────────── */

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

/* ── URL health check (HEAD) ───────────────────────────────────────────────── */

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

/**
 * GET probe that reads only headers (Range: bytes=0-0 keeps the body tiny) so
 * cleanup passes can detect NON-IMAGE URLs — HEAD alone can't distinguish a
 * real image from an HTML page (a JotForm form, a landing page, …).
 */
function probeImageUrl(imageUrl, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!imageUrl) return resolve({ status: 'no_image', statusCode: null, contentType: '' });
    try {
      const parsed = new URL(imageUrl);
      const fetcher = parsed.protocol === 'https:' ? https : http;
      const req = fetcher.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)',
          Range: 'bytes=0-0',
        },
      }, (res) => {
        const statusCode = res.statusCode;
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        const status = statusCode >= 200 && statusCode < 400 ? 'alive'
          : statusCode >= 400 && statusCode < 500 ? 'dead' : 'server_error';
        resolve({ status, statusCode, contentType });
        res.destroy(); // headers are all we need — never download the body
      });
      req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', statusCode: null, contentType: '' }); });
      req.on('error', () => resolve({ status: 'error', statusCode: null, contentType: '' }));
      req.end();
    } catch {
      resolve({ status: 'error', statusCode: null, contentType: '' });
    }
  });
}

/* ── SSRF guard for URL-based image fetch ──────────────────────────────────── */

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
 * Reject URLs pointing at private/loopback/link-local hosts so admin URL-fetch
 * endpoints can't be abused as an SSRF proxy to internal services.
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

/* ── Remote image fetch (SSRF-guarded + validated) ─────────────────────────── */

const FETCH_IMAGE_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Fetch a remote image: public host only (checked pre- and post-redirect),
 * image/* content-type, ≤15MB, and provably decodable by sharp.
 * Throws Error with an admin-facing message; returns { buffer, contentType }.
 */
async function fetchRemoteImage(imageUrl) {
  let parsed;
  try {
    parsed = new URL(imageUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol');
  } catch {
    throw new Error('Invalid image URL. Must be a valid http(s) URL.');
  }

  if (!(await isPublicUrl(imageUrl))) {
    throw new Error('Image URL must point to a public host');
  }

  let response;
  try {
    response = await fetch(imageUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_IMAGE_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChadminBot/1.0)' },
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'request timed out after 15s' : err.message;
    throw new Error(`Failed to fetch image from URL: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: HTTP ${response.status} ${response.statusText}`);
  }

  if (!(await isPublicResponseUrl(response))) {
    throw new Error('Redirected image URL points to a non-public host');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image file');
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds 15MB limit');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error('Empty image data from URL');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds 15MB limit');
  }

  // Confirm the bytes are actually a decodable image before the R2 pipeline
  try {
    await sharp(buffer).metadata();
  } catch {
    throw new Error('URL does not point to a valid image file');
  }

  return { buffer, contentType };
}

/* ── R2 upload (WebP + best-effort AVIF) ───────────────────────────────────── */

/**
 * Convert to WebP (best-effort AVIF variant), upload to Cloudflare R2 under
 * a VERSIONED `<folder>/primary-<timestamp>-<hash>.webp` key, return
 * everything the caller needs to write the canonical Mongo image shape
 * (primary + backup) for its own collection. Keys must be unique per upload:
 * a fixed `primary.webp` key meant replacements overwrote the same object at
 * the same public URL (with immutable year-long caching), so browsers/CDNs
 * kept serving the stale old image after a successful upload.
 */
async function uploadImageToR2(rawBuffer, folder) {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 storage not configured. Contact administrator.');
  }

  const bucket = getBucketName();
  const publicBase = getR2PublicBase();

  const sha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
  const version = `${Date.now()}-${sha256.slice(0, 8)}`;

  const webpBuffer = await sharp(rawBuffer)
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  const metadata = await sharp(rawBuffer).metadata();

  const webpKey = `${folder}/primary-${version}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: webpKey,
    Body: webpBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const r2Url = `${publicBase}/${webpKey}`;

  // Best-effort AVIF conversion
  let avif = null;
  try {
    const avifBuffer = await sharp(rawBuffer).avif({ quality: 50, effort: 4 }).toBuffer();
    const avifKey = `${folder}/primary-${version}.avif`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: avifKey,
      Body: avifBuffer,
      ContentType: 'image/avif',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    avif = { url: `${publicBase}/${avifKey}`, size: avifBuffer.length };
  } catch (avifErr) {
    console.warn(`AVIF conversion skipped for ${folder}: ${avifErr.message}`);
  }

  return { r2Url, webpBuffer, metadata, sha256, avif };
}

module.exports = {
  unwrapMarkdownUrl,
  unwrapNextImageUrl,
  deSignUrl,
  getR2Client,
  getR2PublicBase,
  getBucketName,
  checkImageUrl,
  probeImageUrl,
  isPublicUrl,
  isPublicResponseUrl,
  fetchRemoteImage,
  uploadImageToR2,
  FETCH_IMAGE_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
};
