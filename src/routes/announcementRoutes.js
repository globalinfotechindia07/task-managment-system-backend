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
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

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
  .post(protect, authorizeRoles('Admin', 'HR Manager', 'CTO'), upload.array('attachments', 5), createAnnouncement);

router.route('/:id')
  .put(protect, authorizeRoles('Admin', 'HR Manager', 'CTO'), upload.array('attachments', 5), updateAnnouncement)
  .delete(protect, authorizeRoles('Admin', 'HR Manager', 'CTO'), deleteAnnouncement);

module.exports = router;
