const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getTasks, 
  createTask, 
  updateTask, 
  addComment,
  getTaskById,
  deleteTask
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

router.route('/')
  .get(protect, getTasks)
  .post(protect, upload.array('attachments', 5), createTask);

router.route('/:id')
  .get(protect, getTaskById)
  .put(protect, upload.array('attachments', 5), updateTask)
  .delete(protect, deleteTask);

router.route('/:id/comments')
  .post(protect, addComment);

module.exports = router;
