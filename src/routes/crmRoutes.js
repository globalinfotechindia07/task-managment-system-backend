const express = require('express');
const router = express.Router();
const {
  getCRMStats,
  getLeads,
  createLead,
  updateLead,
  deleteLead,
  convertLead,
  getDeals,
  createDeal,
  updateDeal,
  deleteDeal,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/crmController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Analytics & Summary
router.get('/stats', getCRMStats);

// Leads
router.route('/leads')
  .get(getLeads)
  .post(createLead);

router.route('/leads/:id')
  .put(updateLead)
  .delete(deleteLead);

router.post('/leads/:id/convert', convertLead);

// Deals & Sales Pipeline
router.route('/deals')
  .get(getDeals)
  .post(createDeal);

router.route('/deals/:id')
  .put(updateDeal)
  .delete(deleteDeal);

// Customers / Accounts
router.route('/customers')
  .get(getCustomers)
  .post(createCustomer);

router.route('/customers/:id')
  .put(updateCustomer)
  .delete(deleteCustomer);

module.exports = router;

