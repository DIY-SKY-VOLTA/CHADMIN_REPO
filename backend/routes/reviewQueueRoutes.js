const express = require('express');
const router = express.Router();
const reviewQueueController = require('../controllers/reviewQueueController');
const authMiddleware = require('../middleware/authMiddleware');

// Same JWT protection as every other admin route.
router.use(authMiddleware);

router.get('/', reviewQueueController.getReviewQueue);
router.get('/:identity', reviewQueueController.getReviewQueueItem);

module.exports = router;
