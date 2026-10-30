const express = require('express');
const router = express.Router();
const {
  getProjects,
  createProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.route('/')
  .get(authorizePermission('projects', 'view'), getProjects)
  .post(authorizePermission('projects', 'create'), upload.single('logo'), createProject);

router.route('/:id')
  .put(authorizePermission('projects', 'edit'), upload.single('logo'), updateProject)
  .delete(authorizePermission('projects', 'delete'), deleteProject);

module.exports = router;
