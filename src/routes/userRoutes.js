const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes are protected and accessible by Admin and Team Head
router.route('/')
  .get(protect, authorizeRoles('Admin', 'Team Head', 'HR Manager', 'CTO'), getUsers)
  .post(protect, authorizeRoles('Admin', 'Team Head', 'CTO'), createUser);

router.route('/:id')
  .put(protect, authorizeRoles('Admin', 'Team Head', 'CTO'), updateUser)
  .delete(protect, authorizeRoles('Admin'), deleteUser);

module.exports = router;
