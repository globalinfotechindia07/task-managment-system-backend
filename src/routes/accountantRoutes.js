const express = require('express');
const router = express.Router();
const {
  getAccountantSummary,
  getClientInvoices,
  getClientInvoiceById,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  getClientPayments,
  recordClientPayment,
  getClientPaymentById,
  getClientLedger,
  getGstTaxReport,
} = require('../controllers/accountantController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Financial Dashboard & Overview
router.get('/summary', getAccountantSummary);

// Client Invoices
router.route('/invoices')
  .get(getClientInvoices)
  .post(createClientInvoice);

router.route('/invoices/:id')
  .get(getClientInvoiceById)
  .put(updateClientInvoice)
  .delete(deleteClientInvoice);

// Payment Receipts & Vouchers
router.route('/payments')
  .get(getClientPayments)
  .post(recordClientPayment);

router.get('/payments/:id', getClientPaymentById);

// Client Ledger & Statement of Accounts
router.get('/ledger', getClientLedger);

// GST & Tax Compliance Report
router.get('/reports/gst', getGstTaxReport);

module.exports = router;

