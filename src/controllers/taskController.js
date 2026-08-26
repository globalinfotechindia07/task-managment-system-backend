const Task = require('../models/Task');
const User = require('../models/User');
const { sendTaskAssignmentEmail } = require('../utils/emailService');
const { sendNotificationToUser } = require('../utils/pushService');
const { calculateTaskDueDate, adjustToWorkingHours } = require('../utils/timeCalculator');
const { sendRealTimeNotification, emitTaskUpdate } = require('../utils/socketService');
const PerformanceLog = require('../models/PerformanceLog');
const Notification = require('../models/Notification');

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
      // Find all users who report to this Team Head
      const teamMembers = await User.find({ teamHead: req.user._id }).select('_id');
      const teamMemberIds = teamMembers.map(member => member._id);
      
      // Also include the team head themselves just in case they have their own tasks
      teamMemberIds.push(req.user._id);

      filter.$or = [
        { assignedTo: { $in: teamMemberIds } },
        { assignedBy: req.user._id }
      ];
    }

    // Admins see everything.

    let tasks = await Task.find(filter)
      .populate('project', 'name status')
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
      title, description, project, assignedTo, startDate, dueDate, 
      estimatedTimeDuration, priority, status 
    } = req.body;

    const attachments = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    // If a regular user creates a task, it goes to Awaiting Approval
    const initialStatus = req.user.role === 'User' ? 'Awaiting Approval' : (status || 'Pending');

    const adjustedStartDate = startDate ? new Date(startDate) : new Date();
    const calculatedDueDate = dueDate ? new Date(dueDate) : null;

    const task = new Task({
      title,
      description,
      project,
      assignedTo,
      assignedBy: req.user._id,
      startDate: adjustedStartDate,
      dueDate: calculatedDueDate,
      estimatedTimeDuration,
      priority,
      status: initialStatus,
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

      // Save Notification to DB
      const newNotif = await Notification.create({
        user: assignedTo,
        title: 'New Task Assigned',
        message: `${req.user.name} assigned you a new task: ${createdTask.title}`,
        type: 'task_assigned',
        link: '/user/tasks'
      });

      // Emit Socket.IO real-time notification
      sendRealTimeNotification(assignedTo, newNotif);
      
      // Emit task update so task lists auto-refresh
      emitTaskUpdate([assignedTo, req.user._id], 'task_created', createdTask);
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
          
          if (field === 'status' && updates.status === 'Completed') {
            task.completedAt = new Date();
          }
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
        await updatedTask.populate('assignedTo assignedBy project');
        
        // Notify the relevant party if status was updated
        if (updates.status) {
          const notifyUserId = req.user._id.toString() === updatedTask.assignedTo._id.toString() 
            ? updatedTask.assignedBy._id 
            : updatedTask.assignedTo._id;

          const newNotif = await Notification.create({
            user: notifyUserId,
            title: 'Task Status Updated',
            message: `Task "${updatedTask.title}" status changed to ${updates.status} by ${req.user.name}`,
            type: 'task_updated',
          });
          sendRealTimeNotification(notifyUserId, newNotif);
          
          if (updates.status === 'Completed') {
            let daysLate = 0;
            if (updatedTask.dueDate && updatedTask.completedAt) {
              const diffTime = updatedTask.completedAt - new Date(updatedTask.dueDate);
              if (diffTime > 0) {
                daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              }
            }
            
            await PerformanceLog.create({
              user: updatedTask.assignedTo._id,
              task: updatedTask._id,
              dueDate: updatedTask.dueDate || updatedTask.completedAt,
              completedAt: updatedTask.completedAt,
              daysLate: daysLate,
              status: daysLate > 0 ? 'Late' : 'OnTime',
              month: updatedTask.completedAt.getMonth() + 1,
              year: updatedTask.completedAt.getFullYear()
            });
          }
        }

        // Always emit task update to both assigner and assignee to keep views in sync
        emitTaskUpdate([updatedTask.assignedTo._id, updatedTask.assignedBy._id], 'task_updated', updatedTask);
        
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
      await updatedTask.populate('assignedTo assignedBy');

      // Send notification to the other party
      const notifyUserId = req.user._id.toString() === updatedTask.assignedTo._id.toString() 
          ? updatedTask.assignedBy._id 
          : updatedTask.assignedTo._id;
      
      const newNotif = await Notification.create({
        user: notifyUserId,
        title: 'New Comment',
        message: `${req.user.name} commented on "${updatedTask.title}"`,
        type: 'comment_added'
      });
      sendRealTimeNotification(notifyUserId, newNotif);

      // Emit task update for real-time comment showing
      emitTaskUpdate([updatedTask.assignedTo._id, updatedTask.assignedBy._id], 'task_updated', updatedTask);

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
      .populate('project', 'name status')
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .populate('comments.user', 'name role')
      .populate('reports.user', 'name role')
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

// @desc    Add a daily report to a task
// @route   POST /api/tasks/:id/reports
// @access  Private (Assigned User)
const addDailyReport = async (req, res) => {
  try {
    const { description } = req.body;
    const task = await Task.findById(req.params.id);

    if (task) {
      // Allow assigned user to add a report
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Only the assigned user can submit daily reports for this task' });
      }

      if (!description) {
        return res.status(400).json({ message: 'Description is required for a daily report' });
      }

      const report = {
        description,
        user: req.user._id,
      };

      task.reports.push(report);
      task.history.push({
        action: 'Daily report submitted',
        user: req.user._id
      });

      const updatedTask = await task.save();
      await updatedTask.populate('reports.user', 'name role');
      await updatedTask.populate('assignedTo assignedBy');

      // Notify Assigner (Admin/Team Head)
      const newNotif = await Notification.create({
        user: updatedTask.assignedBy._id,
        title: 'Daily Report Submitted',
        message: `${req.user.name} submitted a daily report for "${updatedTask.title}"`,
        type: 'report_added'
      });
      sendRealTimeNotification(updatedTask.assignedBy._id, newNotif);

      // Emit task update
      emitTaskUpdate([updatedTask.assignedTo._id, updatedTask.assignedBy._id], 'task_updated', updatedTask);

      res.json(updatedTask);
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
  deleteTask,
  addDailyReport
};
