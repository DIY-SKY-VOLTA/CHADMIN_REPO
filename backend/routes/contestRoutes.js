const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const contestController = require('../controllers/contestController');

// Multer config — store in memory for sharp processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

router.use(authMiddleware);

// Contest image health management
router.get('/images/health', contestController.getImagesHealth);
router.post('/images/recheck', contestController.recheckImage);
router.post('/images/bulk-recheck', contestController.bulkRecheck);

// Contest image upload and details
router.get('/images/details', contestController.getContestDetails);
router.post('/images/upload', upload.single('image'), contestController.uploadContestImage);
router.post('/images/backup', contestController.backupImage);
router.post('/images/bulk-backup', contestController.bulkBackup);

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 15MB.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;
