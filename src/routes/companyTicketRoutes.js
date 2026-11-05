const express = require('express');
const router = express.Router();
const {
  createCompanyTicket,
  getCompanyTickets,
  getCompanyTicketStats,
  getCompanySolvers,
  getCompanyTicketById,
  updateCompanyTicketStatus,
  reassignCompanyTicket,
  addCompanyTicketMessage,
  uploadTicketMediaFile,
} = require('../controllers/companyTicketController');
const { protect } = require('../middleware/authMiddleware');
const {
  uploadTicketMedia,
  validateTicketMediaSize,
} = require('../middleware/ticketUploadMiddleware');

router.use(protect);

// Upload ticket media
router.post(
  '/upload-media',
  (req, res, next) => {
    uploadTicketMedia.array('media', 5)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: 'File size exceeds limit. Videos must be under 2 MB and images must be under 1 MB.',
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
  .post(createCompanyTicket)
  .get(getCompanyTickets);

router.get('/stats', getCompanyTicketStats);
router.get('/solvers', getCompanySolvers);

router.route('/:id')
  .get(getCompanyTicketById);

router.put('/:id/status', updateCompanyTicketStatus);
router.put('/:id/reassign', reassignCompanyTicket);
router.post('/:id/messages', addCompanyTicketMessage);

module.exports = router;

