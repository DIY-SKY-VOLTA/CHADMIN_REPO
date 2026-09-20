const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', userController.listUsers);
// NOTE: must be declared before GET /:id so "deleted" is not eaten as an :id param
router.get('/deleted', userController.listDeletedUsers);
router.get('/:id', userController.getUserById);
router.post('/:id/toggle-admin', userController.toggleAdminStatus);
router.post('/:id/toggle-verified', userController.toggleVerifiedStatus);
router.put('/:id/writer-tier', userController.setWriterTier);
router.put('/:id/status', userController.setAccountStatus);
router.delete('/:id', userController.deleteUser);
router.delete('/:id/purge', userController.purgeUser);
router.post('/:id/restore', userController.restoreUser);
router.post('/:id/logout-all', userController.logoutAllSessions);
router.post('/bulk', userController.bulkUserAction);
// Writer stats are returned inline in listUsers and getUserById
module.exports = router;
