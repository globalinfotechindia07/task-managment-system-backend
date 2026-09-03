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
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

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

router.get('/policy', protect, getPolicy);
router.put('/policy', protect, authorizeRoles('Admin', 'CTO', 'HR Manager', 'Team Head'), updatePolicy);

router.post('/punch-in', protect, upload.single('photo'), punchIn);
router.post('/punch-out', protect, punchOut);
router.get('/my-report', protect, getMyAttendance);

router.get('/all', protect, authorizeRoles('Admin', 'CTO', 'HR Manager', 'Team Head'), getAllAttendance);

module.exports = router;
