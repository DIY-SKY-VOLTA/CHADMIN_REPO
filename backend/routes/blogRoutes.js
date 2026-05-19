const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Dashboard overview
router.get('/dashboard/stats', blogController.getDashboardStats);

// Submissions by status
router.get('/pending', blogController.getPendingSubmissions);
router.get('/approved', blogController.getApprovedSubmissions);
router.get('/rejected', blogController.getRejectedSubmissions);
router.get('/submissions/:id', blogController.getSubmissionById);

// Submission actions
router.post('/submissions/:id/save', blogController.saveEdits);
router.post('/submissions/:id/approve', blogController.approveBlog);
router.post('/submissions/:id/reject', blogController.rejectBlog);

// Writer tier
router.get('/writer/:userId/tier', blogController.getWriterTier);

module.exports = router;

// All submissions with filtering and pagination
router.get('/all', blogController.getAllSubmissions);
