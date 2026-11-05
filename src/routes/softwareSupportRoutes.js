const express = require('express');
const router = express.Router();
const {
  verifySoftwareApiKey,
  pingSoftwareApi,
  createExternalTicket,
  getExternalTickets,
  getExternalTicketById,
  addExternalTicketReply,
  getSoftwareApps,
  createSoftwareApp,
  updateSoftwareApp,
  regenerateSoftwareApiKey,
  deleteSoftwareApp,
  getSoftwareTickets,
  getSoftwareTicketById,
  updateSoftwareTicketStatus,
  assignSoftwareTicket,
  addSoftwareTicketAgentMessage,
  getSoftwareSupportStats,
} = require('../controllers/softwareSupportController');
const { protect } = require('../middleware/authMiddleware');

// ============================================================
// 1. PUBLIC THIRD-PARTY REST APIS (v1)
// ============================================================
// Authenticated via `x-api-key` header or `api_key` param
router.get('/v1/ping', verifySoftwareApiKey, pingSoftwareApi);
router.post('/v1/tickets', verifySoftwareApiKey, createExternalTicket);
router.get('/v1/tickets', verifySoftwareApiKey, getExternalTickets);
router.get('/v1/tickets/:ticketId', verifySoftwareApiKey, getExternalTicketById);
router.post('/v1/tickets/:ticketId/replies', verifySoftwareApiKey, addExternalTicketReply);

// ============================================================
// 2. INTERNAL COMPANY DASHBOARD APIS (Protected via JWT)
// ============================================================
router.use(protect);

// Softwares Registry
router.route('/apps')
  .get(getSoftwareApps)
  .post(createSoftwareApp);

router.route('/apps/:id')
  .put(updateSoftwareApp)
  .delete(deleteSoftwareApp);

router.post('/apps/:id/regenerate-key', regenerateSoftwareApiKey);

// Software Tickets
router.get('/tickets', getSoftwareTickets);
router.get('/tickets/:id', getSoftwareTicketById);
router.put('/tickets/:id/status', updateSoftwareTicketStatus);
router.put('/tickets/:id/assign', assignSoftwareTicket);
router.post('/tickets/:id/messages', addSoftwareTicketAgentMessage);

// Stats
router.get('/stats', getSoftwareSupportStats);

module.exports = router;

