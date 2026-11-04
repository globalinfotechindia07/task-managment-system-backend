const express = require('express');
const router = express.Router();
const {
  getCompanies,
  getCompany,
  registerOffice,
  publicOnboardOffice,
  getMyTransactions,
  getTransactionInvoice,
  updateCompany,
  updateSubscription,
  deleteCompany,
  getPlatformStats,
  purchaseExtraUsers,
  upgradeCompanyPlan,
  createCheckoutOrder,
  getAllPlatformTransactions,
} = require('../controllers/companyController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public self-service company onboarding & subscription
router.post('/public-onboard', publicOnboardOffice);

router.use(protect);

// Company Admin billing & transaction history
router.get('/my-transactions', authorizeRoles('Admin', 'CTO'), getMyTransactions);
router.get('/transactions/:id/invoice', authorizeRoles('Admin', 'CTO', 'Super Admin'), getTransactionInvoice);
router.post('/create-checkout-order', authorizeRoles('Admin', 'CTO'), createCheckoutOrder);
router.post('/purchase-extra-users', authorizeRoles('Admin', 'CTO'), purchaseExtraUsers);
router.post('/upgrade-plan', authorizeRoles('Admin', 'CTO'), upgradeCompanyPlan);

// Super Admin platform statistics & global billing
router.get('/platform/stats', authorizeRoles('Super Admin'), getPlatformStats);
router.get('/platform/transactions', authorizeRoles('Super Admin'), getAllPlatformTransactions);

// Register a new office + admin
router.post('/register-office', authorizeRoles('Super Admin'), registerOffice);

// Company routes
router.route('/')
  .get(authorizeRoles('Super Admin'), getCompanies);

router.route('/:id')
  .get(authorizeRoles('Super Admin', 'Admin'), getCompany)
  .put(authorizeRoles('Super Admin', 'Admin'), updateCompany)
  .delete(authorizeRoles('Super Admin'), deleteCompany);

// Subscription management
router.put('/:id/subscription', authorizeRoles('Super Admin'), updateSubscription);

module.exports = router;
