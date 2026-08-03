const mongoose = require('mongoose');

/**
 * Canonical image sub-schema — MIRRORS Phase2 `backend/models/Contests.js`
 * imageSchema (v3.0). Both apps read/write the SAME Atlas `Contests` collection,
 * so this shape is the contract:
 *
 *   image.backup is an OBJECT { url, source:'r2', format, status, createdAt }
 *   (the Cloudflare R2 script output shape) — NOT a string.
 *
 * Defining it here means a legacy `$set: { 'image.backup': 'https://...' }`
 * write now throws a Mongoose CastError instead of silently corrupting data.
 *
 * NOTE on `strict`:
 *   - Top-level schema stays `strict: false` — the dashboard's image-health
 *     controller writes many dotted paths NOT declared here (image.primary.fileSize,
 *     image.primary.sha256, image.primary.variants, image.primary.lastCheckedAt,
 *     source.name, ...). strict:true would silently STRIP all of them.
 *   - The nested image sub-schemas are also `strict: false` for the same reason
 *     (extra primary metadata passes through); the guard that matters is that
 *     `image.backup` is typed as an OBJECT sub-document.
 */
const backupImageSchema = new mongoose.Schema({
  url:       { type: String, trim: true },
  source:    { type: String, default: 'r2' },
  format:    { type: String },     // 'webp', 'jpg', 'png'
  status:    { type: String, enum: ['active', 'broken'], default: 'active' },
  createdAt: { type: Date },
}, { _id: false, strict: false });

const primaryImageSchema = new mongoose.Schema({
  url:       { type: String, trim: true },
  source:    { type: String, default: 'external' }, // 'external' | 'r2' | 'uploaded'
  status:    { type: String, default: 'active' },
  // extra dashboard metadata (fileSize, sha256, variants, lastCheckedAt, ...)
  // passes through via strict:false above
}, { _id: false, strict: false });

const imageSchema = new mongoose.Schema({
  primary: primaryImageSchema,
  backup:  backupImageSchema,
  alt:     { type: String, trim: true },
  tag:     { type: String, trim: true },   // legacy/source-specific tag
}, { _id: false, strict: false });

const contestSchema = new mongoose.Schema({
  title: { type: String, trim: true },
  status: {
    type: String,
    enum: ['open', 'scheduled', 'closed'],
    default: 'open'
  },
  archivedAt: { type: Date, default: null },
  image: imageSchema
}, { 
  timestamps: true,
  strict: false // Allows querying fields not defined in schema
});

module.exports = mongoose.model('Contests', contestSchema, 'Contests');
