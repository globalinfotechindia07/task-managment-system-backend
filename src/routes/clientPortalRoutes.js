const express = require('express');
const router = express.Router();
const {
  getClientDashboard,
  getClientProjects,
  getClientInvoices,
  submitClientQuery,
  getClientQueries,
  getAdminClientPortalOverview,
  updateProjectBilling,
  addProjectMilestone,
  updateProjectMilestone,
  deleteProjectMilestone,
  createClientAccount,
  registerProjectClient,
  resetProjectClientPassword,
  unlinkProjectClient,
  getClientAssignedProjects,
  assignProjectsToClient,
  getAdminClientQueries,
  replyClientQuery,
} = require('../controllers/clientPortalController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// 1. Client Facing Routes (Strictly Isolated to Client's Assigned Projects)
router.get('/dashboard', getClientDashboard);
router.get('/projects', getClientProjects);
router.get('/invoices', getClientInvoices);
router.route('/queries')
  .post(submitClientQuery)
  .get(getClientQueries);

// 2. Admin & Project Manager Routes (Protected against external Clients)
router.use('/admin', (req, res, next) => {
  if (req.user && req.user.role === 'Client') {
    return res.status(403).json({ message: 'Access denied: Clients cannot access administrative management' });
  }
  next();
});

router.get('/admin/overview', getAdminClientPortalOverview);
router.put('/admin/projects/:id/billing', updateProjectBilling);
router.post('/admin/projects/:id/milestones', addProjectMilestone);
router.route('/admin/projects/:id/milestones/:milestoneId')
  .put(updateProjectMilestone)
  .delete(deleteProjectMilestone);

// Direct Project Client Account Registration & Password Management
router.post('/admin/projects/:id/client', registerProjectClient);
router.put('/admin/projects/:id/client-password', resetProjectClientPassword);
router.delete('/admin/projects/:id/client', unlinkProjectClient);

router.post('/admin/clients', createClientAccount);
router.route('/admin/clients/:clientId/projects')
  .get(getClientAssignedProjects)
  .put(assignProjectsToClient);
router.get('/admin/queries', getAdminClientQueries);
router.put('/admin/queries/:id/reply', replyClientQuery);

module.exports = router;

