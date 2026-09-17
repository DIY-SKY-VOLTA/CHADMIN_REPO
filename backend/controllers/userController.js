const User = require('../models/User');
const BlogSubmission = require('../models/BlogSubmission');
const { logAction } = require('./activityLogController');

exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const role = req.query.role || 'all'; // 'all' | 'admins' | 'verified' | 'writers'

    const query = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Filter by role
    if (role === 'admins') {
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
    const user = await User.findById(req.params.id)
      .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires -refreshTokens')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [approved, rejected, pending] = await Promise.all([
      BlogSubmission.countDocuments({ 'author.userId': user._id, status: 'approved' }),
      BlogSubmission.countDocuments({ 'author.userId': user._id, status: 'rejected' }),
      BlogSubmission.countDocuments({ 'author.userId': user._id, status: 'pending' }),
    ]);
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
