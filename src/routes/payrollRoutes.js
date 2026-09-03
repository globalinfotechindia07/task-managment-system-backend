const express = require('express');
const router = express.Router();
const {
  getConfig,
  updateConfig,
  generateSalary,
  getMySlips,
  getAllSlips
} = require('../controllers/payrollController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/config/:userId', protect, authorizeRoles('Admin', 'CTO', 'HR Manager'), getConfig);
router.post('/config', protect, authorizeRoles('Admin', 'CTO', 'HR Manager'), updateConfig);

router.post('/generate', protect, authorizeRoles('Admin', 'CTO', 'HR Manager'), generateSalary);

router.get('/my-slips', protect, getMySlips);
router.get('/all', protect, authorizeRoles('Admin', 'CTO', 'HR Manager'), getAllSlips);

module.exports = router;
