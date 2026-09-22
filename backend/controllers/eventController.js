/**
 * Event Controller (admin-dashboard)
 * Direct-DB admin CRUD over the shared `events` collection — mirrors the main
 * backend module (Phase2/backend/src/modules/events/events.controller.js).
 *
 * - Reads stay scoped to this dashboard (JWT-protected at the router level).
 * - DELETE is a soft archive by default; `?hard=true` permanently removes.
 * - Updates use a field whitelist + $set so untouched pipeline fields
 *   (source, metadata, stats, trust, Mixed arrays) are never clobbered.
 */

const mongoose = require('mongoose');
const Event = require('../models/Event');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Top-level fields the dashboard is allowed to write. `image` is handled
// separately with dotted paths so backup/gallery survive partial edits.
const EDITABLE_FIELDS = [
  'title',
  'headline',
  'slug',
  'eventType',
  'shortSummary',
  'mediumSummary',
  'detailedOverview',
  'topics',
  'tags',
  'flags',
  'eventDates',
  'registration',
  'venue',
  'organizer',
  'contact',
  'eventInsights',
  'seo',
  'status',
  'visibility',
  'audienceScope',
  'featured',
  'heroBanner',
  'featuredPriority',
  'trendingUntil',
  'isRecurring',
  'recurrence',
  // Embedded detail groups — edited from the Event Details page. Arrays of
  // loose objects (pipeline v3.1 schema) + the preparation checklist.
  'speakers',
  'people',
  'agenda',
  'faqs',
  'pricing',
  'preparation',
];

const SORTABLE = {
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
  startDate: 'eventDates.start',
  title: 'title',
  featuredPriority: 'featuredPriority',
};

function buildIdQuery(id) {
  if (mongoose.isValidObjectId(id)) return { _id: id };
  const lower = String(id).toLowerCase();
  return { $or: [{ eventId: lower }, { slug: lower }] };
}

/**
 * Flatten plain-object payloads into dotted $set paths so partial subdoc
 * edits (e.g. venue.address.city) MERGE instead of replacing the whole
 * parent object — untouched sibling fields survive. Arrays and primitives
 * stay as leaves.
 */
function flattenForSet(value, prefix, out) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    out[prefix] = value;
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    out[prefix] = value;
    return;
  }
  for (const key of keys) {
    flattenForSet(value[key], prefix ? `${prefix}.${key}` : key, out);
  }
}

// ─── Event Details (embedded speaker/agenda/faq/pricing/preparation groups) ───
// Events keep their detail content ON the event document (unlike contests,
// which use a separate contest_details collection). These endpoints expose a
// focused editing surface; writes go through updateEvent's whitelist so the
// public site (which renders event.speakers / event.agenda / event.faqs
// directly) sees changes immediately.

