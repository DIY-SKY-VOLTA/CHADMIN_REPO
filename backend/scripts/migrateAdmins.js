/**
 * Migration Script: Copy admin accounts from 'users' collection to dedicated 'admins' collection
 *
 * Usage: node scripts/migrateAdmins.js
 *
 * This script:
 * 1. Finds all users with isAdmin: true in the 'users' collection
 * 2. Copies relevant fields to the 'admins' collection
 * 3. Skips any admin that already exists (matched by email)
 * 4. Reports results
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("📦 Connected to MongoDB\n");

  const db = mongoose.connection.db;

  // Get raw collections to avoid model conflicts
  const usersCollection = db.collection("users");
  const adminsCollection = db.collection("admins");

  // Find all admin users
  const adminUsers = await usersCollection.find({ isAdmin: true }).toArray();
  console.log(`🔍 Found ${adminUsers.length} admin(s) in users collection\n`);

  if (adminUsers.length === 0) {
    console.log("⚠️  No admin users found. Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of adminUsers) {
    try {
      // Check if already migrated
      const existing = await adminsCollection.findOne({ email: user.email });
      if (existing) {
        console.log(`  ⏭️  ${user.email} — already exists in admins collection, skipping`);
        skipped++;
        continue;
      }

      const adminDoc = {
        username: user.username,
        email: user.email,
        password: user.password,
        avatar: user.avatar || "",
        bio: user.bio || "",
        isActive: true,
        lastLoginAt: null,
        createdAt: user.createdAt || new Date(),
        updatedAt: new Date(),
      };

      await adminsCollection.insertOne(adminDoc);
      console.log(`  ✅ ${user.email} (${user.username}) — migrated successfully`);
      migrated++;
    } catch (err) {
      console.error(`  ❌ ${user.email} — error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n📊 Migration complete:`);
  console.log(`   • Migrated: ${migrated}`);
  console.log(`   • Skipped:  ${skipped}`);
  console.log(`   • Errors:   ${errors}`);

  if (migrated > 0) {
    console.log(`\n🔐 IMPORTANT: Update your auth controller to use the Admin model`);
    console.log(`   instead of the User model for admin authentication.`);
  }

  await mongoose.disconnect();
  console.log("\n✅ Done");
}

migrate().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
