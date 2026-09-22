const express = require('express');
const router = express.Router();
const multer = require('multer');
const eventController = require('../controllers/eventController');
const eventImageController = require('../controllers/eventImageController');
const authMiddleware = require('../middleware/authMiddleware');

// Multer config — memory storage for the sharp/R2 pipeline
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

router.use(authMiddleware);

// Event image health management — MUST be registered before /:id so
// 'images' is never swallowed as an :id param
router.get('/images/health', eventImageController.getEventImagesHealth);
router.post('/images/recheck', eventImageController.recheckEventImage);
router.post('/images/cleanup', eventImageController.cleanupEventImages);
router.post('/images/backup', eventImageController.backupEventImage);
router.post('/images/upload', upload.single('image'), eventImageController.uploadEventImage);

router.get('/stats', eventController.getEventStats);
router.get('/details', eventController.listEventsWithDetails);
router.get('/', eventController.listEvents);
router.get('/:id/details', eventController.getEventDetails);
router.put('/:id/details', eventController.saveEventDetails);
router.get('/:id', eventController.getEventById);
router.post('/', eventController.createEvent);
router.put('/:id', eventController.updateEvent);
router.delete('/:id', eventController.deleteEvent);

module.exports = router;
