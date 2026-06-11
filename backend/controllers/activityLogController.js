const ActivityLog = require("../models/ActivityLog");

/**
 * List activity logs with pagination and filtering
 * GET /api/admin/activity?page=1&limit=50&action=approve_blog&adminId=xxx
 */
exports.listLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) query.action = req.query.action;
    if (req.query.adminId) query.adminId = req.query.adminId;
    if (req.query.targetType) query.targetType = req.query.targetType;

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get activity log summary stats
 * GET /api/admin/activity/stats
 */
exports.getLogStats = async (req, res) => {
  try {
    const [totalLogs, recentToday, byAction] = await Promise.all([
      ActivityLog.countDocuments(),
      ActivityLog.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 86400000) },
      }),
      ActivityLog.aggregate([
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      success: true,
      stats: { totalLogs, recentToday, byAction },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Helper to create an activity log entry
 * Used by other controllers to log actions
 */
exports.logAction = async ({ adminId, adminName, action, description, targetId, targetType, metadata = {} }) => {
  try {
    await ActivityLog.create({
      adminId,
      adminName: adminName || "Unknown Admin",
      action,
      description,
      targetId: targetId || null,
      targetType: targetType || null,
      metadata,
    });
  } catch (error) {
    console.error("Failed to log activity:", error.message);
  }
};
