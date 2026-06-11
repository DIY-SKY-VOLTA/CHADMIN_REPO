const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login', authController.login);

// Protected settings routes
router.post('/change-password', authMiddleware, authController.changePassword);
router.put('/update-profile', authMiddleware, authController.updateProfile);

module.exports = router;
