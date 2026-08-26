const express = require('express');
const router = express.Router();
const { getPerformanceSummary, getUserPerformanceLogs } = require('../controllers/performanceController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.use(protect);

// Only managers/admins can view these reports
router.use(authorizeRoles('Admin', 'CTO', 'HR', 'Team Head'));

router.get('/summary', getPerformanceSummary);
router.get('/logs/:userId', getUserPerformanceLogs);

module.exports = router;
