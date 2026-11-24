const express = require('express');
const router = express.Router();
const {
  getBackupStats,
  exportCompanyBackup,
  inspectBackup,
  restoreCompanyBackup,
  getBackupHistory,
  updateAutoBackupConfig,
  recordAutoBackup,
} = require('../controllers/backupController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// All backup operations are restricted strictly to Company Admins, CTOs and Super Admins
router.use(protect);
router.use(authorizeRoles('Admin', 'CTO', 'Super Admin'));

router.get('/stats', getBackupStats);
router.get('/export', exportCompanyBackup);
router.post('/inspect', inspectBackup);
router.post('/restore', restoreCompanyBackup);
router.get('/history', getBackupHistory);
router.patch('/auto-config', updateAutoBackupConfig);
router.post('/record-auto', recordAutoBackup);

module.exports = router;
