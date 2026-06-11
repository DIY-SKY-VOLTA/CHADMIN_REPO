const express = require('express');
const router = express.Router();
const publishedController = require('../controllers/publishedController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', publishedController.listPublished);
router.get('/stats', publishedController.getPublishedStats);
// Single published lookup is available through /blogs/submissions/:id instead
router.put('/:id', publishedController.updatePublished);
router.post('/:id/unpublish', publishedController.unpublishFromSanity);

module.exports = router;
