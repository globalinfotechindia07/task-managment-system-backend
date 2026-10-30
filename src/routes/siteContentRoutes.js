const express = require('express');
const router = express.Router();
const {
  getPublicContent,
  getAdminContent,
  updateContent,
  submitInquiry,
  createRazorpayOrder
} = require('../controllers/siteContentController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Public endpoints
router.get('/public', getPublicContent);
router.post('/inquiry', submitInquiry);
router.post('/create-order', createRazorpayOrder);

// Super Admin endpoints
router.get('/admin', protect, authorizeRoles('Super Admin'), getAdminContent);
router.put('/', protect, authorizeRoles('Super Admin'), updateContent);

module.exports = router;
