const express = require("express");
const router = express.Router();
const exportController = require("../controllers/exportController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/submissions", exportController.exportSubmissions);
router.get("/users", exportController.exportUsers);
router.get("/comments", exportController.exportComments);

module.exports = router;
