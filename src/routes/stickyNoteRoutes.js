const express = require('express');
const router = express.Router();
const {
  getStickyNotes,
  createStickyNote,
  updateStickyNote,
  deleteStickyNote,
  togglePin,
  toggleComplete,
  updateColor,
  updateStyle,
  testReminder,
  updatePosition,
  updateBatchPositions,
} = require('../controllers/stickyNoteController');
const { protect } = require('../middleware/authMiddleware');

// All sticky notes routes are private and accessible to all company employees
router.use(protect);

// Batch positions update must come before /:id routes
router.patch('/batch-positions', updateBatchPositions);

router.route('/')
  .get(getStickyNotes)
  .post(createStickyNote);

router.route('/:id')
  .put(updateStickyNote)
  .delete(deleteStickyNote);

router.patch('/:id/position', updatePosition);
router.patch('/:id/pin', togglePin);
router.patch('/:id/complete', toggleComplete);
router.patch('/:id/color', updateColor);
router.patch('/:id/style', updateStyle);
router.post('/:id/test-reminder', testReminder);

module.exports = router;
