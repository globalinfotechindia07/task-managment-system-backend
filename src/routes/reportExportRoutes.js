const express = require('express');
const router = express.Router();
const {
  getAttendanceReport,
  getSalaryReport,
  getProjectReport,
} = require('../controllers/reportExportController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/attendance', getAttendanceReport);
router.get('/salary', getSalaryReport);
router.get('/projects', getProjectReport);

module.exports = router;
