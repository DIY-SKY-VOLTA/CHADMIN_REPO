const BlogSubmission = require('../models/BlogSubmission');
const Comment = require('../models/Comment');
const BlogStats = require('../models/BlogStats');
const User = require('../models/User');
const Contests = require('../models/Contests');

exports.getDashboardAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisWeek = new Date(now - 7 * 86400000);

    // Blog stats
    const [
      totalSubmissions, pendingSubs, approvedSubs, rejectedSubs,
      submissionsThisMonth, submissionsLastMonth,
      submissionsThisWeek,
      totalComments, commentsThisWeek,
      totalUsers, usersThisMonth, usersThisWeek,
      totalContests,
    ] = await Promise.all([
      BlogSubmission.countDocuments(),
      BlogSubmission.countDocuments({ status: { $in: ['pending', 'pending review'] } }),
      BlogSubmission.countDocuments({ status: 'approved' }),
      BlogSubmission.countDocuments({ status: 'rejected' }),
      BlogSubmission.countDocuments({ createdAt: { $gte: thisMonth } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: lastMonth, $lt: thisMonth } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: thisWeek } }),
      Comment.countDocuments({ isDeleted: false }),
      Comment.countDocuments({ createdAt: { $gte: thisWeek }, isDeleted: false }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      Contests.countDocuments({ archivedAt: null }),
    ]);

    // Growth rate (month-over-month)
    const subGrowth = submissionsLastMonth > 0
      ? Math.round(((submissionsThisMonth - submissionsLastMonth) / submissionsLastMonth) * 100)
      : submissionsThisMonth > 0 ? 100 : 0;

    // Top categories
    const topCategories = await BlogSubmission.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    // Submissions per day (last 14 days)
    const fourteenDaysAgo = new Date(now - 14 * 86400000);
    const submissionsPerDay = await BlogSubmission.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Total likes across all blogs
    const totalLikes = await BlogStats.aggregate([
      { $group: { _id: null, total: { $sum: '$likes' } } },
    ]);

    res.json({
      success: true,
      analytics: {
        submissions: {
          total: totalSubmissions,
          pending: pendingSubs,
          approved: approvedSubs,
          rejected: rejectedSubs,
          thisMonth: submissionsThisMonth,
          growth: subGrowth,
          thisWeek: submissionsThisWeek,
          perDay: submissionsPerDay,
        },
        comments: {
          total: totalComments,
          thisWeek: commentsThisWeek,
        },
        users: {
          total: totalUsers,
          thisMonth: usersThisMonth,
          thisWeek: usersThisWeek,
        },
        contests: {
          active: totalContests,
        },
        likes: totalLikes[0]?.total || 0,
        topCategories,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
