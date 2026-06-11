// Contest management routes reserved for future implementation
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// To be implemented with contest management UI
// router.post('/toggle-featured', contestController.toggleFeatured);
// router.get('/featured', contestController.listFeatured);

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Contest management endpoints coming soon', contests: [] });
});

module.exports = router;
