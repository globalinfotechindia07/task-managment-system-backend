const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { protect, authorizePermission } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(authorizePermission('users', 'view'), getUsers)
  .post(authorizePermission('users', 'create'), createUser);

router.route('/:id')
  .put(authorizePermission('users', 'edit'), updateUser)
  .delete(authorizePermission('users', 'delete'), deleteUser);

module.exports = router;
