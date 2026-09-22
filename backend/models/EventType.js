/**
 * EventType Model (admin-dashboard)
 * Mirrors the main backend model (Phase2/backend/src/modules/events/
 * eventType.model.js). Same collection, same fields — keep in sync.
 *
 * eventType is the events-v1.1 pipeline enum; this collection drives
 * ordering, active/inactive control, and the admin UI.
 */

const mongoose = require('mongoose');

// snake_case to match the pipeline's eventType enum ("Trade Show" → "trade_show").
const slugifyEventType = (name) =>
  String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, '_');

const eventTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Event type name is required'],
      trim: true,
      maxlength: [64, 'Event type name cannot exceed 64 characters'],
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      description: 'snake_case value matching the pipeline eventType enum',
    },
    description: {
      type: String,
      default: '',
      maxlength: 300,
    },
    color: {
      type: String,
      default: '#3b82f6',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

eventTypeSchema.index({ sortOrder: 1, name: 1 });

// Collection renamed 2026-09: `eventtypes` → `eventcategories` (the Phase2
// events module was renamed EventType→EventCategory; legacy `eventtypes` was
// dropped by scripts/migrateTaxonomyFinal.js). Model name kept for API compat.
const EventType = mongoose.model('EventType', eventTypeSchema, 'eventcategories');
EventType.slugifyEventType = slugifyEventType;

module.exports = EventType;
