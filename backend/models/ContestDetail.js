const mongoose = require('mongoose');

/**
 * AI-generated contest details — MIRRORS Phase2 `backend/models/ContestDetail.js`
 * and writes to the SAME shared Atlas `contest_details` collection.
 *
 * The public contest detail page (frontend-next `/contests/[id]`) renders its
 * "DETAILED GUIDE" section from documents in this collection via
 * `GET /api/contests/:id/details`. Admin-saved details here therefore appear
 * on the live site instantly — no pipeline needed.
 */
const contentSchema = new mongoose.Schema({
  hero: {
    subheadline: { type: String },
    valueProposition: { type: String }
  },
  whyJoin: { type: String },
  whoShouldApply: { type: String },
  benefits: [{ type: String }],
  submissionGuide: [{
    step: { type: String },
    detail: { type: String }
  }],
  timelineSummary: [{
    phase: { type: String },
    date: { type: String },
    label: { type: String }
  }],
  tips: [{ type: String }],
  faq: [{
    question: { type: String },
    answer: { type: String }
  }],
  shouldYouApply: {
    idealFor: { type: String },
    goodFit: [{ type: String }],
    notIdealFor: [{ type: String }]
  },
  readingTime: { type: Number, min: 1 },
  // Hackathon-specific content fields (hackathon-structuring-v1.1.txt)
  judgingProcess: { type: String },          // How judging works: rounds, format, timeline
  mentorshipDetails: { type: String },       // Available mentorship: schedule, format, who provides it
  resourceOfferings: [{
    _id:         false,
    type:        { type: String },   // 'Cloud Credits', 'API Access'
    provider:    { type: String },   // 'Google Cloud', 'OpenAI'
    value:       { type: String },   // '$500 in credits'
    description: { type: String }
  }]
}, { _id: false });

const contestDetailSchema = new mongoose.Schema({
  contestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contests',
    required: true,
    unique: true
  },
  version: { type: Number, default: 1 },
  schemaVersion: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  generatedBy: { type: String },
  generatedAt: { type: Date },
  previousVersionAt: { type: Date },
  changeLog: { type: String },
  content: { type: contentSchema, default: () => ({}) },
  research: {
    officialWebsite: {
      url: { type: String },
      lastFetched: { type: Date }
    },
    faqSources: [{ type: String }],
    redditThreads: [{ type: String }],
    pastWinners: [{ type: String }],
    communityTips: [{ type: String }]
  },
  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: [{ type: String }]
  },
  metadata: {
    pipelineSteps: [{ type: String }],
    qualityScore: { type: Number },
    errors: [{ type: String }]
  }
}, {
  timestamps: true
});

contestDetailSchema.index({ status: 1 });
contestDetailSchema.index({ 'metadata.qualityScore': -1 });

module.exports = mongoose.model('ContestDetail', contestDetailSchema, 'contest_details');
