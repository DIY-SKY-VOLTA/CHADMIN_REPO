const mongoose = require("mongoose");

const blogCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Category name is required"],
    trim: true,
    maxlength: [64, "Category name cannot exceed 64 characters"],
    unique: true,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
  },
  description: {
    type: String,
    default: "",
    maxlength: 300,
  },
  color: {
    type: String,
    default: "#6366f1",
    description: "Hex color for UI display",
  },
  sortOrder: {
    type: Number,
    default: 0,
    description: "Display order (ascending)",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

blogCategorySchema.index({ sortOrder: 1, name: 1 });

module.exports = mongoose.model("BlogCategory", blogCategorySchema);
