const express = require("express");
const router = express.Router();
const { getImageVariant } = require("../controllers/imageProxyController");
const { imageLimiter } = require("../middleware/rateLimiters");

// Image variant proxy — generates fresh Supabase signed URLs
router.get("/images/:id/variant/:variantName", imageLimiter, getImageVariant);

module.exports = router;
