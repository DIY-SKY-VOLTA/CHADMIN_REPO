/**
 * Admin Model
 * Dedicated admin accounts stored in a separate 'admins' collection.
 * Completely independent from regular user accounts — no contest data, no writer fields.
 */

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
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
  lastLoginAt: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  collection: "admins", // Explicitly use 'admins' collection, separate from regular 'users'
});

// Indexes are created automatically via 'unique: true' in field definitions above.

/**
 * Pre-save hook to hash password before storing
 */
adminSchema.pre("save", async function () {
  // Mongoose 9: async pre hooks should NOT call next() — just return
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/**
 * Compare a candidate password with the stored hash
 */
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
