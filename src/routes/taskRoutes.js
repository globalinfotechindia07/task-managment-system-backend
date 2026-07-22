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
  deleteTask,
  addDailyReport
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

router.use(protect);

router.route('/')
  .get(getTasks)
  .post(upload.array('attachments', 5), createTask);

router.route('/:id')
  .get(getTaskById)
  .put(upload.array('attachments', 5), updateTask)
  .delete(deleteTask);

router.post('/:id/comments', addComment);
router.post('/:id/reports', addDailyReport);

module.exports = router;
