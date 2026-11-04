const express = require('express');
const router = express.Router();
const {
  getSprints,
  getSprintById,
  createSprint,
  updateSprint,
  deleteSprint,
  assignTasksToSprint,
  createSprintTask,
  batchDivideTasks,
  updateTaskSchedule,
  getProjectTimelineAndStats,
  getDailySchedule,
  getTeamMembers,
} = require('../controllers/sprintController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// Team members for sprint assignment & task division
router.get('/team-members', getTeamMembers);

// Overall Project Timeline & Duration Analytics
router.get('/project/:projectId/timeline', getProjectTimelineAndStats);

// Daily schedule view for a sprint
router.get('/:sprintId/daily-schedule', getDailySchedule);

// Task operations inside sprints
router.post('/assign-tasks', assignTasksToSprint);
router.post('/:sprintId/divide-tasks', batchDivideTasks);
router.post('/:sprintId/tasks', createSprintTask);
router.put('/tasks/:taskId/schedule', updateTaskSchedule);

// Main Sprint CRUD
router.route('/')
  .get(getSprints)
  .post(createSprint);

router.route('/:id')
  .get(getSprintById)
  .put(updateSprint)
  .delete(deleteSprint);

module.exports = router;

