const express = require('express');
const router = express.Router();
const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getCompanyPolicy,
  updateCompanyPolicy,
  getAllEmployeeBalances,
  updateEmployeeLeaveBalance,
  rolloverCarryForward,
  getMyLeaveBalance,
  getMyLeaveRequests,
  applyForLeave,
  cancelMyLeaveRequest,
  getAllLeaveRequests,
  reviewLeaveRequest,
} = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// 1. Holidays (Viewable by all staff; managed by Admin/HR)
router.route('/holidays')
  .get(getHolidays)
  .post(createHoliday);

router.route('/holidays/:id')
  .put(updateHoliday)
  .delete(deleteHoliday);

// 2. Policy & Balances (Admin / HR Management)
router.route('/policy')
  .get(getCompanyPolicy)
  .put(updateCompanyPolicy);

router.get('/balances', getAllEmployeeBalances);
router.put('/balances/:userId', updateEmployeeLeaveBalance);
router.post('/carry-forward/rollover', rolloverCarryForward);

// 3. Employee Self-Service (My Leaves)
router.get('/my-balance', getMyLeaveBalance);
router.get('/my-requests', getMyLeaveRequests);
router.post('/apply', applyForLeave);
router.put('/my-requests/:id/cancel', cancelMyLeaveRequest);

// 4. Approval Workflow (Admin, HR, Team Lead)
router.get('/requests', getAllLeaveRequests);
router.put('/requests/:id/action', reviewLeaveRequest);

module.exports = router;

