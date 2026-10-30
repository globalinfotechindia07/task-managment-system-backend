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
const { protect, authorizePermission } = require('../middleware/authMiddleware');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

router.use(protect);

router.route('/')
  .get(authorizePermission('announcements', 'view'), getAnnouncements)
  .post(authorizePermission('announcements', 'create'), upload.array('attachments', 5), createAnnouncement);

router.route('/:id')
  .put(authorizePermission('announcements', 'edit'), upload.array('attachments', 5), updateAnnouncement)
  .delete(authorizePermission('announcements', 'delete'), deleteAnnouncement);

module.exports = router;
