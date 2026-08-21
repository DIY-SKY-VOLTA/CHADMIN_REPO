const express = require('express');
const router = express.Router();
const eventTypeController = require('../controllers/eventTypeController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', eventTypeController.adminListTypes);
router.post('/', eventTypeController.createType);
// /reorder must be registered BEFORE /:id so "reorder" is never captured as an id.
router.put('/reorder', eventTypeController.reorderTypes);
router.put('/:id', eventTypeController.updateType);
router.delete('/:id', eventTypeController.archiveType);

module.exports = router;
