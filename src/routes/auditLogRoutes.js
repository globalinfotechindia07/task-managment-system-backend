const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getAuditStats,
  clearOldLogs,
} = require('../controllers/auditLogController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorizeRoles('Super Admin'));

router.get('/', getAuditLogs);
router.get('/stats', getAuditStats);
router.delete('/cleanup', clearOldLogs);

module.exports = router;

