/**
 * Backfill: normalize `image.backup` from legacy STRING shape → canonical OBJECT shape
 *
 * WHY:
 *   The admin-dashboard previously wrote `image.backup` as a plain URL string
 *   (plus flat `image.backupFormat` / `image.backupAvif` fields). Phase2's
 *   canonical `models/Contests.js` defines `image.backup` as an OBJECT
 *   { url, source:'r2', format, status, createdAt } — the Cloudflare R2 script
 *   output shape. Both apps share the same Atlas `Contests` collection, so the
 *   string docs were silently corrupting the shared schema contract (Doc 12).
 *
 *   This script rewrites every legacy-shaped doc to the canonical object:
 *     { url: <string>, source: 'r2', format: <legacy backupFormat|'webp'>,
 *       status: 'active', createdAt: <now> }
 *   and removes the flat legacy fields.
 *
 * WHAT IT HANDLES:
 *   1. image.backup is a string (non-empty)      → convert to object
 *   2. image.backup is an empty string / ''      → set backup to null (no valid backup)
 *   3. image.backupFormat / image.backupAvif     → unset (AVIF already lives in
 *                                                   image.primary.variants.avif)
 *   4. image.backup already an object            → left intact (idempotent re-run)
 *
 * USAGE:
 *   node scripts/normalizeImageBackupShape.js              # apply
 *   node scripts/normalizeImageBackupShape.js --dry-run    # preview only, no writes
 *
 * SAFETY:
 *   - Uses the raw collection (no model cast interference), matches
 *     scripts/migrateAdmins.js conventions.
 *   - Idempotent: safe to run repeatedly; object-shaped docs are skipped.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`📦 Connected to ${mongoose.connection.name} (dry-run: ${DRY_RUN})\n`);

  const db = mongoose.connection.db;
  const contests = db.collection("Contests");

  // Legacy-shaped docs: string backup, or flat legacy fields present.
  const legacyFilter = {
    $or: [
      { "image.backup": { $type: "string" } },
      { "image.backupFormat": { $exists: true } },
      { "image.backupAvif": { $exists: true } },
    ],
  };

  const totalLegacy = await contests.countDocuments(legacyFilter);
  console.log(`🔍 Found ${totalLegacy} contest(s) with legacy image.backup shape\n`);

  if (totalLegacy === 0) {
    console.log("✅ Nothing to backfill.");
    await mongoose.disconnect();
    return;
  }

  const cursor = contests.find(legacyFilter, {
    projection: { title: 1, image: 1 },
  });

  let converted = 0;
  let emptied = 0;
  let flatOnly = 0;
  let alreadyObject = 0;
  let errors = 0;

  const now = new Date();

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const img = doc.image || {};
    const backup = img.backup;

    try {
      const set = {};
      const unset = {};

      if (typeof backup === "string") {
        if (backup.trim() !== "") {
          // Legacy string → canonical object.
          set["image.backup"] = {
            url: backup,
            source: "r2",
            format: img.backupFormat || "webp",
            status: "active",
            createdAt: now,
          };
          converted++;
        } else {
          // Empty string = no valid backup.
          set["image.backup"] = null;
          emptied++;
        }
      } else if (backup && typeof backup === "object") {
        if (typeof backup.url === "string" && backup.url.trim() !== "") {
          // Already canonical object shape with a valid url — just clean up any stray flat fields.
          alreadyObject++;
        } else if (backup.url === "" || backup.url === undefined || backup.url === null) {
          // Object-shaped but the url is empty/missing — no valid backup. Normalize to null.
          set["image.backup"] = null;
          emptied++;
        } else {
          // Object-shaped but url is a non-string (shouldn't happen) — flag, don't guess.
          console.log(`  ⚠️  ${doc._id} "${doc.title || ''}" — image.backup is an object but url is ${typeof backup.url} (${JSON.stringify(backup.url).slice(0, 40)}), skipping`);
          errors++;
          continue;
        }
      } else if (backup === null || backup === undefined) {
        // No backup value at all — only flat fields remain (backup URL not
        // recoverable from image.backupFormat alone). Nothing to reconstruct.
        flatOnly++;
      } else {
        // Backup exists but is some unexpected non-object type (e.g. number).
        console.log(`  ⚠️  ${doc._id} "${doc.title || ''}" — unexpected image.backup type: ${typeof backup}, skipping`);
        errors++;
        continue;
      }

      // Always unset legacy flat fields if present.
      if (img.backupFormat) unset["image.backupFormat"] = "";
      if (img.backupAvif) unset["image.backupAvif"] = "";

      if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
        continue; // nothing to do
      }

      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;

      if (DRY_RUN) {
        console.log(`  DRY [${doc._id}] "${doc.title || ''}" → ${JSON.stringify(update)}`);
        continue;
      }

      await contests.updateOne({ _id: doc._id }, update);
    } catch (err) {
      console.error(`  ❌ ${doc._id} "${doc.title || ''}" — ${err.message}`);
      errors++;
    }
  }

  console.log("\n──────────────────────────────");
  console.log(`Converted to object : ${converted}`);
  console.log(`Empty-string → null : ${emptied}`);
  console.log(`Already object      : ${alreadyObject}`);
  console.log(`Flat-fields only    : ${flatOnly}`);
  console.log(`Errors              : ${errors}`);
  console.log(`Total legacy scanned: ${totalLegacy}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — nothing written. Re-run without --dry-run to execute.");
  } else {
    console.log("\n✅ Backfill complete. Re-run with --dry-run to confirm 0 remaining.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
