/**
 * ContestCategory Model (admin-dashboard)
 * Mirrors the main backend model (Phase2/backend/src/modules/contests/
 * contestCategory.model.js). Same collection, same fields — keep in sync.
 *
 * Contest.category stays a denormalized string; this collection drives the
 * public filter's ordering + active/inactive control and the admin UI.
 */

const mongoose = require('mongoose');

// Slug transformation MUST stay identical to the main backend's
// GET /api/contests/categories id computation and to ContestCategory.slugifyCategory.
const slugifyCategory = (name) =>
  String(name || '')
    .toLowerCase()
    .trim()
    .replace(/ & /g, '-')
    .replace(/ /g, '-');

const contestCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [64, 'Category name cannot exceed 64 characters'],
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    description: {
      type: String,
      default: '',
      maxlength: 300,
    },
    color: {
      type: String,
      default: '#78716c',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      description: 'Inactive categories are hidden from the public filter',
    },
    subcategories: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

contestCategorySchema.index({ sortOrder: 1, name: 1 });

const ContestCategory = mongoose.model('ContestCategory', contestCategorySchema);
ContestCategory.slugifyCategory = slugifyCategory;

module.exports = ContestCategory;
