const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', userController.listUsers);
router.get('/:id', userController.getUserById);
router.post('/:id/toggle-admin', userController.toggleAdminStatus);
router.post('/:id/toggle-verified', userController.toggleVerifiedStatus);
router.put('/:id/writer-tier', userController.setWriterTier);
// Writer stats are returned inline in listUsers and getUserById
module.exports = router;
