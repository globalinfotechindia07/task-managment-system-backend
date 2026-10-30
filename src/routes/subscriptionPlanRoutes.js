const express = require('express');
const router = express.Router();
const {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
} = require('../controllers/subscriptionPlanController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.route('/')
  .get(getPlans)
  .post(protect, authorizeRoles('Super Admin'), createPlan);

router.route('/:id')
  .put(protect, authorizeRoles('Super Admin'), updatePlan)
  .delete(protect, authorizeRoles('Super Admin'), deletePlan);

module.exports = router;
