const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
  getMessages, 
  sendMessage, 
  sendMediaMessage,
  markAsRead,
  createGroup,
  updateGroup,
  getUserGroups,
  getGroupMessages,
  getConversations
} = require('../controllers/chatController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `chat-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use(protect); // All chat routes require authentication

// Get all conversations (WhatsApp like sidebar)
router.get('/conversations', getConversations);

// Group routes
router.post('/groups', authorizeRoles('Admin'), createGroup); // Only admins can create groups
router.put('/groups/:groupId', authorizeRoles('Admin'), updateGroup); // Only admins can edit groups
router.get('/groups', getUserGroups);
router.get('/group/:groupId', getGroupMessages);

// Direct message routes
router.get('/:userId', getMessages);
router.post('/send', sendMessage);
router.post('/send-media', upload.single('media'), sendMediaMessage);
router.put('/read/:userId', markAsRead);

module.exports = router;
