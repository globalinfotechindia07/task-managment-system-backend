const express = require('express');
const router = express.Router();
const {
  getPolicy,
  updatePolicy,
  punchIn,
  punchOut,
  getMyAttendance,
  getAllAttendance
} = require('../controllers/attendanceController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/attendance');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Config for Photos
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/attendance/');
  },
  filename(req, file, cb) {
    cb(null, `punch-${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

router.use(protect);

router.get('/policy', getPolicy);
router.put('/policy', authorizePermission('attendance', 'edit'), updatePolicy);

// Staff punch operations
router.post('/punch-in', upload.single('photo'), punchIn);
router.post('/punch-out', upload.single('photo'), punchOut);
router.get('/my-report', getMyAttendance);

// Office-wide attendance monitoring
router.get('/all', authorizePermission('attendance', 'view'), getAllAttendance);

module.exports = router;
