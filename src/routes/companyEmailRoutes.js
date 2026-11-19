const express = require('express');
const router = express.Router();
const {
  getCompanySmtpSettings,
  updateCompanySmtpSettings,
  testCompanySmtpSettings,
  getCompanyEmailLogs,
} = require('../controllers/companyEmailController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.use(protect);

// Only Company Admin, CTO, or Super Admin can manage company SMTP configuration
router.use((req, res, next) => {
  const allowed = ['Admin', 'CTO', 'Super Admin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Only Company Administrators can manage email gateway settings' });
  }
  next();
});

router.route('/')
  .get(getCompanySmtpSettings)
  .put(updateCompanySmtpSettings);

router.post('/test', testCompanySmtpSettings);
router.get('/logs', getCompanyEmailLogs);

module.exports = router;
