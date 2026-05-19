const BlogSubmission = require('../models/BlogSubmission');
const { publishToSanity } = require('../utils/sanityPublisher');

exports.getPendingSubmissions = async (req, res) => {
  try {
    const submissions = await BlogSubmission.find({ status: { $in: ['pending', 'pending review'] } })
      .sort({ createdAt: -1 });
    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getApprovedSubmissions = async (req, res) => {
  try {
    const submissions = await BlogSubmission.find({ status: 'approved' })
      .sort({ createdAt: -1 });
    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRejectedSubmissions = async (req, res) => {
  try {
    const submissions = await BlogSubmission.find({ status: 'rejected' })
      .sort({ createdAt: -1 });
    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await BlogSubmission.findById(id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    res.json({ success: true, submission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const [pending, approved, rejected] = await Promise.all([
      BlogSubmission.countDocuments({ status: { $in: ['pending', 'pending review'] } }),
      BlogSubmission.countDocuments({ status: 'approved' }),
      BlogSubmission.countDocuments({ status: 'rejected' }),
    ]);

    const authors = await BlogSubmission.distinct('author.userId');

    res.json({
      success: true,
      stats: {
        pending,
        approved,
        rejected,
        authors: authors.length,
        total: pending + approved + rejected,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveEdits = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const blog = await BlogSubmission.findByIdAndUpdate(id, {
      ...updateData,
      lastEditedBy: req.admin.id,
      lastEditedAt: new Date()
    }, { new: true });

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    res.json({ success: true, message: 'Changes saved to draft', blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback, ...contentUpdates } = req.body;

    const blog = await BlogSubmission.findById(id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Update content and status
    Object.assign(blog, contentUpdates);
    blog.status = 'approved';
    blog.verificationNotes = {
      adminId: req.admin.id,
      feedback: feedback || 'Approved',
      verifiedAt: new Date()
    };

    // Publish to Sanity CMS
    try {
      const { sanityId } = await publishToSanity(blog);
      blog.sanityId = sanityId;
      blog.sanityUrl = `${process.env.FRONTEND_URL || 'https://www.contesthopper.live'}/blog/${blog.slug}`;
    } catch (sanityErr) {
      console.error(`Failed to publish to Sanity: ${sanityErr.message}`);
    }

    await blog.save();
    res.json({ success: true, message: 'Blog approved and published' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    if (!feedback) return res.status(400).json({ success: false, message: 'Feedback is required for rejection' });

    const blog = await BlogSubmission.findById(id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    blog.status = 'rejected';
    blog.verificationNotes = {
      adminId: req.admin.id,
      feedback,
      verifiedAt: new Date()
    };

    await blog.save();
    res.json({ success: true, message: 'Blog rejected with feedback' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWriterTier = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const [approved, rejected, pending] = await Promise.all([
      BlogSubmission.countDocuments({
        'author.userId': userId,
        status: 'approved',
      }),
      BlogSubmission.countDocuments({
        'author.userId': userId,
        status: 'rejected',
      }),
      BlogSubmission.countDocuments({
        'author.userId': userId,
        status: 'pending',
      }),
    ]);

    const tier = approved >= 5 ? 'trusted' : approved >= 1 ? 'verified' : 'new';
    
    res.json({ success: true, tier, approved, rejected, pending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllSubmissions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const query = {};

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search by title or author name
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'author.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [submissions, total] = await Promise.all([
      BlogSubmission.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      BlogSubmission.countDocuments(query),
    ]);

    res.json({
      success: true,
      submissions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
