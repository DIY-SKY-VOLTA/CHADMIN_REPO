const User = require('../models/User');
const BlogSubmission = require('../models/BlogSubmission');
const Comment = require('../models/Comment');
const { logAction } = require('./activityLogController');

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

    // Get user's blog submissions
    const submissions = await BlogSubmission.find({ 'author.userId': user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

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
    await user.save();

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
    await user.save();

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
    await user.save();

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
 * every login AND every token refresh, so bans take effect within minutes
 * even for users with valid sessions (JWTs expire after 15 minutes).
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

    user.accountStatus = status;
    user.statusReason = status === 'active' ? '' : String(reason || '').slice(0, 300);
    user.statusChangedAt = new Date();
    await user.save();

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
 * DELETE /users/:id
 * Soft-delete a user account. The document is kept (blog submissions and
 * comments keep their author references and stats) but the user vanishes
 * from every list and can never log in again.
 * Refuses: admins, already-deleted users, and self-delete.
 * Anonymous orphan comments (userId with no author name) are blanked so
 * they show as [deleted user].
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

    user.deleted = true;
    user.deletedAt = new Date();
    user.accountStatus = 'banned';
    user.statusReason = user.statusReason || 'Account deleted by admin';
    user.refreshTokens = [];
    await user.save();

    // Their anonymous comments lose the author linkage — content stays for
    // thread integrity but shows as removed-user rather than a live account.
    await Comment.updateMany(
      { userId: id, $or: [{ name: { $exists: false } }, { name: null }, { name: '' }] },
      { $set: { name: '[deleted user]' } }
    );

    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'delete_user',
      description: `Soft-deleted account "${user.username}" (${submissions} blog submissions, ${comments} comments kept for record)`,
      targetId: id,
      targetType: 'user',
      metadata: { username: user.username, submissions, comments },
    });

    res.json({
      success: true,
      message: `${user.username} deleted. Their ${submissions} blog submission(s) and ${comments} comment(s) remain for the record.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
