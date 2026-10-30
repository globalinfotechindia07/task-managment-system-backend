const express = require('express');
const router = express.Router();
const {
  getConfig,
  getMyConfig,
  updateConfig,
  generateSalary,
  getMySlips,
  getAllSlips
} = require('../controllers/payrollController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');

router.use(protect);

// Staff self-service salary slips
router.get('/my-config', getMyConfig);
router.get('/my-slips', getMySlips);

// Payroll management (Dynamic permission: payroll)
router.get('/config/:userId', authorizePermission('payroll', 'view'), getConfig);
router.post('/config', authorizePermission('payroll', 'edit'), updateConfig);
router.post('/generate', authorizePermission('payroll', 'create'), generateSalary);
router.get('/all', authorizePermission('payroll', 'view'), getAllSlips);

module.exports = router;
