const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads/tickets directory exists
const ticketUploadsDir = path.join(__dirname, '../../uploads/tickets');
if (!fs.existsSync(ticketUploadsDir)) {
  fs.mkdirSync(ticketUploadsDir, { recursive: true });
}

// Storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ticketUploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `ticket-${cleanBase}-${uniqueSuffix}${ext}`);
  },
});

// File type filter: only allow images and videos
const fileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');

  if (!isImage && !isVideo) {
    return cb(
      new Error('Invalid file type. Only image files (max 1MB) and video files (max 2MB) are allowed.'),
      false
    );
  }
  cb(null, true);
};

// Multer instance with 2MB hard limit (since video max is 2MB)
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB absolute ceiling
  },
  fileFilter,
});

// Post-upload strict size validator
// Image <= 1MB (1,048,576 bytes)
// Video <= 2MB (2,097,152 bytes)
const validateTicketMediaSize = (req, res, next) => {
  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : req.file ? [req.file] : [];

  for (const file of files) {
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (isImage && file.size > 1 * 1024 * 1024) {
      // Remove file from disk
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.error('Failed to remove oversized image:', e.message);
        }
      }
      return res.status(400).json({
        message: `Image "${file.originalname}" is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed image size is 1 MB.`,
      });
    }

    if (isVideo && file.size > 2 * 1024 * 1024) {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.error('Failed to remove oversized video:', e.message);
        }
      }
      return res.status(400).json({
        message: `Video "${file.originalname}" is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed video size is 2 MB.`,
      });
    }
  }

  next();
};

module.exports = {
  uploadTicketMedia: upload,
  validateTicketMediaSize,
};

