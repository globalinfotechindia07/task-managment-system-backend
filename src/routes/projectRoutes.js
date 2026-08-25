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
  .get(protect, authorizeRoles('Admin', 'Team Head', 'User', 'CTO'), getProjects)
  .post(protect, authorizeRoles('Admin', 'CTO'), upload.single('logo'), createProject);

router.route('/:id')
  .put(protect, authorizeRoles('Admin', 'CTO'), upload.single('logo'), updateProject)
  .delete(protect, authorizeRoles('Admin', 'CTO'), deleteProject);

module.exports = router;
