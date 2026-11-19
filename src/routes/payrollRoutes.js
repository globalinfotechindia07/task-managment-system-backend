const express = require('express');
const router = express.Router();
const {
  getConfig,
  getMyConfig,
  updateConfig,
  generateSalary,
  getMySlips,
  getAllSlips,
  getEmployeesSalaryList,
} = require('../controllers/payrollController');
const {
  getSalaryStructures,
  getSalaryStructureById,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  setDefaultStructure,
  calculateSalaryPreview,
} = require('../controllers/salaryStructureController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');

router.use(protect);

// Staff self-service salary slips
router.get('/my-config', getMyConfig);
router.get('/my-slips', getMySlips);

// Salary Structures & Dynamic Plans Builder (Settings)
router.get('/structures', authorizePermission('payroll', 'view'), getSalaryStructures);
router.post('/structures/calculate-preview', authorizePermission('payroll', 'view'), calculateSalaryPreview);
router.get('/structures/:id', authorizePermission('payroll', 'view'), getSalaryStructureById);
router.post('/structures', authorizePermission('payroll', 'create'), createSalaryStructure);
router.put('/structures/:id', authorizePermission('payroll', 'edit'), updateSalaryStructure);
router.delete('/structures/:id', authorizePermission('payroll', 'delete'), deleteSalaryStructure);
router.patch('/structures/:id/default', authorizePermission('payroll', 'edit'), setDefaultStructure);

// Payroll management (Dynamic permission: payroll)
router.get('/employees-salary', authorizePermission('payroll', 'view'), getEmployeesSalaryList);
router.get('/config/:userId', authorizePermission('payroll', 'view'), getConfig);
router.post('/config', authorizePermission('payroll', 'edit'), updateConfig);
router.post('/generate', authorizePermission('payroll', 'create'), generateSalary);
router.get('/all', authorizePermission('payroll', 'view'), getAllSlips);

module.exports = router;
