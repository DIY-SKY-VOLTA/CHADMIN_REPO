const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', categoryController.adminListCategories);
// Public listing is available via the main backend instead
router.post('/', categoryController.createCategory);
router.put('/reorder/batch', categoryController.reorderCategories);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;
