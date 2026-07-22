const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, authorizeRoles('Admin'), getProjects)
  .post(protect, authorizeRoles('Admin'), createProject);

router.route('/:id')
  .put(protect, authorizeRoles('Admin'), updateProject)
  .delete(protect, authorizeRoles('Admin'), deleteProject);

module.exports = router;
