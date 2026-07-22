const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Routes are protected and accessible by Admin and Team Head
router.route('/')
  .get(protect, authorizeRoles('Admin', 'Team Head', 'HR Manager'), getUsers)
  .post(protect, authorizeRoles('Admin', 'Team Head'), createUser);

router.route('/:id')
  .put(protect, authorizeRoles('Admin', 'Team Head'), updateUser)
  .delete(protect, authorizeRoles('Admin'), deleteUser);

module.exports = router;
