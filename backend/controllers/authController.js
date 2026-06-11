const Admin = require('../models/Admin');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { logAction } = require('./activityLogController');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Primary: check dedicated admins collection
    let admin = await Admin.findOne({ email, isActive: true }).select('+password');

    // Fallback: check legacy users collection (migration not yet run)
    if (!admin) {
      const legacyUser = await User.findOne({ email, isAdmin: true }).select('+password');
      if (legacyUser) {
        const isMatch = await legacyUser.comparePassword(password);
        if (isMatch) {
          // Auto-migrate: create admin with PLAINTEXT password so the pre-save hook hashes it once
          // Do NOT copy the already-hashed password from the legacy record
          admin = await Admin.create({
            username: legacyUser.username,
            email: legacyUser.email,
            password: password, // plaintext from login form — pre-save hook will hash correctly
            avatar: legacyUser.avatar || '',
            bio: legacyUser.bio || '',
          });
          console.info(`🔄 Auto-migrated admin: ${admin.email}`);
        }
      }
    }

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Update last login
    admin.lastLoginAt = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, isAdmin: true, model: 'Admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Log login activity
    logAction({
      adminId: admin._id,
      adminName: admin.username,
      action: 'login',
      description: `Admin logged in: ${admin.username}`,
    });

    res.json({
      success: true,
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        isAdmin: true,
        avatar: admin.avatar
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.stack || error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(req.admin.id).select('+password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'change_password',
      description: 'Changed admin account password',
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { username, email, avatar, bio } = req.body;

    const updateFields = {};
    if (username?.trim()) updateFields.username = username.trim();
    if (email?.trim()) updateFields.email = email.trim().toLowerCase();
    if (avatar !== undefined) updateFields.avatar = avatar;
    if (bio !== undefined) updateFields.bio = bio;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const admin = await Admin.findByIdAndUpdate(req.admin.id, updateFields, { new: true })
      .select('-password');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: admin.username,
      action: 'update_profile',
      description: 'Updated admin profile settings',
      metadata: { updatedFields: Object.keys(updateFields) },
    });

    res.json({ success: true, message: 'Profile updated', user: admin });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username or email already taken' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
