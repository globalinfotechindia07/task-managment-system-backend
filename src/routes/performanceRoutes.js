const express = require('express');
const router = express.Router();
const { getPerformanceSummary, getUserPerformanceLogs } = require('../controllers/performanceController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorizePermission('performance', 'view'));

router.get('/summary', getPerformanceSummary);
router.get('/logs/:userId', getUserPerformanceLogs);

module.exports = router;
