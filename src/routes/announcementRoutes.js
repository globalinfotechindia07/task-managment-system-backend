const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getAnnouncements, 
  createAnnouncement, 
  deleteAnnouncement,
  updateAnnouncement
} = require('../controllers/announcementController');
const { protect } = require('../middleware/authMiddleware');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

router.route('/')
  .get(protect, getAnnouncements)
  .post(protect, upload.array('attachments', 5), createAnnouncement);

router.route('/:id')
  .put(protect, upload.array('attachments', 5), updateAnnouncement)
  .delete(protect, deleteAnnouncement);

module.exports = router;
