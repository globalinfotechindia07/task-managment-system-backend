const express = require('express');
const router = express.Router();
const {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getMyPermissions,
  getRoleTemplates,
  resetRoleToDefaults
} = require('../controllers/roleController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.use(protect);

// Current user's resolved permissions
router.get('/my-permissions', getMyPermissions);

// Standard role template definitions
router.get('/templates', getRoleTemplates);

// Company roles management
router.route('/')
  .get(getRoles)
  .post(authorizeRoles('Admin', 'CTO', 'Super Admin'), createRole);

router.post('/:id/reset-defaults', authorizeRoles('Admin', 'CTO', 'Super Admin'), resetRoleToDefaults);

router.route('/:id')
  .put(authorizeRoles('Admin', 'CTO', 'Super Admin'), updateRole)
  .delete(authorizeRoles('Admin', 'CTO', 'Super Admin'), deleteRole);

module.exports = router;
