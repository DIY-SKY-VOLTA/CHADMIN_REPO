/**
 * User Model
 * Defines user schema with authentication and contest interaction features
 * 
 * @module models/User
 */

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

/**
 * User Schema
 * Stores user account information, authentication data, and contest interactions
 */
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
    match: [/^[a-zA-Z0-9_]{3,20}$/, "Invalid username format"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, "A valid email is required"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: 6,
    select: false,
  },
  avatar: {
    type: String,
    default: "",
  },
  bio: {
    type: String,
    maxlength: 500,
    default: "",
  },
  country: {
    type: String,
    default: "",
  },
  timezone: {
    type: String,
    default: "",
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isSubscribed: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
    description: "Whether user can verify and publish blog submissions"
  },
  verificationToken: String,
  verificationTokenExpires: Date,
  emailSendFailed: {
    type: Boolean,
    default: false,
    description: "Tracks if verification email failed to send on registration"
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  savedContests: [{
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contests",
      required: true,
      index: true
    },
    savedAt: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      maxlength: 500,
      default: ""
    }
  }],

  likedContests: [{
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contests",
      required: true,
      index: true
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],

  appliedContests: [{
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contests",
      required: true,
      index: true
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'in-review', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],

  // Playlist-style folders for organizing saved items (max 11)
  folders: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, "Folder name cannot exceed 50 characters"]
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
      default: ""
    },
    color: {
      type: String,
      default: "#6366f1"
    },
    // Content type this folder is for (null = custom user folder)
    contentType: {
      type: String,
      enum: ['contest', 'conference', 'blog', null],
      default: null
    },
    // Whether this is a system-created default folder
    isDefault: {
      type: Boolean,
      default: false
    },
    // Generic items array supporting multiple content types
    items: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'folders.items.itemType'
      },
      itemType: {
        type: String,
        enum: ['Contests', 'Conferences', 'Blogs'],
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    // Keep contests for backward compatibility (will migrate later)
    contests: [{
      contestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Contests",
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Track last used folder per content type for quick save (Pinterest-style)
  lastUsedFolderByType: {
    contest: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    conference: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },

  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    favoriteCategories: [{
      type: String
    }],
    // skillLevel: {
    //   type: String,
    //   enum: ['Beginner', 'Intermediate', 'Advanced'],
    //   default: 'Beginner'
    // }
  },
}, { timestamps: true });

/**
 * Pre-save hook to hash password before storing
 * Only runs if password is modified
 */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/**
 * Compares a candidate password with the stored hashed password
 * 
 * @param {string} candidatePassword - The password to verify
 * @returns {Promise<boolean>} True if password matches, false otherwise
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
