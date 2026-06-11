const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const BlogSubmission = require('../models/BlogSubmission');
const User = require('../models/User');
const BlogImage = require('../models/BlogImage');
const Comment = require('../models/Comment');
const Contests = require('../models/Contests');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const [
      totalSubmissions,
      publishedBlogs,
      pendingBlogs,
      flaggedBlogs,
      totalUsers,
      totalImages,
      totalComments,
      activeContests
    ] = await Promise.all([
      BlogSubmission.countDocuments(),
      BlogSubmission.countDocuments({ status: 'approved' }),
      BlogSubmission.countDocuments({ status: { $in: ['pending', 'pending review'] } }),
      BlogSubmission.countDocuments({ status: 'rejected' }),
      User.countDocuments(),
      BlogImage.countDocuments({ deletedAt: null }),
      Comment.countDocuments({ isDeleted: false }),
      Contests.countDocuments({ status: { $in: ['active', 'upcoming'] } })
    ]);

    res.json({
      success: true,
      overview: {
        totalSubmissions,
        publishedBlogs,
        pendingBlogs,
        flaggedBlogs,
        totalUsers,
        totalImages,
        totalComments,
        activeContests
      }
    });
  } catch (error) {
    console.error('Stats overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;