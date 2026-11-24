const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getActiveSession,
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  addMilestone,
  updateTarget,
  getMySessions,
  getAdminAllSessions,
  getAdminStats,
  deleteSession,
  startTaskTimer,
  pauseTaskTimer,
  resumeTaskTimer,
  endTaskTimer,
  getTaskTimerStatus,
} = require('../controllers/timeSessionController');

// All time session routes require authentication
router.use(protect);

// Task-bound timer endpoints (Strictly for assigned user)
router.post('/task/:taskId/start', startTaskTimer);
router.post('/task/:taskId/pause', pauseTaskTimer);
router.post('/task/:taskId/resume', resumeTaskTimer);
router.post('/task/:taskId/end', endTaskTimer);
router.get('/task/:taskId/status', getTaskTimerStatus);

// Current user endpoints
router.get('/active', getActiveSession);
router.post('/start', startSession);
router.post('/:id/pause', pauseSession);
router.post('/:id/resume', resumeSession);
router.post('/:id/end', endSession);
router.post('/:id/milestone', addMilestone);
router.patch('/:id/target', updateTarget);
router.get('/my-sessions', getMySessions);

// Manager / Admin endpoints
router.get('/admin/all', getAdminAllSessions);
router.get('/admin/stats', getAdminStats);
router.delete('/:id', deleteSession);

module.exports = router;
