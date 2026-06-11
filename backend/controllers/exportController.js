const BlogSubmission = require("../models/BlogSubmission");
const User = require("../models/User");
const Comment = require("../models/Comment");

/**
 * Helper: escape CSV field value
 */
const csvEscape = (val) => {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Helper: send CSV response
 */
const sendCSV = (res, filename, headers, rows) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write("\uFEFF"); // BOM for Excel UTF-8 compatibility
  res.write(headers.join(",") + "\n");
  rows.forEach((row) => {
    res.write(row.map(csvEscape).join(",") + "\n");
  });
  res.end();
};

/**
 * Export submissions as CSV
 * GET /api/admin/export/submissions?status=approved
 */
exports.exportSubmissions = async (req, res) => {
  try {
    const query = {};
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    const submissions = await BlogSubmission.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      "ID", "Title", "Status", "Category", "Author Name", "Author Email",
      "Slug", "Read Time", "Word Count", "Created At", "Updated At",
      "Sanity ID", "Sanity URL", "Meta Title", "Meta Description",
    ];

    const rows = submissions.map((s) => [
      s._id,
      s.title,
      s.status,
      s.category || "",
      s.author?.name || "",
      s.author?.email || "",
      s.slug || "",
      s.readTime || "",
      s.content ? Math.round(s.content.replace(/<[^>]+>/g, "").split(/\s+/).length) : 0,
      s.createdAt ? new Date(s.createdAt).toISOString() : "",
      s.updatedAt ? new Date(s.updatedAt).toISOString() : "",
      s.sanityId || "",
      s.sanityUrl || "",
      s.metaTitle || "",
      s.metaDescription || "",
    ]);

    sendCSV(res, `submissions-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Export users as CSV
 * GET /api/admin/export/users
 */
exports.exportUsers = async (req, res) => {
  try {
    const query = {};
    if (req.query.role === "admins") query.isAdmin = true;
    else if (req.query.role === "verified") query.isVerified = true;

    const users = await User.find(query)
      .select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires -refreshTokens")
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      "ID", "Username", "Email", "Is Admin", "Is Verified",
      "Bio", "Country", "Timezone", "Created At",
    ];

    const rows = users.map((u) => [
      u._id,
      u.username,
      u.email,
      u.isAdmin ? "Yes" : "No",
      u.isVerified ? "Yes" : "No",
      u.bio || "",
      u.country || "",
      u.timezone || "",
      u.createdAt ? new Date(u.createdAt).toISOString() : "",
    ]);

    sendCSV(res, `users-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Export comments as CSV
 * GET /api/admin/export/comments
 */
exports.exportComments = async (req, res) => {
  try {
    const query = {};
    if (req.query.filter === "active") query.isDeleted = false;
    else if (req.query.filter === "deleted") query.isDeleted = true;

    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      "ID", "Post ID", "Name", "Email", "Comment",
      "Is Deleted", "Parent ID", "Created At",
    ];

    const rows = comments.map((c) => [
      c._id,
      c.postId || "",
      c.name || "",
      c.email || "",
      c.comment || "",
      c.isDeleted ? "Yes" : "No",
      c.parentId || "",
      c.createdAt ? new Date(c.createdAt).toISOString() : "",
    ]);

    sendCSV(res, `comments-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
