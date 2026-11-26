const express = require('express');
const router = express.Router();
const {
  getAgreementConfig,
  updateAgreementConfig,
  testAgreementConnection,
  getCompanySignerUsers,
  getTemplates,
  getTemplateById,
  createOrUpdateTemplate,
  deleteTemplate,
  initiateAgreement,
  getAgreements,
  getAgreementById,
  checkAgreementStatus,
  getAgreementStats,
  renderAgreementDocument,
} = require('../controllers/agreementController');
const { protect } = require('../middleware/authMiddleware');

// Public printable agreement document view & download (accessible without auth header for direct PDF view in new tab)
router.get('/:agreement_id/view', renderAgreementDocument);
router.get('/:agreement_id/pdf', renderAgreementDocument);
router.get('/:agreement_id/document', renderAgreementDocument);

router.use(protect);

// Gateway configuration
router.get('/config', getAgreementConfig);
router.put('/config', updateAgreementConfig);
router.post('/config/test', testAgreementConnection);

// Metrics & Stats
router.get('/stats', getAgreementStats);

// Templates & Designer
router.get('/signers/users', getCompanySignerUsers);
router.route('/templates')
  .get(getTemplates)
  .post(createOrUpdateTemplate);

router.route('/templates/:id')
  .get(getTemplateById)
  .delete(deleteTemplate);

// Agreements generation & tracking
router.route('/')
  .get(getAgreements);

router.post('/initiate', initiateAgreement);

router.get('/:id', getAgreementById);
router.get('/:agreement_id/status', checkAgreementStatus);

module.exports = router;
