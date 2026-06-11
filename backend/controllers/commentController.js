const Comment = require('../models/Comment');
const BlogSubmission = require('../models/BlogSubmission');
const User = require('../models/User');
const { logAction } = require('./activityLogController');

exports.listComments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const filter = req.query.filter || 'all';

    const query = {};
    if (filter === 'active') query.isDeleted = false;
    else if (filter === 'deleted') query.isDeleted = true;

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { comment: { $regex: escaped, $options: 'i' } },
        { postId: { $regex: escaped, $options: 'i' } },
      ];
    }

    const total = await Comment.countDocuments(query);
    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Enrich with post titles and usernames
    const postIds = [...new Set(comments.map(c => c.postId).filter(Boolean))];
    const userIds = [...new Set(comments.map(c => c.userId).filter(Boolean))];

    let postMap = {};
    if (postIds.length > 0) {
      const validIds = postIds.filter(id => /^[0-9a-f]{24}$/i.test(id));
      const submissions = await BlogSubmission.find({
        $or: [{ _id: { $in: validIds } }, { sanityId: { $in: postIds } }],
      }).select('title slug sanityId').lean();
      submissions.forEach(sub => {
        postMap[String(sub._id)] = { title: sub.title, slug: sub.slug };
        if (sub.sanityId) postMap[sub.sanityId] = { title: sub.title, slug: sub.slug };
      });
    }

    let userMap = {};
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } }).select('username avatar').lean();
      users.forEach(u => {
        userMap[String(u._id)] = { username: u.username, avatar: u.avatar };
      });
    }

    const enriched = comments.map(c => ({
      ...c,
      postTitle: postMap[c.postId]?.title || null,
      postSlug: postMap[c.postId]?.slug || null,
      username: c.userId ? userMap[String(c.userId)]?.username || null : null,
      avatar: c.userId ? userMap[String(c.userId)]?.avatar || null : null,
    }));

    // Count replies
    const parentIds = enriched.filter(c => !c.parentId).map(c => c._id);
    const replyCounts = await Comment.aggregate([
      { $match: { parentId: { $in: parentIds }, isDeleted: false } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } },
    ]);
    const replyCountMap = {};
    replyCounts.forEach(r => { replyCountMap[String(r._id)] = r.count; });
    enriched.forEach(c => { c.replyCount = replyCountMap[String(c._id)] || 0; });

    res.json({
      success: true,
      comments: enriched,
      pagination: { total, pages: Math.ceil(total / limit), page, limit, hasMore: page < Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!commentId || !commentId.match(/^[0-9a-f]{24}$/i)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
    if (comment.isDeleted) return res.status(404).json({ success: false, message: 'Comment already deleted' });

    await Comment.findByIdAndUpdate(commentId, {
      isDeleted: true,
      deletedAt: new Date(),
      comment: '[deleted by admin]',
      name: '[deleted]',
    });

    const replyResult = await Comment.updateMany(
      { parentId: commentId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), comment: '[deleted by admin]', name: '[deleted]' }
    );

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'delete_comment',
      description: `Deleted comment by "${comment.name}" on post ${comment.postId || 'unknown'}`,
      targetId: commentId,
      targetType: 'comment',
      metadata: { deletedReplies: replyResult.modifiedCount },
    });

    res.json({ success: true, message: 'Comment deleted', deletedReplies: replyResult.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCommentStats = async (req, res) => {
  try {
    const [total, active, deleted, recentWeek] = await Promise.all([
      Comment.countDocuments(),
      Comment.countDocuments({ isDeleted: false }),
      Comment.countDocuments({ isDeleted: true }),
      Comment.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
    ]);

    res.json({ success: true, stats: { total, active, deleted, recentWeek } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
