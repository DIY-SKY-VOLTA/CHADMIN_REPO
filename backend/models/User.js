/**
 * User Model
 * Defines user schema with authentication and contest interaction features
 *
 * SHARED COLLECTION with Phase2 (backend/src/modules/auth/user.model.js).
 * This declaration MUST stay field-compatible with that one — Mongoose strict
 * mode silently drops fields not declared here, so anything the dashboard
 * writes (status changes, session wipes, lifecycle fields) needs a mirror.
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
    trim: true,
    match: [/^[a-zA-Z0-9_]{3,20}$/, "Invalid username format"],
    // Partial unique — see the email field note below. Must match Phase2's
    // declaration exactly or the next startup fights it with
    // IndexOptionsConflict (Phase2's migrateAccountLifecycle.js swaps the
    // old plain unique indexes for these).
    index: { unique: true, partialFilterExpression: { deleted: false } },
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, "A valid email is required"],
    // Unique ONLY among live accounts: soft-deleted users must not block
    // re-registration with the same email. Options mirror Phase2
    // user.model.js — keep them in lockstep.
    index: { unique: true, partialFilterExpression: { deleted: false } },
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: 6,
    maxlength: 72, // bcrypt truncates beyond 72 bytes (Phase2 parity)
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
  // ── Writer trust system (written here, read by Phase2 writer backend) ──
  // Manual tier override — wins over the computed tier when set.
  writerTierOverride: {
    type: String,
    enum: ['new', 'verified', 'trusted', ''],
    default: '',
  },
  // When true, the writer was demoted (e.g. repeated rejections). Their posts go
  // to review regardless of tier until cleared.
  writerDemoted: {
    type: Boolean,
    default: false,
  },
  // ── Account moderation (written here, enforced by Phase2 auth) ──
  // banned: permanent block. suspended: temporary block. Phase2 checks this
  // on every login, every token refresh AND every authenticated request, so
  // bans land within seconds rather than the old 15-min JWT window.
  // deletion_pending: deletion scheduled (self-service or admin) — Phase2
  // blocks every route except the cancel-deletion flow.
  // deleted: legacy soft-delete value kept for Phase2 compatibility — its
  // migration backfills old `deleted:true` accounts to this status.
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'banned', 'deletion_pending', 'deleted'],
    default: 'active',
  },
  statusReason: {
    type: String,
    default: '',
    maxlength: 300,
  },
  statusChangedAt: {
    type: Date,
    default: null,
  },
  // Soft delete — keeps blog submissions/comments intact while removing the
  // person from every user list and blocking all login.
  deleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  // ── Deletion lifecycle (mirrors Phase2 user.model.js) ──
  // deletionRequestedAt: when deletion was scheduled.
  // scheduledPurgeAt: when Phase2's accountPurgeJob hard-purges the account.
  //   restore/active paths MUST clear these or the reaper purges a
  //   "restored" account on schedule.
  // deletionReason: free-text reason captured at scheduling (≤500).
  deletionRequestedAt: {
    type: Date,
    default: null,
  },
  scheduledPurgeAt: {
    type: Date,
    default: null,
  },
  deletionReason: {
    type: String,
    default: '',
    maxlength: 500,
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
  // Mirrors Phase2's auth session store (shared collection, Phase2 user.model
  // refreshTokens field). Declared here so admin-side session wipes (logout-all,
  // ban, delete) actually persist — Mongoose strict mode silently drops fields not
  // in the schema. The admin dashboard never issues tokens; it only displays
  // device labels and revokes. Field-for-field match, including `ip`.
  refreshTokens: [{
    tokenHash: { type: String, required: true },
    device: { type: String, default: 'Unknown device', maxlength: 200 },
    ip: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  }],

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
      required: true
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

// accountPurgeJob (Phase2) scans for accounts whose grace period has ended;
// the compound index keeps that query a fast prefix scan. Mirrored from
// Phase2 user.model.js so both apps declare identical indexes.
userSchema.index({ accountStatus: 1, scheduledPurgeAt: 1 });

/**
 * Pre-save hook to hash password before storing
 * Only runs if password is modified
 * Mongoose 9: async pre hooks should NOT call next() — just return
 * (the old next() call threw "next is not a function" on every save,
 * breaking delete/ban/suspend/tier in the admin dashboard)
 */
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
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
