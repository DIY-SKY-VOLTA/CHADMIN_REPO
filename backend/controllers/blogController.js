const BlogSubmission = require('../models/BlogSubmission');
const { publishToSanity } = require('../utils/sanityPublisher');
const { logAction } = require('./activityLogController');

exports.getPendingSubmissions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = { status: { $in: ['pending', 'pending review'] } };
    const [submissions, total] = await Promise.all([
      BlogSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BlogSubmission.countDocuments(query),
    ]);

    res.json({
      success: true,
      submissions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getApprovedSubmissions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = { status: 'approved' };
    const [submissions, total] = await Promise.all([
      BlogSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BlogSubmission.countDocuments(query),
    ]);

    res.json({
      success: true,
      submissions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRejectedSubmissions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = { status: 'rejected' };
    const [submissions, total] = await Promise.all([
      BlogSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      BlogSubmission.countDocuments(query),
    ]);

    res.json({
      success: true,
      submissions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
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

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'approve_blog',
      description: `Approved blog: "${blog.title}"`,
      targetId: id,
      targetType: 'blog',
    });

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

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'reject_blog',
      description: `Rejected blog: "${blog.title}"`,
      targetId: id,
      targetType: 'blog',
      metadata: { feedback },
    });

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

// Batch approve or reject multiple submissions at once
exports.batchAction = async (req, res) => {
  try {
    const { ids, action, feedback } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be "approve" or "reject"' });
    }

    if (action === 'reject' && !feedback) {
      return res.status(400).json({ success: false, message: 'Feedback is required for rejection' });
    }

    const update = {
      status: action === 'approve' ? 'approved' : 'rejected',
      verificationNotes: {
        adminId: req.admin.id,
        feedback: feedback || (action === 'approve' ? 'Approved (batch)' : ''),
        verifiedAt: new Date(),
      },
      lastEditedBy: req.admin.id,
      lastEditedAt: new Date(),
    };

    const result = await BlogSubmission.updateMany(
      { _id: { $in: ids }, status: { $in: ['pending', 'pending review'] } },
      { $set: update }
    );

    // Log batch activity
    if (result.modifiedCount > 0) {
      logAction({
        adminId: req.admin.id,
        adminName: req.admin.username || req.admin.id,
        action: action === 'approve' ? 'batch_approve' : 'batch_reject',
        description: `Batch ${action}: ${result.modifiedCount} submissions ${action === 'approve' ? 'approved' : 'rejected'}`,
        metadata: { count: result.modifiedCount, ids },
      });
    }

    res.json({
      success: true,
      message: `Batch ${action} completed: ${result.modifiedCount} updated`,
      modifiedCount: result.modifiedCount,
    });
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
