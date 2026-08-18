const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getSettings)
  .put(protect, authorizeRoles('Admin'), updateSettings);

// router.route('/get-company-name')
//   .get(getCompanyName, 'public');

module.exports = router;
