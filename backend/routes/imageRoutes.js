const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const imageController = require("../controllers/imageController");

// All image routes require authentication
router.use(authMiddleware);

// List all images with search, filter, pagination
router.get("/", imageController.adminListImages);

// Permanently delete an image (blocks if linked to active blogs)
router.delete("/:imageId", imageController.adminDeleteImage);

// Force delete even if linked to blogs (may break content)
router.delete("/:imageId/force", imageController.adminForceDeleteImage);

module.exports = router;
