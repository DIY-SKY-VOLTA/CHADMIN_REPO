const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    url: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    sizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true, default: "image/webp" },
  },
  { _id: false }
);

const blogImageSchema = new mongoose.Schema(
  {
    blogId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    alt: {
      type: String,
      default: "",
      maxlength: 300,
      trim: true,
    },
    storageProvider: {
      type: String,
      default: "supabase",
    },
    bucket: {
      type: String,
      required: true,
    },
    basePath: {
      type: String,
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      default: "",
    },
    originalMimeType: {
      type: String,
      required: true,
    },
    originalExtension: {
      type: String,
      required: true,
    },
    originalSizeBytes: {
      type: Number,
      required: true,
    },
    sourceWidth: {
      type: Number,
      required: true,
    },
    sourceHeight: {
      type: Number,
      required: true,
    },
    sha256: {
      type: String,
      required: true,
      index: true,
    },
    variants: {
      original: { type: variantSchema, required: true },
      thumbnail: { type: variantSchema, required: false },
      medium: { type: variantSchema, required: false },
      large: { type: variantSchema, required: false },
    },
    status: {
      type: String,
      enum: ["active", "orphaned", "deleted"],
      default: "active",
      index: true,
    },
    usedInDraft: {
      type: Boolean,
      default: true,
      index: true,
    },
    linkedBlogs: [
      {
        blogId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "BlogSubmission",
        },
        addedAt: { type: Date, default: Date.now },
        removedAt: { type: Date, default: null },
        _id: false,
      },
    ],
    isFavorited: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    retentionExpires: {
      type: Date,
      default: null,
      index: true,
    },
    storageSize: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes for admin dashboard queries
blogImageSchema.index({ createdAt: -1 });                   // Default sort
blogImageSchema.index({ deletedAt: 1, createdAt: -1 });    // Filter by deleted status + sort

module.exports = mongoose.model("BlogImage", blogImageSchema);
