/**
 * DeletionEvent Model (mirror)
 *
 * MIRROR of Phase2 backend/src/modules/auth/deletionEvent.model.js — same
 * collection ('deletionevents'), same field names. Phase2 owns the executor
 * and the reaper; the dashboard only creates and displays events.
 *
 * Why the dashboard creates rows itself: the dashboard's purge can't call
 * Phase2's HTTP endpoint without sharing an admin token secret, so instead it
 * inserts a scheduled DeletionEvent and lets Phase2's hourly reaper execute
 * the full cascade (deletionevents doubles as the reaper's work queue — any
 * scheduled event with scheduledPurgeAt ≤ now gets executed by Phase2's
 * accountPurgeJob, which handles a missing user doc by cleaning references
 * only).
 *
 * COLLECTION: 'deletionevents'
 */

const mongoose = require("mongoose");

const deletionEventSchema = new mongoose.Schema(
  {
    // Subject of the deletion. Index: reaper + admin log lookups.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot — survives the user document.
    userEmail: { type: String, required: true },
    username: { type: String, default: "" },

    // Who scheduled it: the user themselves or an admin (dashboard).
    trigger: {
      type: String,
      enum: ["user_self", "admin"],
      default: "admin",
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Free-text reason captured at scheduling.
    reason: { type: String, default: "", maxlength: 500 },

    // scheduled          → grace window running
    // cancelled          → user/admin backed out (terminal, kept for the trail)
    // completed          → cascade ran, user doc removed
    // failed_partial     → cascade ran with errors; Phase2's reaper retries
    phase: {
      type: String,
      enum: ["scheduled", "cancelled", "completed", "failed_partial"],
      default: "scheduled",
      index: true,
    },

    scheduledAt: { type: Date, default: Date.now },
    scheduledPurgeAt: { type: Date, default: null, index: true },
    executedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    // Number of executePurge attempts (Phase2's reaper retries).
    attempts: { type: Number, default: 0 },

    // Per-collection results of the last execution attempt (written by Phase2).
    contentCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Sanity deletion attempts with outcome (written by Phase2).
    sanityResults: [
      {
        id: { type: String, required: true },
        kind: { type: String, enum: ["post", "draft", "asset"], required: true },
        ok: { type: Boolean, required: true },
        error: { type: String, default: "" },
      },
    ],

    // Non-fatal error messages from the last attempt (written by Phase2).
    errors: [{ type: String, maxlength: 500 }],
  },
  { timestamps: true }
);

// Reaper work-queue scan (identical to Phase2's partial index).
deletionEventSchema.index(
  { phase: 1, scheduledPurgeAt: 1 },
  {
    name: "idx_phase_purge",
    partialFilterExpression: { phase: { $in: ["scheduled", "failed_partial"] } },
  }
);

module.exports = mongoose.model("DeletionEvent", deletionEventSchema, "deletionevents");
