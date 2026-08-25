/**
 * Event Model (admin-dashboard)
 * Binds to the shared `events` collection in ContestHopperDb, owned by the main
 * backend (Phase2/backend/src/modules/events/event.model.js — v4.0).
 * Mirrors that schema field-for-field so dashboard edits are lossless.
 *
 * Indexes are created and owned by the main backend — autoIndex is disabled
 * here so the admin server never rebuilds/renames them.
 */

const mongoose = require('mongoose');

/* ── Sub-schemas (mirror of Phase2 event.model.js) ─────────────────────── */

const imageSchema = new mongoose.Schema(
  {
    primary: {
      url: { type: String, trim: true },
      source: { type: String, enum: ['external', 'uploaded', 'generated'], default: 'external' },
    },
    backup: {
      url: { type: String, trim: true },
      source: { type: String, default: 'r2' },
      format: { type: String },
      createdAt: { type: Date },
    },
    alt: { type: String, trim: true },
    gallery: [
      {
        url: { type: String, trim: true },
        alt: { type: String, trim: true },
      },
    ],
  },
  { _id: false }
);

const sourceSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    url: { type: String, trim: true },
    scrapedAt: { type: Date },
    lastUpdated: { type: Date },
  },
  { _id: false }
);

const eventDatesSchema = new mongoose.Schema(
  {
    start: { type: Date },
    end: { type: Date },
    timezone: { type: String, trim: true },
    duration: { type: String, trim: true },
  },
  { _id: false }
);

const registrationSchema = new mongoose.Schema(
  {
    deadline: { type: Date, default: null },
    url: { type: String, trim: true, default: null },
    fee: { type: mongoose.Schema.Types.Mixed, default: null },
    currency: { type: String, trim: true, default: null },
    earlyBirdDeadline: { type: Date, default: null },
    earlyBirdFee: { type: mongoose.Schema.Types.Mixed, default: null },
    eligibility: [{ type: String, trim: true }],
    capacity: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['open', 'closed', 'waitlist', null], default: null },
  },
  { _id: false }
);

const venueSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ['online', 'in-person', 'hybrid', 'offline', null],
      default: null,
    },
    venueName: { type: String, trim: true, default: null },
    address: {
      street: { type: String, trim: true, default: null },
      city: { type: String, trim: true, default: null },
      state: { type: String, trim: true, default: null },
      country: { type: String, trim: true, default: null },
      postalCode: { type: String, trim: true, default: null },
      formatted: { type: String, trim: true, default: null },
    },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    googleMapsUrl: { type: String, trim: true, default: null },
    virtualPlatform: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    display: { type: String, trim: true, default: null },
    scope: { type: String, enum: ['city', 'country', 'region', 'worldwide', 'online', 'hybrid', 'multi_location', 'unknown', null], default: null },
    countries: [{ _id: false, name: { type: String, trim: true }, code: { type: String, trim: true, uppercase: true } }],
    region: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    venue: { type: String, trim: true, default: null },
    coordinates: { type: mongoose.Schema.Types.Mixed, default: null },
    precision: { type: String, enum: ['venue', 'city', 'country', 'region', 'worldwide', 'online', 'unknown', null], default: null },
    mapEligible: { type: Boolean, default: false },
  },
  { _id: false }
);

const participationGeographySchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['worldwide', 'countries', 'region', 'unknown', null], default: null },
    allowedCountries: [{ _id: false, name: { type: String, trim: true }, code: { type: String, trim: true, uppercase: true } }],
    allowedRegions: [{ type: String, trim: true }],
    restrictedCountries: [{ _id: false, name: { type: String, trim: true }, code: { type: String, trim: true, uppercase: true } }],
    eligibilitySummary: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const organizerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    website: { type: String, trim: true, default: null },
    email: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    logo: { type: String, trim: true, default: null },
    socialLinks: [{ type: String, trim: true }],
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    website: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const eventInsightsSchema = new mongoose.Schema(
  {
    recommendedFor: [{ type: String, trim: true }],
    difficultyLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced', null], default: null },
    careerValue: { type: Number, min: 1, max: 5, default: null },
    networkingValue: { type: Number, min: 1, max: 5, default: null },
    learningValue: { type: Number, min: 1, max: 5, default: null },
    industryExposure: { type: Number, min: 1, max: 5, default: null },
    overallValue: { type: Number, min: 1, max: 5, default: null },
    reasoning: { type: String, trim: true },
  },
  { _id: false }
);

const seoSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    seoKeywords: [{ type: String, trim: true }],
    canonicalUrl: { type: String, trim: true },
  },
  { _id: false }
);

const qualitySchema = new mongoose.Schema(
  {
    contentCompletenessScore: { type: Number, min: 0, max: 100, default: 0 },
    missingFields: [{ type: String, trim: true }],
    lastValidated: { type: Date },
  },
  { _id: false }
);

const recurrenceSchema = new mongoose.Schema(
  {
    frequency: { type: String, trim: true, default: null },
    interval: { type: Number, default: null },
  },
  { _id: false }
);

const analyticsSchema = new mongoose.Schema(
  {
    views: { type: Number, default: 0 },
    registrations: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
  },
  { _id: false }
);

const metadataSchema = new mongoose.Schema(
  {
    searchLog: [{ type: String, trim: true }],
    fieldConfidence: {
      speakers: { type: String, enum: ['FOUND', 'PARTIAL', 'NOT_FOUND_AFTER_FULL_SEARCH', null], default: null },
      agenda: { type: String, enum: ['FOUND', 'PARTIAL', 'NOT_FOUND_AFTER_FULL_SEARCH', null], default: null },
      pricing: { type: String, enum: ['FOUND', 'PARTIAL', 'NOT_FOUND_AFTER_FULL_SEARCH', null], default: null },
    },
    discoveredEvents: [
      {
        title: { type: String, trim: true },
        url: { type: String, trim: true },
        edition: { type: String, trim: true },
        year: { type: Number },
      },
    ],
    otherListings: [{ type: String, trim: true }],
  },
  { _id: false }
);

const statsSchema = new mongoose.Schema(
  {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    bookmarks: { type: Number, default: 0 },
    registrations: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    attendeeCount: { type: Number },
    lastViewedAt: { type: Date },
  },
  { _id: false }
);

const trustSchema = new mongoose.Schema(
  {
    verificationStatus: { type: String, enum: ['verified', 'pending', 'failed'], default: 'pending' },
    lastVerifiedAt: { type: Date },
    greenFlags: [{ type: String, trim: true }],
    redFlags: [{ type: String, trim: true }],
    notes: [{ type: String, trim: true }],
  },
  { _id: false }
);

/* ── Main schema ───────────────────────────────────────────────────────── */

const eventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true, lowercase: true },
    slug: { type: String, trim: true, lowercase: true },
    schemaVersion: { type: Number, default: 4 },

    type: { type: String, default: 'event' },
    source: sourceSchema,
    title: { type: String, trim: true },
    headline: { type: String, trim: true },
    eventType: {
      type: String,
      enum: ['conference', 'summit', 'workshop', 'webinar', 'meetup', 'expo', 'trade_show', 'career_fair', 'networking_event', 'training_program', 'festival', null],
      default: null,
    },
    shortSummary: { type: String, trim: true },
    mediumSummary: { type: String, trim: true },
    detailedOverview: { type: String, trim: true },
    topics: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    eventDates: eventDatesSchema,
    registration: registrationSchema,
    venue: venueSchema,
    location: locationSchema,
    participationGeography: participationGeographySchema,
    organizer: organizerSchema,
    speakers: [{ type: mongoose.Schema.Types.Mixed }],
    agenda: [{ type: mongoose.Schema.Types.Mixed }],
    pricing: [{ type: mongoose.Schema.Types.Mixed }],
    targetAudience: [{ type: mongoose.Schema.Types.Mixed }],
    benefits: [{ type: mongoose.Schema.Types.Mixed }],
    certifications: [{ type: mongoose.Schema.Types.Mixed }],
    sponsors: [{ type: mongoose.Schema.Types.Mixed }],
    partners: [{ type: mongoose.Schema.Types.Mixed }],
    faqs: [{ type: mongoose.Schema.Types.Mixed }],
    resources: [{ type: mongoose.Schema.Types.Mixed }],
    contact: contactSchema,
    eventInsights: eventInsightsSchema,
    seo: seoSchema,
    quality: qualitySchema,
    flags: [{ type: String, trim: true }],

    audienceScope: { type: String, enum: ['women', 'all'], default: null },
    status: { type: String, enum: ['published', 'draft', 'cancelled', 'archived'], default: 'draft' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    featured: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },
    recurrence: recurrenceSchema,
    analytics: analyticsSchema,
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: metadataSchema,

    hostOrgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },

    year: { type: Number },
    image: imageSchema,
    stats: statsSchema,
    trust: trustSchema,
    trendingUntil: { type: Date, default: null },
    heroBanner: { type: Boolean, default: false },
    featuredPriority: { type: Number, default: 0, min: 0, max: 10 },
    archivedAt: { type: Date, default: null },
  },
  {
    collection: 'events',
    timestamps: true,
    autoIndex: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Slug / eventId derivation (same rules as Phase2) ──────────────────── */

function toSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

function shortHash(input) {
  let hash = 5381;
  const s = String(input || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}

function deriveEventId(base, year, sourceUrl) {
  if (year) return base.includes(String(year)) ? base : `${base}-${year}`;
  if (sourceUrl) return `${base}-${shortHash(sourceUrl)}`;
  return base;
}

eventSchema.pre('validate', async function () {
  if (this.location && !this.location.display && this.venue) {
    const a = this.venue.address;
    if (a && (a.city || a.country)) {
      this.location.display = [a.city, a.country].filter(Boolean).join(', ') || a.formatted || this.venue.venueName || null;
      if (!this.location.city && a.city) this.location.city = a.city;
      if (!this.location.venue && this.venue.venueName) this.location.venue = this.venue.venueName;
      if (a.country && (!this.location.countries || this.location.countries.length === 0)) {
        this.location.countries = [{ name: a.country, code: a.country.length === 2 ? a.country.toUpperCase() : '' }];
      }
      if (!this.location.scope) {
        if (this.venue.mode === 'online') this.location.scope = 'online';
        else if (a.city) this.location.scope = 'city';
        else if (a.country) this.location.scope = 'country';
      }
    } else if (this.venue.mode === 'online') {
      if (!this.location.display) this.location.display = 'Online';
      if (!this.location.scope) this.location.scope = 'online';
    }
  }
  if (this.year == null && this.eventDates && this.eventDates.start) {
    const d = new Date(this.eventDates.start);
    if (!isNaN(d.getTime())) this.year = d.getUTCFullYear();
  }
  if (!this.eventId) {
    const base = toSlug(this.slug) || toSlug(this.title) || 'event';
    this.eventId = deriveEventId(base, this.year, this.source?.url);
  }
  if (!this.slug && this.title) {
    this.slug = toSlug(this.title);
  }
});

/* ── Virtuals ──────────────────────────────────────────────────────────── */

eventSchema.virtual('daysUntil').get(function () {
  const start = this.eventDates?.start;
  if (!start) return null;
  return Math.ceil((new Date(start) - Date.now()) / 86400000);
});

eventSchema.virtual('displayDate').get(function () {
  const start = this.eventDates?.start;
  const end = this.eventDates?.end;
  if (!start) return null;
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = new Date(start).toLocaleDateString('en-US', opts);
  if (!end || start.toString() === end.toString()) return startStr;
  return `${startStr} - ${new Date(end).toLocaleDateString('en-US', opts)}`;
});

eventSchema.virtual('imageUrl').get(function () {
  return this.image?.backup?.url || this.image?.primary?.url || null;
});

eventSchema.virtual('locationLabel').get(function () {
  const a = this.venue?.address;
  if (!a) return null;
  return [a.city, a.state, a.country].filter(Boolean).join(', ') || a.formatted || null;
});

module.exports = mongoose.model('Event', eventSchema);
