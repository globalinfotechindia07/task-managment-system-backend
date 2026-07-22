const Task = require('../models/Task');
const User = require('../models/User');
const { sendTaskAssignmentEmail } = require('../utils/emailService');
const { sendNotificationToUser } = require('../utils/pushService');
const { calculateTaskDueDate, adjustToWorkingHours } = require('../utils/timeCalculator');

// @desc    Get all tasks (with filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const filter = {};
    // If regular user, only show assigned tasks
    if (req.user.role === 'User') {
      filter.assignedTo = req.user._id;
    } else if (req.user.role === 'Team Head') {
      // Team Head sees tasks assigned by them or to them (or logic specific to team head)
      // For now, let's keep it simple: if not Admin/HR, see your own stuff
      filter.$or = [{ assignedTo: req.user._id }, { assignedBy: req.user._id }];
    }

    // Admins see everything.

    let tasks = await Task.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .sort({ createdAt: -1 });

    if (req.user.role === 'HR Manager') {
      tasks = tasks.filter(t => t.assignedTo?.role !== 'Admin' && t.assignedBy?.role !== 'Admin');
    }

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private (Admin / Team Head)
const createTask = async (req, res) => {
  try {
    const { 
      title, description, assignedTo, startDate, dueDate, 
      estimatedTimeDuration, priority, status 
    } = req.body;

    const attachments = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    // Adjust start date to working hours and calculate due date automatically
    const adjustedStartDate = adjustToWorkingHours(startDate || new Date());
    const calculatedDueDate = estimatedTimeDuration ? calculateTaskDueDate(adjustedStartDate, estimatedTimeDuration) : dueDate;

    const task = new Task({
      title,
      description,
      assignedTo,
      assignedBy: req.user._id,
      startDate: adjustedStartDate,
      dueDate: calculatedDueDate,
      estimatedTimeDuration,
      priority,
      status: status || 'Pending',
      attachments,
      history: [{
        action: 'Task created',
        user: req.user._id
      }]
    });

    const createdTask = await task.save();
    
    // Fetch assignee details to send email
    const assignedUser = await User.findById(assignedTo);
    if (assignedUser) {
      // Send email asynchronously without blocking the response
      sendTaskAssignmentEmail(createdTask, assignedUser, req.user).catch(err => {
        console.error('Failed to send task assignment email:', err);
      });
      // Send push notification
      sendNotificationToUser(assignedUser, {
        title: 'New Task Assigned',
        body: `${req.user.name} assigned you a new task: ${createdTask.title}`,
        url: '/user/tasks'
      }).catch(err => console.error('Failed to send push notification:', err));
    }

    res.status(201).json(createdTask);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a task (status, details)
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (task) {
      const updates = req.body;
      const historyLog = [];

      ['title', 'description', 'startDate', 'dueDate', 'estimatedTimeDuration', 'priority', 'status', 'assignedTo'].forEach(field => {
        if (updates[field] !== undefined && updates[field] !== task[field]?.toString()) {
          historyLog.push({
            action: `${field} updated to ${updates[field]}`,
            user: req.user._id
          });
          task[field] = updates[field];
        }
      });

      // Recalculate working hours logic if relevant fields changed
      if (updates.startDate || updates.estimatedTimeDuration) {
        task.startDate = adjustToWorkingHours(task.startDate);
        if (task.estimatedTimeDuration) {
          task.dueDate = calculateTaskDueDate(task.startDate, task.estimatedTimeDuration);
        }
      }

      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => `/uploads/${file.filename}`);
        task.attachments.push(...newAttachments);
        historyLog.push({
          action: `Added ${req.files.length} attachment(s)`,
          user: req.user._id
        });
      }

      if (historyLog.length > 0) {
        task.history.push(...historyLog);
        const updatedTask = await task.save();
        res.json(updatedTask);
      } else {
        res.json(task);
      }
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a comment to a task
// @route   POST /api/tasks/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);

    if (task) {
      const comment = {
        text,
        user: req.user._id,
      };

      task.comments.push(comment);
      task.history.push({
        action: 'Comment added',
        user: req.user._id
      });

      const updatedTask = await task.save();
      // Populate user info before returning
      await updatedTask.populate('comments.user', 'name role');
      res.json(updatedTask);
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a specific task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .populate('comments.user', 'name role')
      .populate('history.user', 'name role');

    if (task) {
      res.json(task);
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin or Team Head who created it)
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (task) {
      // Check authorization
      if (req.user.role !== 'Admin' && task.assignedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this task' });
      }

      await Task.findByIdAndDelete(req.params.id);
      res.json({ message: 'Task removed successfully' });
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  addComment,
  getTaskById,
  deleteTask
};
