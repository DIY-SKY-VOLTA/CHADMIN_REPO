const BlogImage = require("../models/BlogImage");
const jwt = require("jsonwebtoken");
const { logAction } = require("./activityLogController");

const VARIANT_NAMES = ['thumbnail', 'medium', 'large', 'original'];

const VARIANT_DIMENSIONS = {
  thumbnail: { width: 300, quality: 80 },
  medium: { width: 800, quality: 82 },
  large: { width: 1200, quality: 85 },
  original: { width: 1600, quality: 88 },
};

/**
 * Build a proxy URL for an image variant.
 * The main app's proxy endpoint verifies the JWT token, then generates
 * a fresh signed URL from Supabase with the right transform params.
 */
function buildImageVariantUrl({ imageId, variantName, uploadedBy, sha256 }) {
  const secret = process.env.BLOG_IMAGE_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    console.warn('⚠️ Image proxy: BLOG_IMAGE_TOKEN_SECRET/JWT_SECRET not set — image tokens cannot be generated');
    return `/api/uploads/images/${imageId}/variant/${variantName}`;
  }
  // Tokens expire after 30 days — the proxy verifies with maxAge, so even
  // already-issued URLs age out instead of working forever if leaked.
  const token = jwt.sign(
    { imageId: String(imageId), variantName, uploadedBy: String(uploadedBy), sha256, purpose: "blog-image-variant" },
    secret,
    { expiresIn: '30d' }
  );
  return `/api/uploads/images/${imageId}/variant/${variantName}?token=${encodeURIComponent(token)}`;
}

/**
 * Reconstruct all 4 variant entries with fresh proxy URLs.
 * Mirrors the main app's buildProxiedVariants() so the admin dashboard
 * always returns working image URLs regardless of what's stored in the DB.
 */
function buildProxiedVariants({ imageId, uploadedBy, sha256, variants }) {
  const proxiedVariants = {};
  const masterVariant = variants?.original;

  if (!masterVariant) {
    // Fallback for records with unexpected variant structure
    for (const variantName of Object.keys(variants || {})) {
      const variant = variants[variantName];
      if (!variant) continue;
      proxiedVariants[variantName] = {
        ...variant,
        url: buildImageVariantUrl({ imageId, variantName, uploadedBy, sha256 }),
      };
    }
    return proxiedVariants;
  }

  const aspectRatio = masterVariant.width > 0
    ? masterVariant.height / masterVariant.width
    : 2 / 3;

  for (const variantName of VARIANT_NAMES) {
    const dims = VARIANT_DIMENSIONS[variantName] || VARIANT_DIMENSIONS.original;
    const width = dims.width;
    const height = Math.round(width * aspectRatio) || 0;

    proxiedVariants[variantName] = {
      path: masterVariant.path || '',
      url: buildImageVariantUrl({ imageId, variantName, uploadedBy, sha256 }),
      width,
      height,
      sizeBytes: masterVariant.sizeBytes,
      mimeType: masterVariant.mimeType,
    };
  }

  return proxiedVariants;
}

/**
 * Admin: List all images across all users with search, filter, and pagination.
 * Queries the shared BlogImage collection and enriches with user info via populate.
 */
exports.adminListImages = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = "", filter = "all" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit) || 50);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Filter by status
    if (filter === "trashed") {
      query.deletedAt = { $ne: null };
    } else if (filter === "active") {
      query.deletedAt = null;
    } else if (filter === "unused") {
      query.deletedAt = null;
      query.linkedBlogs = { $size: 0 };
    }

    // Search by filename, alt, or user info
    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { originalFileName: searchRegex },
        { alt: searchRegex },
      ];
    }

    const [images, total] = await Promise.all([
      BlogImage.find(query)
        .populate("uploadedBy", "username email avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      BlogImage.countDocuments(query),
    ]);

    // Secondary user search filter
    let resultImages = images;
    if (search.trim()) {
      const searchLower = search.trim().toLowerCase();
      resultImages = images.filter((img) => {
        const user = img.uploadedBy;
        if (!user) return false;
        const username = (user.username || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        return username.includes(searchLower) || email.includes(searchLower);
      });
    }

    const enriched = resultImages.map((img) => {
      const user = img.uploadedBy || {};
      const userInfo = typeof user === "object"
        ? { id: user._id, username: user.username, email: user.email, avatar: user.avatar }
        : { id: user, username: "Unknown", email: "" };

      // Reconstruct variant URLs with fresh proxy URLs
      // so images always load regardless of expired Supabase signed URLs
      const variants = buildProxiedVariants({
        imageId: img._id,
        uploadedBy: userInfo.id || img.uploadedBy,
        sha256: img.sha256,
        variants: img.variants,
      });

      return {
        id: img._id,
        blogId: img.blogId,
        alt: img.alt,
        originalFileName: img.originalFileName,
        originalMimeType: img.originalMimeType,
        originalSizeBytes: img.originalSizeBytes,
        sourceWidth: img.sourceWidth,
        sourceHeight: img.sourceHeight,
        user: userInfo,
        sha256: img.sha256,
        variants,
        linkedBlogs: img.linkedBlogs || [],
        isFavorited: img.isFavorited,
        deletedAt: img.deletedAt,
        createdAt: img.createdAt,
        updatedAt: img.updatedAt,
      };
    });

    // Use total (DB count) for pagination, not enriched.length (client-side filtered)
    const pages = Math.max(1, Math.ceil(total / limitNum));
    res.json({
      success: true,
      images: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalInQuery: total,
        pages,
      },
    });
  } catch (error) {
    console.error("Admin list images error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin: Permanently delete any user's image.
 * Removes from MongoDB and optionally from Supabase storage.
 */
exports.adminDeleteImage = async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await BlogImage.findById(imageId);
    if (!image) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }

    // Check if image is linked to active blogs
    const activeLinks = (image.linkedBlogs || []).filter((b) => !b.removedAt);
    if (activeLinks.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Image is used in ${activeLinks.length} blog(s). Remove from all blogs first, or confirm force deletion.`,
        linkedBlogs: activeLinks.map((b) => b.blogId),
      });
    }

    // Delete from MongoDB
    await BlogImage.deleteOne({ _id: imageId });

    // Note: Supabase storage cleanup is handled by the Phase2 backend's
    // retention cleanup job. To add direct Supabase deletion here,
    // import and call removeMany from a shared storage service.

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'delete_image',
      description: `Deleted image: "${image.originalFileName || imageId}"`,
      targetId: imageId,
      targetType: 'image',
      metadata: { uploadedBy: image.uploadedBy, fileName: image.originalFileName },
    });

    res.json({
      success: true,
      message: "Image permanently deleted from database",
    });
  } catch (error) {
    console.error("Admin delete image error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Admin: Force delete image even if linked to blogs.
 * Use with caution — will break blog content that references this image.
 */
exports.adminForceDeleteImage = async (req, res) => {
  try {
    const { imageId } = req.params;

    const image = await BlogImage.findById(imageId);
    if (!image) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }

    await BlogImage.deleteOne({ _id: imageId });

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'force_delete_image',
      description: `Force-deleted image: "${image.originalFileName || imageId}" (${(image.linkedBlogs || []).filter(b => !b.removedAt).length} active links broken)`,
      targetId: imageId,
      targetType: 'image',
      metadata: { uploadedBy: image.uploadedBy, fileName: image.originalFileName, linkedBlogs: image.linkedBlogs?.length },
    });

    res.json({
      success: true,
      message: "Image force-deleted (may break blog content referencing this image)",
    });
  } catch (error) {
    console.error("Admin force delete image error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
