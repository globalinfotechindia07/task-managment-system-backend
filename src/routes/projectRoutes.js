const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.route('/')
  .get(getProjects)
  .post(authorizePermission('projects', 'create'), upload.single('logo'), createProject);

router.route('/:id')
  .get(getProjectById)
  .put(authorizePermission('projects', 'edit'), upload.single('logo'), updateProject)
  .delete(authorizePermission('projects', 'delete'), deleteProject);

module.exports = router;
