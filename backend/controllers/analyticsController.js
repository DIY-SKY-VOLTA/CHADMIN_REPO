const BlogSubmission = require('../models/BlogSubmission');
const Comment = require('../models/Comment');
const BlogStats = require('../models/BlogStats');
const User = require('../models/User');
const Contests = require('../models/Contests');

/**
 * GET /api/admin/analytics/dashboard?range=14
 *
 * Full analytics payload for the admin analytics page.
 * `range` controls the daily time-series window (7, 14, 30, or 90 days —
 * anything else falls back to 14). Comparison windows are always the
 * equivalent preceding period, so deltas reflect real momentum.
 */
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisWeek = new Date(now.getTime() - 7 * 86400000);

    // ---- Range resolution --------------------------------------------------
    const ALLOWED_RANGES = [7, 14, 30, 90];
    const range = ALLOWED_RANGES.includes(Number(req.query.range))
      ? Number(req.query.range)
      : 14;
    const rangeStart = new Date(now.getTime() - range * 86400000);
    const prevRangeStart = new Date(now.getTime() - 2 * range * 86400000);

    const dayFmt = (d) => d.toISOString().slice(0, 10);

    // Density-aware date grouping: 90 days at daily granularity is too noisy
    const groupFormat = range > 30 ? '%Y-%W' : '%Y-%m-%d';
    const bucketLabel = range > 30 ? 'week' : 'day';

    // ---- Single round-trip batch ------------------------------------------
    const [
      totalSubmissions, pendingSubs, approvedSubs, rejectedSubs,
      submissionsThisMonth, submissionsLastMonth,
      submissionsThisWeek, submissionsPrevWeek,
      approvedThisWeek, approvedPrevWeek,
      totalComments, commentsThisWeek, commentsPrevWeek,
      totalUsers, usersThisMonth, usersThisWeek, usersPrevWeek,
      activeContests,
      rangeSubmissions, prevRangeSubmissions,
      rangeApproved, prevRangeApproved,
      rangeRejected, prevRangeRejected,
      rangeComments, prevRangeComments,
      rangeNewUsers, prevRangeNewUsers,
      rangePublished, prevRangePublished,
      seriesSubmissions,
      seriesComments,
      seriesUsers,
      seriesPublished,
      reviewTimes,
      topCategories,
      totalLikes,
    ] = await Promise.all([
      BlogSubmission.countDocuments(),
      BlogSubmission.countDocuments({ status: { $in: ['pending', 'pending review'] } }),
      BlogSubmission.countDocuments({ status: 'approved' }),
      BlogSubmission.countDocuments({ status: 'rejected' }),
      BlogSubmission.countDocuments({ createdAt: { $gte: thisMonth } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: lastMonth, $lt: thisMonth } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: thisWeek } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 14 * 86400000), $lt: thisWeek } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: thisWeek } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: new Date(now.getTime() - 14 * 86400000), $lt: thisWeek } }),
      Comment.countDocuments({ isDeleted: false }),
      Comment.countDocuments({ createdAt: { $gte: thisWeek }, isDeleted: false }),
      Comment.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 14 * 86400000), $lt: thisWeek }, isDeleted: false }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thisMonth } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      User.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 14 * 86400000), $lt: thisWeek } }),
      Contests.countDocuments({ archivedAt: null }),

      // Range vs previous-range (deltas)
      BlogSubmission.countDocuments({ createdAt: { $gte: rangeStart } }),
      BlogSubmission.countDocuments({ createdAt: { $gte: prevRangeStart, $lt: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: prevRangeStart, $lt: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'rejected', 'verificationNotes.verifiedAt': { $gte: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'rejected', 'verificationNotes.verifiedAt': { $gte: prevRangeStart, $lt: rangeStart } }),
      Comment.countDocuments({ createdAt: { $gte: rangeStart }, isDeleted: false }),
      Comment.countDocuments({ createdAt: { $gte: prevRangeStart, $lt: rangeStart }, isDeleted: false }),
      User.countDocuments({ createdAt: { $gte: rangeStart } }),
      User.countDocuments({ createdAt: { $gte: prevRangeStart, $lt: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: rangeStart } }),
      BlogSubmission.countDocuments({ status: 'approved', 'verificationNotes.verifiedAt': { $gte: prevRangeStart, $lt: rangeStart } }),

      // Daily series — submissions by status
      BlogSubmission.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily series — comments
      Comment.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, isDeleted: false } },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily series — new users
      User.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Daily series — published (approved) by decision date
      BlogSubmission.aggregate([
        { $match: { status: 'approved', 'verificationNotes.verifiedAt': { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: groupFormat, date: '$verificationNotes.verifiedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Review velocity: avg hours from submission to decision
      BlogSubmission.aggregate([
        {
          $match: {
            status: { $in: ['approved', 'rejected'] },
            'verificationNotes.verifiedAt': { $ne: null, $gte: rangeStart },
          },
        },
        {
          $project: {
            hours: {
              $divide: [
                { $subtract: ['$verificationNotes.verifiedAt', '$createdAt'] },
                3600000,
              ],
            },
          },
        },
        { $group: { _id: null, avgHours: { $avg: '$hours' }, decided: { $sum: 1 } } },
      ]),

      // Top categories among approved
      BlogSubmission.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),

      // Total likes
      BlogStats.aggregate([{ $group: { _id: null, total: { $sum: '$likes' } } }]),
    ]);

    // ---- Derived metrics ---------------------------------------------------
    const pctChange = (curr, prev) => {
      if (prev > 0) return Math.round(((curr - prev) / prev) * 100);
      return curr > 0 ? 100 : 0;
    };

    const decidedInRange = rangeApproved + rangeRejected;
    const approvalRate = decidedInRange > 0
      ? Math.round((rangeApproved / decidedInRange) * 100)
      : null;
    const prevDecided = prevRangeApproved + prevRangeRejected;
    const prevApprovalRate = prevDecided > 0
      ? Math.round((prevRangeApproved / prevDecided) * 100)
      : null;

    const review = reviewTimes[0] || { avgHours: null, decided: 0 };

    res.json({
      success: true,
      analytics: {
        range,
        rangeStart: dayFmt(rangeStart),
        bucket: bucketLabel,
        submissions: {
          total: totalSubmissions,
          pending: pendingSubs,
          approved: approvedSubs,
          rejected: rejectedSubs,
          thisMonth: submissionsThisMonth,
          growth: pctChange(submissionsThisMonth, submissionsLastMonth),
          thisWeek: submissionsThisWeek,
          // Range deltas vs the equivalent preceding window
          delta: rangeSubmissions - prevRangeSubmissions,
          inRange: rangeSubmissions,
          prevRange: prevRangeSubmissions,
          perDay: seriesSubmissions,
        },
        review: {
          approvedInRange: rangeApproved,
          rejectedInRange: rangeRejected,
          delta: (rangeApproved + rangeRejected) - prevDecided,
          approvalRate,                    // percent or null
          prevApprovalRate,                // percent or null
          avgReviewHours: review.decided > 0 ? Math.round(review.avgHours * 10) / 10 : null,
          decided: review.decided,
        },
        published: {
          inRange: rangePublished,
          delta: rangePublished - prevRangePublished,
          perDay: seriesPublished,
        },
        comments: {
          total: totalComments,
          thisWeek: commentsThisWeek,
          delta: commentsThisWeek - commentsPrevWeek,
          inRange: rangeComments,
          prevRange: prevRangeComments,
          perDay: seriesComments,
        },
        users: {
          total: totalUsers,
          thisMonth: usersThisMonth,
          thisWeek: usersThisWeek,
          delta: usersThisWeek - usersPrevWeek,
          inRange: rangeNewUsers,
          prevRange: prevRangeNewUsers,
          perDay: seriesUsers,
        },
        contests: {
          active: activeContests,
        },
        likes: totalLikes[0]?.total || 0,
        topCategories,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