// Summary of which detail groups each event has — powers the list-page badges.
exports.listEventsWithDetails = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const search = (req.query.search || '').trim();
    const status = req.query.status || 'all';

    const filter = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: rx }, { headline: rx }, { slug: rx }];
    }
    if (status !== 'all') filter.status = status;

    const [events, total] = await Promise.all([
      Event.find(filter)
        .select('title headline slug eventType status image eventDates venue speakers people agenda faqs pricing preparation updatedAt')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter),
    ]);

    res.json({
      success: true,
      events,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Focused read for the details editor — the full doc minus pipeline metadata.
exports.getEventDetails = async (req, res) => {
  try {
    const event = await Event.findOne(buildIdQuery(req.params.id))
      .select('-metadata')
      .lean({ virtuals: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Save details — reuses updateEvent (whitelist + flatten) by faking the
// request through it, so all validation and side-effects stay in one place.
exports.saveEventDetails = async (req, res) => {
  req.body = {
    speakers: req.body.speakers,
    people: req.body.people,
    agenda: req.body.agenda,
    faqs: req.body.faqs,
    pricing: req.body.pricing,
    preparation: req.body.preparation,
  };
  return exports.updateEvent(req, res);
};

exports.getEventStats = async (req, res) => {
  try {
    const now = new Date();
    const [total, published, draft, cancelled, archived, featured, upcoming] = await Promise.all([
      Event.countDocuments({}),
      Event.countDocuments({ status: 'published' }),
      Event.countDocuments({ status: 'draft' }),
      Event.countDocuments({ status: 'cancelled' }),
      Event.countDocuments({ status: 'archived' }),
      Event.countDocuments({ featured: true }),
      Event.countDocuments({ status: 'published', 'eventDates.start': { $gte: now } }),
    ]);
    res.json({ success: true, stats: { total, published, draft, cancelled, archived, featured, upcoming } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.listEvents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = {};
    const { search, status, eventType, mode, audienceScope, featured } = req.query;

    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ title: rx }, { headline: rx }, { slug: rx }, { eventId: rx }];
    }
    if (status && status !== 'all') filter.status = status;
    if (eventType && eventType !== 'all') filter.eventType = eventType;
    if (mode && mode !== 'all') filter['venue.mode'] = mode;
    if (audienceScope && audienceScope !== 'all') filter.audienceScope = audienceScope;
    if (featured === 'true') filter.featured = true;
    if (featured === 'false') filter.featured = false;

    const [sortKey, sortDirRaw] = String(req.query.sortBy || 'updatedAt:desc').split(':');
    const sortBy = SORTABLE[sortKey] || 'updatedAt';
    const sortOrder = sortDirRaw === 'asc' ? 1 : -1;

    const [events, total] = await Promise.all([
      Event.find(filter)
        .select('-metadata')
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean({ virtuals: true }),
      Event.countDocuments(filter),
    ]);

    res.json({
      success: true,
      events,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findOne(buildIdQuery(req.params.id)).select('-metadata').lean({ virtuals: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const payload = {};
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    if (!payload.title || !payload.title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!payload.status) payload.status = 'draft';

    if (req.body.image && (req.body.image.url || req.body.image.alt)) {
      payload.image = {
        primary: { url: req.body.image.url || undefined, source: 'external' },
        alt: req.body.image.alt || undefined,
      };
    }

    try {
      const event = await Event.create(payload);
      res.status(201).json({ success: true, event: event.toJSON(), message: 'Event created' });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'An event with the same slug/eventId already exists — tweak the title or slug and retry',
        });
      }
      throw err;
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const existing = await Event.findOne(buildIdQuery(req.params.id)).select('_id');
    if (!existing) return res.status(404).json({ success: false, message: 'Event not found' });

    const raw = {};
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) raw[key] = req.body[key];
    }
    const update = {};
    for (const [key, value] of Object.entries(raw)) {
      flattenForSet(value, key, update);
    }

    // Dotted image update — preserves image.backup / image.gallery
    if (req.body.image) {
      if (req.body.image.url !== undefined) update['image.primary.url'] = req.body.image.url || null;
      if (req.body.image.alt !== undefined) update['image.alt'] = req.body.image.alt || null;
    }

    // Lifecycle side-effects
    if (update.status === 'archived') {
      update.archivedAt = new Date();
    } else if (update.status !== undefined) {
      update.archivedAt = null;
    }

    // Keep the derived year in sync with the start date
    if (update['eventDates.start'] !== undefined) {
      if (update['eventDates.start'] === null) {
        update.year = null;
      } else {
        const d = new Date(update['eventDates.start']);
        update.year = isNaN(d.getTime()) ? null : d.getUTCFullYear();
      }
    }

    try {
      const event = await Event.findByIdAndUpdate(
        existing._id,
        { $set: update },
        { new: true, runValidators: false }
      )
        .select('-metadata')
        .lean({ virtuals: true });
      res.json({ success: true, event, message: `"${event.title || 'Event'}" updated` });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Another event already uses that slug/eventId — pick a different slug',
        });
      }
      throw err;
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const query = buildIdQuery(req.params.id);

    if (req.query.hard === 'true') {
      const deleted = await Event.findOneAndDelete(query).select('title').lean();
      if (!deleted) return res.status(404).json({ success: false, message: 'Event not found' });
      return res.json({ success: true, message: `"${deleted.title || 'Event'}" permanently deleted` });
    }

    const event = await Event.findOneAndUpdate(
      query,
      { $set: { status: 'archived', archivedAt: new Date() } },
      { new: true }
    )
      .select('title status archivedAt')
      .lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event, message: `"${event.title || 'Event'}" archived` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
