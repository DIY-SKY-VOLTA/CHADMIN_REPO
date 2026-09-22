const User = require('../models/User');
const BlogSubmission = require('../models/BlogSubmission');
const Comment = require('../models/Comment');
const ActivityLog = require('../models/ActivityLog');
const DeletionEvent = require('../models/DeletionEvent');
const { logAction } = require('./activityLogController');

// ── Deletion lifecycle (Phase2 integration) ──────────────────────────────
// Phase2 (main app) runs an hourly accountPurgeJob whose work queue IS the
// deletionevents collection: any event with phase ∈ {scheduled,
// failed_partial} and scheduledPurgeAt ≤ now gets the full cascade executed
// (Sanity posts erased, comments anonymized, likes/views/notifications/push
// subscriptions/images cleaned, user doc removed — idempotent, with retry).
// The dashboard therefore never hard-deletes directly: it schedules an event
// and lets the reaper do the destructive work.
const GRACE_DAYS = 30;
const purgeDateLabel = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Clear the reaper's appointment fields (restore/cancel paths MUST call this
// or Phase2's purge job deletes the account on schedule while the dashboard
// shows it as active).
const clearDeletionFields = (user) => {
  user.deletionRequestedAt = null;
  user.scheduledPurgeAt = null;
  user.deletionReason = '';
};

// Mark every open scheduled event for a user as cancelled (the trail keeps
// the row; Phase2's reaper stops seeing it).
const cancelOpenDeletionEvents = (userId) =>
  DeletionEvent.updateMany(
    { userId, phase: 'scheduled' },
    { $set: { phase: 'cancelled', cancelledAt: new Date() } }
  );

exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const role = req.query.role || 'all'; // 'all' | 'admins' | 'verified' | 'writers'

    const query = { deleted: { $ne: true } };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Filter by role
    if (role === 'banned') {
      query.accountStatus = { $in: ['banned', 'suspended'] };
    } else if (role === 'pending_deletion') {
      // Accounts scheduled for deletion (self-service has deleted=false,
      // admin-scheduled has deleted=true) — visible until cancelled or purged.
      query.accountStatus = 'deletion_pending';
      delete query.deleted;
    } else if (role === 'admins') {
      query.isAdmin = true;
    } else if (role === 'verified') {
      query.isVerified = true;
      query.isAdmin = false;
    } else if (role === 'writers') {
      // Writers: non-admins with at least one approved blog
      // We'll do a two-step: get non-admin user IDs with approved blogs, then filter
      query.isAdmin = false;
    }
    // 'all' — no additional filter, includes all users (admins + non-admins)

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires -refreshTokens')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Enrich with writer stats — tier rules MUST match Phase2
    // backend/src/modules/blogs/writerTrust.js (shared User collection):
    //   new 0–1 · verified 2–4 · trusted 5+ · override wins · demoted → new
    let enriched = await Promise.all(users.map(async (u) => {
      const [approved, rejected, pending] = await Promise.all([
        BlogSubmission.countDocuments({ 'author.userId': u._id, status: 'approved' }),
        BlogSubmission.countDocuments({ 'author.userId': u._id, status: 'rejected' }),
        BlogSubmission.countDocuments({ 'author.userId': u._id, status: 'pending' }),
      ]);
      let tier = approved >= 5 ? 'trusted' : approved >= 2 ? 'verified' : 'new';
      if (u.writerDemoted) tier = 'new';
      if (u.writerTierOverride) tier = u.writerTierOverride;
      return {
        ...u,
        writerStats: {
          approved, rejected, pending, tier,
          demoted: !!u.writerDemoted,
          override: u.writerTierOverride || null,
        },
      };
    }));

    // Post-filter for writers role (users with at least one approved blog)
    if (role === 'writers') {
      enriched = enriched.filter(u => u.writerStats.approved > 0);
    }

    // Recalculate total for writers role
    let totalCount = total;
    if (role === 'writers') {
      // Get count of non-admin users with at least one approved blog
      const writerUserIds = await BlogSubmission.distinct('author.userId', { status: 'approved' });
      const adminIds = await User.find({ isAdmin: true }).distinct('_id');
      const nonAdminWriterIds = writerUserIds.filter(id => !adminIds.some(aid => aid.equals(id)));
      totalCount = nonAdminWriterIds.length;
    }

    res.json({
      success: true,
      users: enriched,
      pagination: { page, limit, total: totalCount, pages: Math.ceil(totalCount / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const [user, approved, rejected, pending] = await Promise.all([
      User.findById(req.params.id)
        .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires -refreshTokens')
        .lean(),
      BlogSubmission.countDocuments({ 'author.userId': req.params.id, status: 'approved' }),
      BlogSubmission.countDocuments({ 'author.userId': req.params.id, status: 'rejected' }),
      BlogSubmission.countDocuments({ 'author.userId': req.params.id, status: 'pending' }),
    ]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // Tier rules MUST match Phase2 backend/src/modules/blogs/writerTrust.js
    let tier = approved >= 5 ? 'trusted' : approved >= 2 ? 'verified' : 'new';
    if (user.writerDemoted) tier = 'new';
    if (user.writerTierOverride) tier = user.writerTierOverride;

    // Get user's blog submissions + admin activity touching this user + live sessions
    const [submissions, activity, sessionDoc] = await Promise.all([
      BlogSubmission.find({ 'author.userId': user._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      ActivityLog.find({ targetId: String(user._id), targetType: 'user' })
        .sort({ createdAt: -1 })
        .limit(15)
        .select('adminName action description createdAt')
        .lean(),
      // refreshTokens are stripped from the main select — pull separately.
      User.findById(user._id).select('refreshTokens').lean(),
    ]);

    // Active session count from live refresh tokens (what "log out everywhere"
    // would revoke). Only the device label + age is shown — never token hashes.
    const sessions = (sessionDoc?.refreshTokens || []).map(t => ({
      device: t.device || 'Unknown device',
      lastUsedAt: t.lastUsedAt || null,
      expiresAt: t.expiresAt || null,
    }));

    res.json({
      success: true,
      user: {
        ...user,
        writerStats: {
          approved, rejected, pending, tier,
          demoted: !!user.writerDemoted,
          override: user.writerTierOverride || null,
        },
        submissions,
        activity,
        sessions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /users/:id/writer-tier
 * Manual trust-tier override for a writer. Persists to the shared User
 * collection; Phase2's writerTrust engine reads it on every submission.
 *  - tier: 'new' | 'verified' | 'trusted' — forces that tier
 *  - tier: '' (empty)  — clears the override, back to automatic
 *  - clearDemotion: true — also clears a rejection-based demotion flag
 */
exports.setWriterTier = async (req, res) => {
  try {
    const { id } = req.params;
    const { tier, clearDemotion } = req.body;

    const VALID = ['new', 'verified', 'trusted', ''];
    if (!VALID.includes(tier)) {
      return res.status(400).json({ success: false, message: 'tier must be new, verified, trusted, or empty to clear' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Admins do not have writer tiers' });
    }
    user.writerTierOverride = tier;
    if (clearDemotion) user.writerDemoted = false;
    await user.save({ validateModifiedOnly: true });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'set_writer_tier',
      description: `Set writer tier override for "${user.username}" to ${tier === '' ? 'automatic' : tier}${clearDemotion ? ' (demotion cleared)' : ''}`,
      targetId: id,
      targetType: 'user',
      metadata: { tier, clearDemotion: !!clearDemotion },
    });

    res.json({
      success: true,
      message: tier === ''
        ? `Override cleared — ${user.username} is back on the automatic tier`
        : `Tier override set: ${user.username} → ${tier}`,
      writerTierOverride: user.writerTierOverride,
      writerDemoted: user.writerDemoted,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isAdmin = !user.isAdmin;
    await user.save({ validateModifiedOnly: true });

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'toggle_admin',
      description: user.isAdmin
        ? `Granted admin privileges to "${user.username}"`
        : `Revoked admin privileges from "${user.username}"`,
      targetId: id,
      targetType: 'user',
      metadata: { isAdmin: user.isAdmin },
    });

    res.json({
      success: true,
      message: user.isAdmin ? 'Admin privileges granted' : 'Admin privileges revoked',
      user: { _id: user._id, username: user.username, isAdmin: user.isAdmin },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleVerifiedStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isVerified = !user.isVerified;
    await user.save({ validateModifiedOnly: true });

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'toggle_verified',
      description: user.isVerified
        ? `Verified email for "${user.username}"`
        : `Revoked verification for "${user.username}"`,
      targetId: id,
      targetType: 'user',
      metadata: { isVerified: user.isVerified },
    });

    res.json({
      success: true,
      message: user.isVerified ? 'Email verified' : 'Verification revoked',
      user: { _id: user._id, username: user.username, isVerified: user.isVerified },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWriterStats = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID required' });

    const [user, approved, rejected, pending] = await Promise.all([
      User.findById(userId).select('writerTierOverride writerDemoted').lean(),
      BlogSubmission.countDocuments({ 'author.userId': userId, status: 'approved' }),
      BlogSubmission.countDocuments({ 'author.userId': userId, status: 'rejected' }),
      BlogSubmission.countDocuments({ 'author.userId': userId, status: 'pending' }),
    ]);
    // Tier rules MUST match Phase2 backend/src/modules/blogs/writerTrust.js
    let tier = approved >= 5 ? 'trusted' : approved >= 2 ? 'verified' : 'new';
    if (user?.writerDemoted) tier = 'new';
    if (user?.writerTierOverride) tier = user.writerTierOverride;

    res.json({
      success: true,
      writerStats: {
        approved, rejected, pending, tier,
        demoted: !!user?.writerDemoted,
        override: user?.writerTierOverride || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /users/:id/status
 * Ban or suspend an account. Phase2's auth layer checks accountStatus on
 * EVERY request (login, refresh, and per-request middleware), so bans land
 * within seconds even for users with open sessions.
 * Restoring ('active') a pending-deletion account cancels the scheduled
 * purge — deletion_pending/deleted themselves are managed by the deletion
 * lifecycle (DELETE /:id schedules, /:id/restore cancels).
 * Body: { status: 'banned' | 'suspended' | 'active', reason?: string }
 */
exports.setAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const VALID = ['active', 'suspended', 'banned'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be active, suspended, or banned' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be banned or suspended — revoke admin first if needed' });
    }
    if (user._id.equals(req.admin.id)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own account status' });
    }

    const previousStatus = user.accountStatus;

    // Restoring a pending-deletion account is a full lifecycle cancellation:
    // unlock the login lock AND clear the reaper's appointment, or Phase2's
    // purge job deletes the account on schedule while the dashboard shows
    // "active".
    if (status === 'active' && previousStatus === 'deletion_pending') {
      user.deleted = false;
      user.deletedAt = null;
      clearDeletionFields(user);
      await cancelOpenDeletionEvents(user._id);
    }

    user.accountStatus = status;
    user.statusReason = status === 'active' ? '' : String(reason || '').slice(0, 300);
    user.statusChangedAt = new Date();
    if (status !== 'active') user.refreshTokens = [];
    await user.save({ validateModifiedOnly: true });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'set_account_status',
      description: `${status === 'active' ? 'Restored access for' : status === 'banned' ? 'Banned' : 'Suspended'} "${user.username}"${status !== 'active' && user.statusReason ? ` — reason: ${user.statusReason}` : ''}`,
      targetId: id,
      targetType: 'user',
      metadata: { status, reason: user.statusReason },
    });

    res.json({
      success: true,
      message: status === 'active'
        ? `Access restored for ${user.username}`
        : `${user.username} is now ${status}`,
      accountStatus: user.accountStatus,
      statusReason: user.statusReason,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /users/:id — schedule a deletion through the lifecycle.
 *
 * The account locks immediately (deleted=true blocks login entirely, no
 * self-service cancel) and Phase2's hourly reaper executes the full cascade
 * after the 30-day grace period: Sanity posts erased, comments anonymized as
 * "[Deleted User]" (threads preserved), likes/views/notifications/push
 * subscriptions/images cleaned, user doc removed. A DeletionEvent row is the
 * auditable work-queue entry.
 * Refuses: admins, already-deleted users, and self-delete.
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be deleted — revoke admin first if needed' });
    }
    if (user._id.equals(req.admin.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    if (user.deleted) {
      return res.status(400).json({ success: false, message: 'User is already deleted' });
    }

    const [submissions, comments] = await Promise.all([
      BlogSubmission.countDocuments({ 'author.userId': id }),
      Comment.countDocuments({ userId: id, isDeleted: { $ne: true } }),
    ]);

    // ── Schedule the deletion (Phase2 lifecycle) ──
    const now = new Date();
    const scheduledPurgeAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    const reason = String(req.body?.reason || 'Admin-scheduled deletion').slice(0, 500);

    user.deleted = true;
    user.deletedAt = now;
    user.accountStatus = 'deletion_pending';
    user.statusReason = `Admin-scheduled deletion: ${reason.slice(0, 280)}`;
    user.deletionRequestedAt = now;
    user.scheduledPurgeAt = scheduledPurgeAt;
    user.deletionReason = reason;
    user.refreshTokens = [];
    await user.save({ validateModifiedOnly: true });

    // Work-queue row — Phase2's accountPurgeJob picks this up once the grace
    // period ends and runs executePurge (idempotent, with retry).
    const event = await DeletionEvent.create({
      userId: user._id,
      userEmail: user.email,
      username: user.username,
      trigger: 'admin',
      actorId: req.admin.id,
      reason,
      phase: 'scheduled',
      scheduledPurgeAt,
    });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'delete_user',
      description: `Scheduled deletion of "${user.username}" — purge on ${purgeDateLabel(scheduledPurgeAt)} (${submissions} blog submissions, ${comments} comments in scope)`,
      targetId: id,
      targetType: 'user',
      metadata: { username: user.username, submissions, comments, scheduledPurgeAt, eventId: event._id },
    });

    res.json({
      success: true,
      message: `${user.username} scheduled for deletion on ${purgeDateLabel(scheduledPurgeAt)} (30-day grace — restore cancels). At purge: ${submissions} blog submission(s) erased, ${comments} comment(s) anonymized.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /users?role=deleted
 * Lists soft-deleted accounts (newest deletion first) so admins can review,
 * restore, or permanently remove them (e.g. cleaning out test accounts).
 */
exports.listDeletedUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();

    const query = { deleted: true };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshTokens -__v')
        .sort({ deletedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      users,
      pagination: { total, page, pages: Math.ceil(total / limit) || 1, limit },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /users/:id/restore
 * Undo a soft delete — the account becomes visible again. For an account
 * scheduled for deletion this is ALSO the cancel: the reaper's appointment
 * is cleared and open DeletionEvents are marked cancelled (a pre-existing
 * ban still applies and must be lifted separately).
 */
exports.restoreUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.deleted) {
      return res.status(400).json({ success: false, message: 'User is not deleted' });
    }

    const wasPending = user.accountStatus === 'deletion_pending';

    user.deleted = false;
    user.deletedAt = undefined;
    // Restore doubles as the CANCEL path for a scheduled deletion: clear the
    // reaper's appointment, or Phase2's purge job deletes this account on
    // schedule even though the dashboard shows it as active.
    clearDeletionFields(user);
    if (wasPending) {
      user.accountStatus = 'active';
      user.statusReason = '';
      user.statusChangedAt = new Date();
      await cancelOpenDeletionEvents(user._id);
    }
    await user.save({ validateModifiedOnly: true });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'restore_user',
      description: wasPending
        ? `Restored "${user.username}" and CANCELLED the scheduled deletion (purge aborted)`
        : `Restored deleted account "${user.username}"`,
      targetId: id,
      targetType: 'user',
      metadata: { username: user.username, cancelledDeletion: wasPending },
    });

    res.json({
      success: true,
      message: wasPending
        ? `${user.username} restored — scheduled deletion cancelled, the account is active again.`
        : `${user.username} restored — the account is active again.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /users/:id/purge — immediate lifecycle purge (legacy escape hatch).
 *
 * Prefer DELETE /:id (schedules the cascade with a 30-day grace + cancel
 * window). This endpoint exists for the Deleted-view's typed-confirmation
 * flow on test/spam accounts where waiting out the grace period is
 * pointless: instead of deleting directly (which used to orphan comments,
 * likes, notifications, push subscriptions and Sanity posts), it moves the
 * account's scheduledPurgeAt to NOW and lets Phase2's reaper execute the
 * full cascade within the hour — with retry and an audit trail.
 * Guards unchanged: no admins, no self-purge.
 */
exports.purgeUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be purged — revoke admin first if needed' });
    }
    if (String(user._id) === String(req.admin.id)) {
      return res.status(400).json({ success: false, message: 'You cannot purge your own account' });
    }

    // Content-bearing accounts ARE purgeable here (typed confirmation on the
    // frontend is the gate) — the cascade handles their content properly.
    const now = new Date();
    const existingEvent = await DeletionEvent.findOne({ userId: id, phase: 'scheduled' });

    if (user.accountStatus === 'deletion_pending' && existingEvent) {
      // Already scheduled → expedite: pull the purge date to now.
      existingEvent.scheduledPurgeAt = now;
      await existingEvent.save();
      await User.findByIdAndUpdate(id, { $set: { scheduledPurgeAt: now } });
      logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: 'purge_user',
        description: `EXPEDITED scheduled deletion of "${user.username}" (${user.email}) — purge moved to now`,
        targetId: id,
        targetType: 'user',
        metadata: { username: user.username, email: user.email, expedited: true, eventId: existingEvent._id },
      });
      return res.json({
        success: true,
        message: `${user.username}'s deletion expedited — the cascade (posts erased, comments anonymized, references cleaned) runs within the hour.`,
      });
    }

    // Not scheduled yet (legacy soft-delete or live account) → schedule with
    // an immediate purge date so the reaper picks it up on the next run.
    const event = await DeletionEvent.create({
      userId: user._id,
      userEmail: user.email,
      username: user.username,
      trigger: 'admin',
      actorId: req.admin.id,
      reason: 'Immediate purge via admin dashboard',
      phase: 'scheduled',
      scheduledPurgeAt: now,
    });
    await User.findByIdAndUpdate(id, {
      $set: {
        accountStatus: 'deletion_pending',
        deleted: true,
        deletedAt: user.deletedAt || now,
        deletionRequestedAt: now,
        scheduledPurgeAt: now,
        deletionReason: 'Immediate purge via admin dashboard',
      },
      $unset: { refreshTokens: 1 },
    });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'purge_user',
      description: `Scheduled IMMEDIATE purge of "${user.username}" (${user.email}) — Phase2 cascade runs within the hour`,
      targetId: id,
      targetType: 'user',
      metadata: { username: user.username, email: user.email, eventId: event._id },
    });

    res.json({
      success: true,
      message: `${user.username} scheduled for immediate purge — the cascade runs within the hour (posts erased, comments anonymized, references cleaned).`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /users/:id/logout-all
 * Kick every active session for a user by revoking all refresh tokens.
 * Phase2's per-request status check runs on every authenticated call, and
 * access tokens themselves are short-lived — so revocation is effectively
 * immediate. Non-destructive:
 * they can simply log back in. For banned/suspended/deleted users the
 * moderation gates already revoke tokens — this covers live/active users
 * (e.g. a compromised account that shouldn't be banned outright).
 */
exports.logoutAllSessions = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Use your own logout for admin accounts' });
    }

    const hadSessions = (user.refreshTokens || []).length;
    user.refreshTokens = [];
    await user.save({ validateModifiedOnly: true });

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'logout_all_sessions',
      description: `Signed out ${hadSessions} session(s) for "${user.username}" on all devices`,
      targetId: id,
      targetType: 'user',
      metadata: { revokedSessions: hadSessions },
    });

    res.json({
      success: true,
      message: hadSessions > 0
        ? `${user.username} signed out of ${hadSessions} session(s) — blocked immediately by the per-request status check`
        : `${user.username} had no active sessions`,
      revokedSessions: hadSessions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /users/bulk
 * Bulk moderation in one call. Actions mirror the single-user endpoints so
 * guards stay identical: admins are skipped (never banned/tiered/deleted),
 * self is refused outright, deletes schedule a lifecycle deletion (30-day
 * grace, cancel via restore), every action is activity-logged.
 * Body: { ids: string[], action: 'ban'|'suspend'|'restore'|'logout_all'|'delete'
 *               tier?: 'new'|'verified'|'trusted'|'' (when action='set_tier'),
 *               reason?: string }
 */
exports.bulkUserAction = async (req, res) => {
  try {
    const { ids, action, tier = '', reason = '' } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids must be a non-empty array' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ success: false, message: 'Bulk actions are capped at 100 users per call' });
    }

    const VALID_ACTIONS = ['ban', 'suspend', 'restore', 'logout_all', 'set_tier', 'delete'];
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, message: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }
    if (action === 'set_tier' && !['new', 'verified', 'trusted', ''].includes(tier)) {
      return res.status(400).json({ success: false, message: 'tier must be new, verified, trusted, or empty' });
    }
    if (ids.includes(String(req.admin.id))) {
      return res.status(400).json({ success: false, message: 'Bulk actions cannot target your own account — remove yourself from the selection' });
    }

    const results = { succeeded: [], failed: [], skippedAdmins: [] };

    for (const id of ids) {
      try {
        const user = await User.findById(id);
        if (!user) { results.failed.push({ id, reason: 'not found' }); continue; }
        if (user.isAdmin) { results.skippedAdmins.push(user.username); continue; }
        if (user.deleted && action !== 'delete') { results.failed.push({ id, reason: 'already deleted' }); continue; }
        if (action === 'delete' && user.accountStatus === 'deletion_pending') {
          results.failed.push({ id, reason: 'already scheduled for deletion' });
          continue;
        }

        switch (action) {
          case 'ban':
          case 'suspend':
          case 'restore': {
            const status = action === 'ban' ? 'banned' : action === 'suspend' ? 'suspended' : 'active';
            const previous = user.accountStatus;
            // Restore of a pending-deletion account cancels the scheduled
            // purge (same semantics as the single-user restore endpoint).
            if (status === 'active' && previous === 'deletion_pending') {
              user.deleted = false;
              user.deletedAt = undefined;
              clearDeletionFields(user);
              await cancelOpenDeletionEvents(user._id);
            }
            user.accountStatus = status;
            user.statusReason = status === 'active' ? '' : String(reason || '').slice(0, 300);
            user.statusChangedAt = new Date();
            if (status !== 'active') user.refreshTokens = [];
            await user.save({ validateModifiedOnly: true });
            break;
          }
          case 'logout_all':
            user.refreshTokens = [];
            await user.save({ validateModifiedOnly: true });
            break;
          case 'set_tier':
            user.writerTierOverride = tier;
            if (tier !== '' && user.writerDemoted && (tier === 'verified' || tier === 'trusted')) {
              user.writerDemoted = false;
            }
            await user.save({ validateModifiedOnly: true });
            break;
          case 'delete': {
            if (user.deleted) { results.failed.push({ id, reason: 'already deleted' }); continue; }
            const now = new Date();
            const scheduledPurgeAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
            const deleteReason = String(reason || 'Admin-scheduled deletion (bulk)').slice(0, 500);
            user.deleted = true;
            user.deletedAt = now;
            user.accountStatus = 'deletion_pending';
            user.statusReason = `Admin-scheduled deletion: ${deleteReason.slice(0, 280)}`;
            user.deletionRequestedAt = now;
            user.scheduledPurgeAt = scheduledPurgeAt;
            user.deletionReason = deleteReason;
            user.refreshTokens = [];
            await user.save({ validateModifiedOnly: true });
            await DeletionEvent.create({
              userId: user._id,
              userEmail: user.email,
              username: user.username,
              trigger: 'admin',
              actorId: req.admin.id,
              reason: deleteReason,
              phase: 'scheduled',
              scheduledPurgeAt,
            });
            break;
          }
        }
        results.succeeded.push(user.username);
      } catch (err) {
        results.failed.push({ id, reason: err.message });
      }
    }

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'bulk_user_action',
      description: `Bulk ${action}${action === 'set_tier' ? ` → ${tier || 'auto'}` : ''} on ${results.succeeded.length} user(s)${results.skippedAdmins.length ? `, ${results.skippedAdmins.length} admin(s) skipped` : ''}${results.failed.length ? `, ${results.failed.length} failed` : ''}${reason ? ` — reason: ${String(reason).slice(0, 200)}` : ''}`,
      targetId: null,
      targetType: null,
      metadata: { action, tier, reason, succeeded: results.succeeded.length, failed: results.failed.length, skippedAdmins: results.skippedAdmins.length, ids },
    });

    res.json({
      success: results.failed.length === 0,
      message: results.failed.length === 0 && results.skippedAdmins.length === 0
        ? `${action} applied to ${results.succeeded.length} user(s)`
        : `${results.succeeded.length} succeeded, ${results.failed.length} failed${results.skippedAdmins.length ? `, ${results.skippedAdmins.length} admin(s) skipped` : ''}`,
      ...results,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
