/**
 * SearchLog Model (mirror)
 *
 * Read-only mirror of Phase2's backend/src/core/models/searchLog.model.js —
 * both apps share the ContestHopperDb, so this maps to the same `searchlogs`
 * collection the writer backend writes on every search. The admin dashboard
 * never writes here; it only aggregates.
 *
 * IMPORTANT: keep field names in sync with the Phase2 model. The TTL index
 * (90d) is declared there — MongoDB TTL is per-index, and since both apps
 * declare it the behavior is idempotent.
 */

const mongoose = require("mongoose");

const searchLogSchema = new mongoose.Schema(
  {
    query: { type: String, required: true },
    resultCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    searchType: { type: String, default: "unknown" },
    scope: { type: String, default: "contest" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
    collection: "searchlogs",
  }
);

searchLogSchema.index({ query: 1, createdAt: -1 });
searchLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SearchLog", searchLogSchema);
