const express = require('express');
const router = express.Router();
const {
  getPublicContent,
  getAdminContent,
  updateContent,
  submitInquiry,
  createRazorpayOrder,
  getInquiries,
  updateInquiryStatus,
  deleteInquiry,
  addFaq,
  updateFaq,
  deleteFaq,
} = require('../controllers/siteContentController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public endpoints
router.get('/public', getPublicContent);
router.post('/inquiry', submitInquiry);
router.post('/create-order', createRazorpayOrder);

// Super Admin Protected endpoints
router.use(protect, authorizeRoles('Super Admin'));

router.get('/admin', getAdminContent);
router.put('/', updateContent);

// FAQ management
router.post('/faqs', addFaq);
router.put('/faqs/:faqId', updateFaq);
router.delete('/faqs/:faqId', deleteFaq);

// Inquiries / Direct Messages management
router.get('/inquiries', getInquiries);
router.patch('/inquiries/:id', updateInquiryStatus);
router.delete('/inquiries/:id', deleteInquiry);

module.exports = router;
