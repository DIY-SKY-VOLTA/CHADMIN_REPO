/**
 * BlogSubmission Model
 * Stores pending blog submissions awaiting admin verification
 */

const mongoose = require("mongoose");

const blogSubmissionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Blog title is required"],
    trim: true,
    maxlength: [256, "Title cannot exceed 256 characters"],
  },
  excerpt: {
    type: String,
    maxlength: 500,
    default: "",
  },
  content: {
    type: String,
    required: [true, "Blog content is required"],
  },
  category: {
    type: String,
    default: "Engineering",
  },
  tags: [{
    type: String,
    trim: true,
  }],
  slug: {
    type: String,
    unique: true,
    sparse: true,
  },
  coverImage: {
    type: String,
    default: "",
  },
  coverImageAlt: {
    type: String,
    default: "",
    description: "Alt text for accessibility and SEO",
  },
  coverImageCaption: {
    type: String,
    default: "",
    description: "Caption displayed below the cover image",
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  author: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: String,
    email: String,
    avatar: String,
  },
  verificationNotes: {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminName: String,
    feedback: String,
    verifiedAt: Date,
  },
  sanityId: {
    type: String,
    default: null,
    description: "ID of published Sanity document",
  },
  sanityUrl: {
    type: String,
    default: null,
    description: "Public URL of published blog on website",
  },
  readTime: {
    type: String,
    default: "5 min read",
  },
  metaTitle: {
    type: String,
    default: "",
  },
  metaDescription: {
    type: String,
    default: "",
  },
  publishedAt: {
    type: Date,
    default: () => new Date(),
    description: "Intended publication date for Sanity publishing",
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model("BlogSubmission", blogSubmissionSchema);
