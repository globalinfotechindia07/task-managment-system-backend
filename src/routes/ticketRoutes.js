const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTickets,
  getTicketById,
  updateTicketStatus,
  addTicketMessage,
  getTicketStats,
  uploadTicketMediaFile,
} = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');
const {
  uploadTicketMedia,
  validateTicketMediaSize,
} = require('../middleware/ticketUploadMiddleware');

router.use(protect);

// Upload ticket media (Image max 1MB, Video max 2MB)
router.post(
  '/upload-media',
  (req, res, next) => {
    uploadTicketMedia.array('media', 5)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: 'File size exceeds system limit. Videos must be under 2 MB and images must be under 1 MB.',
          });
        }
        return res.status(400).json({ message: err.message || 'Media upload error' });
      }
      next();
    });
  },
  validateTicketMediaSize,
  uploadTicketMediaFile
);

router.route('/')
  .post(createTicket)
  .get(getTickets);

router.get('/stats', getTicketStats);
router.get('/stats/summary', getTicketStats);

router.route('/:id')
  .get(getTicketById);

router.put('/:id/status', updateTicketStatus);
router.post('/:id/messages', addTicketMessage);

module.exports = router;

