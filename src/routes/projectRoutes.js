const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.route('/')
  .get(protect, authorizeRoles('Admin', 'Team Head'), getProjects)
  .post(protect, authorizeRoles('Admin'), upload.single('logo'), createProject);

router.route('/:id')
  .put(protect, authorizeRoles('Admin'), upload.single('logo'), updateProject)
  .delete(protect, authorizeRoles('Admin'), deleteProject);

module.exports = router;
