const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', commentController.listComments);
router.get('/stats', commentController.getCommentStats);
router.delete('/:commentId', commentController.deleteComment);

module.exports = router;
