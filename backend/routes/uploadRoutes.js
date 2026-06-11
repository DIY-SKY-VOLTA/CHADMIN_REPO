const express = require("express");
const router = express.Router();
const { getImageVariant } = require("../controllers/imageProxyController");

// Image variant proxy — generates fresh Supabase signed URLs
router.get("/images/:id/variant/:variantName", getImageVariant);

module.exports = router;
