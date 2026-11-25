const express = require('express');
const router = express.Router();
const {
  authUser,
  getUserProfile,
  forcePasswordChange,
  updateUserProfile,
  getDemoCredentials,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');

// Configure multer for profile pictures
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `profile-${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/login', authUser);
router.get('/demo-credentials', getDemoCredentials);
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, upload.single('profilePicture'), updateUserProfile);

router.put('/force-password-change', protect, forcePasswordChange);

module.exports = router;
