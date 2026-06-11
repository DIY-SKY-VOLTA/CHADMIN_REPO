const BlogImage = require("../models/BlogImage");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const VARIANT_NAMES = ['thumbnail', 'medium', 'large', 'original'];

const VARIANT_DIMENSIONS = {
  thumbnail: { width: 300, quality: 80 },
  medium: { width: 800, quality: 82 },
  large: { width: 1200, quality: 85 },
  original: { width: 1600, quality: 88 },
};

const ALLOWED_VARIANTS = new Set(VARIANT_NAMES);

// 1x1 transparent PNG fallback
const FALLBACK_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("⚠️ Image proxy: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    return null;
  }
  supabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabaseClient;
}

function verifyToken(token) {
  if (!token) throw new Error("Image token is required");
  const secret = process.env.BLOG_IMAGE_TOKEN_SECRET || process.env.JWT_SECRET;
  return jwt.verify(token, secret, { ignoreExpiration: true });
}

/**
 * Serve an image variant by generating a fresh signed URL from Supabase
 * and streaming the result. Mirrors the main app's blogImageProxyController.
 *
 * GET /api/uploads/images/:id/variant/:variantName?token=...
 */
exports.getImageVariant = async (req, res) => {
  try {
    const { id, variantName } = req.params;
    const token = req.query.token;

    res.set({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });

    if (!id || !ALLOWED_VARIANTS.has(variantName)) {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    // Verify JWT token
    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    if (
      String(claims.imageId) !== String(id) ||
      claims.variantName !== variantName ||
      claims.purpose !== "blog-image-variant"
    ) {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    // Look up image
    const image = await BlogImage.findById(id).lean();
    if (!image || image.status !== "active") {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    if (String(image.uploadedBy) !== String(claims.uploadedBy) || String(image.sha256) !== String(claims.sha256)) {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    // Get storage path
    const masterPath =
      image.variants?.master?.path ||
      image.variants?.original?.path ||
      Object.values(image.variants || {}).find((v) => v?.path)?.path;

    if (!masterPath) {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    // Generate fresh signed URL from Supabase
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(200).send(FALLBACK_PIXEL);
    }

    const bucket = image.bucket || process.env.SUPABASE_STORAGE_BUCKET || "blog-images";
    const dims = VARIANT_DIMENSIONS[variantName] || VARIANT_DIMENSIONS.original;

    const { data, error: signedErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(masterPath, 3600, {
        transform: { width: dims.width, quality: dims.quality, resize: "contain", format: "webp" },
      });

    if (signedErr || !data?.signedUrl) {
      console.warn(`Image proxy: failed to create signed URL for ${masterPath}: ${signedErr?.message}`);
      return res.status(200).send(FALLBACK_PIXEL);
    }

    // Download and stream
    const response = await fetch(data.signedUrl);
    if (!response.ok) {
      console.warn(`Image proxy: fetch failed for ${masterPath}: ${response.status}`);
      return res.status(200).send(FALLBACK_PIXEL);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.set({
      "Content-Type": "image/webp",
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Image proxy error:", err);
    res.set({ "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" });
    return res.status(200).send(FALLBACK_PIXEL);
  }
};
