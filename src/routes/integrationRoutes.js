const express = require('express');
const router = express.Router();
const {
  getConfig,
  updateConfig,
  regenerateInboundKey,
  testEndpoint,
  syncExternalFeed,
  getContactEnquiries,
  updateContactEnquiry,
  convertEnquiryToLead,
  deleteContactEnquiry,
  getAppointments,
  updateAppointment,
  deleteAppointment,
  getCareerApplications,
  updateCareerApplication,
  deleteCareerApplication,
  inboundWebhook,
} = require('../controllers/integrationController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');

// Public Webhook Ingestion endpoint (protected by company's x-api-key)
router.post('/webhook/:feedType', inboundWebhook);

// Protected Admin API Routes
router.use(protect);

// Config & Sync operations
router.get('/config', getConfig);
router.put('/config', authorizePermission('integrations', 'edit'), updateConfig);
router.post('/config/regenerate-key', authorizePermission('integrations', 'edit'), regenerateInboundKey);
router.post('/test-endpoint', testEndpoint);
router.post('/sync', syncExternalFeed);

// Contact Enquiries
router.get('/contact-enquiries', getContactEnquiries);
router.patch('/contact-enquiries/:id', authorizePermission('integrations', 'edit'), updateContactEnquiry);
router.post('/contact-enquiries/:id/convert-lead', authorizePermission('integrations', 'edit'), convertEnquiryToLead);
router.delete('/contact-enquiries/:id', authorizePermission('integrations', 'delete'), deleteContactEnquiry);

// Appointments
router.get('/appointments', getAppointments);
router.patch('/appointments/:id', authorizePermission('integrations', 'edit'), updateAppointment);
router.delete('/appointments/:id', authorizePermission('integrations', 'delete'), deleteAppointment);

// Career Applications
router.get('/career-applications', getCareerApplications);
router.patch('/career-applications/:id', authorizePermission('integrations', 'edit'), updateCareerApplication);
router.delete('/career-applications/:id', authorizePermission('integrations', 'delete'), deleteCareerApplication);

module.exports = router;

