const express = require('express');
const router = express.Router();
const contestCategoryController = require('../controllers/contestCategoryController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', contestCategoryController.adminListCategories);
router.post('/', contestCategoryController.createCategory);
// /reorder must be registered BEFORE /:id so "reorder" is never captured as an id.
router.put('/reorder', contestCategoryController.reorderCategories);
router.put('/:id', contestCategoryController.updateCategory);
router.delete('/:id', contestCategoryController.archiveCategory);

module.exports = router;
