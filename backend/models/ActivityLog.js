/**
 * ActivityLog Model
 * Records admin actions for audit trail purposes
 */

const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  adminName: {
    type: String,
    default: "Unknown Admin",
  },
  action: {
    type: String,
    required: true,
    enum: [
      "approve_blog",
      "reject_blog",
      "batch_approve",
      "batch_reject",
      "save_blog_edit",
      "delete_comment",
      "toggle_admin",
      "toggle_verified",
      "delete_image",
      "force_delete_image",
      "unpublish_blog",
      "update_published",
      "change_password",
      "update_profile",
      "login",
      // User moderation & trust (userController)
      "set_writer_tier",
      "set_account_status",
      "delete_user",
      "restore_user",
      "purge_user",
      "logout_all_sessions",
      "bulk_user_action",
    ],
    index: true,
  },
  description: {
    type: String,
    required: true,
    maxlength: 500,
  },
  targetId: {
    type: String,
    default: null,
    index: true,
  },
  targetType: {
    type: String,
    enum: ["blog", "comment", "user", "image", null],
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ adminId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
