const express = require("express");
const router = express.Router();
const previewController = require("../controllers/previewController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/:id", previewController.generatePreview);

module.exports = router;
