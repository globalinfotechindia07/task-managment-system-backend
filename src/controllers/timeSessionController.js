const TimeSession = require('../models/TimeSession');
const User = require('../models/User');
const Task = require('../models/Task');
const { getIO } = require('../utils/socketService');
const { sendNotificationToUser } = require('../utils/pushService');

// Helper to broadcast socket updates safely
const broadcastTimerUpdate = (event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.emit(event, data);
    }
  } catch (err) {
    // Non-fatal if socket not ready
  }
};

/**
 * @desc Get current active session for logged-in user (running or paused)
 * @route GET /api/time-sessions/active
 * @access Private
 */
const getActiveSession = async (req, res) => {
  try {
    const session = await TimeSession.findOne({
      user: req.user._id,
      status: { $in: ['running', 'paused'] },
    }).populate('project', 'name color status');

    if (!session) {
      return res.status(200).json({ active: false, session: null });
    }

    const metrics = session.calculateCurrentMetrics();

    res.status(200).json({
      active: true,
      session: {
        ...session.toObject(),
        liveMetrics: metrics,
      },
    });
  } catch (error) {
    console.error('Error in getActiveSession:', error);
    res.status(500).json({ message: 'Failed to fetch active timer session', error: error.message });
  }
};

/**
 * @desc Start a new work timer session
 * @route POST /api/time-sessions/start
 * @access Private
 */
const startSession = async (req, res) => {
  try {
    const {
      taskTitle,
      description,
      project,
      projectName,
      task,
      mode = 'stopwatch',
      targetDurationMinutes = 0,
      targetEndTime,
    } = req.body;

    if (!taskTitle || !taskTitle.trim()) {
      return res.status(400).json({ message: 'Task or activity title is required to start the timer' });
    }

    // Check if user already has an active session
    const existing = await TimeSession.findOne({
      user: req.user._id,
      status: { $in: ['running', 'paused'] },
    });

    if (existing) {
      return res.status(400).json({
        message: 'You already have an active work timer session. Please pause or end it first.',
        session: existing,
      });
    }

    let taskDoc = null;
    let finalProject = project || undefined;
    let finalProjectName = (projectName || '').trim();
    let finalDurationMinutes = Number(targetDurationMinutes) || 0;
    let finalMode = mode === 'timeline' ? 'timeline' : 'stopwatch';

    if (task) {
      taskDoc = await Task.findById(task).populate('assignedTo', 'name email').populate('project', 'name');
      if (!taskDoc) {
        return res.status(404).json({ message: 'Linked task not found' });
      }

      // Permission check: assigned user, Admin/Manager, or task creator
      const userRole = (req.user.role || '').toLowerCase();
      const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
      const assignedId = taskDoc.assignedTo?._id
        ? taskDoc.assignedTo._id.toString()
        : taskDoc.assignedTo
        ? taskDoc.assignedTo.toString()
        : null;
      const isAssignee = Boolean(assignedId && assignedId === req.user._id.toString());
      const isAssigner = Boolean(taskDoc.assignedBy && (taskDoc.assignedBy._id || taskDoc.assignedBy).toString() === req.user._id.toString());

      if (!isAssignee && !isAdmin && !isAssigner) {
        const assigneeName = taskDoc.assignedTo?.name || 'another employee';
        return res.status(403).json({
          message: `Access Denied: This task is assigned to ${assigneeName}. Only the assigned user or Admin can start, pause, or end the work timer for this task.`,
        });
      }

      if (!finalProject && taskDoc.project) {
        finalProject = taskDoc.project._id || taskDoc.project;
        finalProjectName = taskDoc.project.name || finalProjectName;
      }

      if (finalDurationMinutes === 0) {
        if (taskDoc.targetDurationMinutes > 0) {
          finalDurationMinutes = taskDoc.targetDurationMinutes;
          finalMode = taskDoc.timeTrackingMode || 'timeline';
        } else if (taskDoc.estimatedTimeDuration) {
          finalDurationMinutes = Math.round(Number(taskDoc.estimatedTimeDuration) * 60);
          finalMode = taskDoc.timeTrackingMode || 'timeline';
        }
      }
    }

    const now = new Date();
    const session = new TimeSession({
      user: req.user._id,
      company: req.user.company,
      taskTitle: taskTitle.trim(),
      description: (description || '').trim(),
      project: finalProject,
      projectName: finalProjectName,
      task: task || undefined,
      mode: finalMode,
      targetDurationMinutes: finalDurationMinutes,
      targetEndTime: targetEndTime ? new Date(targetEndTime) : undefined,
      startTime: now,
      status: 'running',
      timeline: [
        {
          timestamp: now,
          type: 'start',
          title: 'Work Timer Started',
          note: `Started working on "${taskTitle.trim()}"`,
          elapsedSecondsAtMoment: 0,
        },
      ],
    });

    await session.save();

    if (taskDoc) {
      taskDoc.activeTimeSession = session._id;
      if (taskDoc.status === 'Pending') {
        taskDoc.status = 'In Progress';
      }
      taskDoc.history.push({
        action: `Work timer started by assigned user (${req.user.name})`,
        user: req.user._id,
      });
      await taskDoc.save();
    }

    // Broadcast to live admin listeners
    broadcastTimerUpdate('timeSession:started', {
      sessionId: session._id,
      userId: req.user._id,
      userName: req.user.name,
      taskTitle: session.taskTitle,
      taskId: task || undefined,
      status: 'running',
      startTime: now,
    });

    // Optional push notification
    sendNotificationToUser(req.user, {
      title: '⏱️ Work Timer Started',
      body: `You are now tracking time for "${session.taskTitle}"`,
      url: '/time-tracker',
    }).catch(() => {});

    res.status(201).json({
      message: 'Work timer started successfully',
      session,
    });
  } catch (error) {
    console.error('Error in startSession:', error);
    res.status(500).json({ message: 'Failed to start timer session', error: error.message });
  }
};

/**
 * @desc Pause an ongoing work timer session (Requires mandatory reason!)
 * @route POST /api/time-sessions/:id/pause
 * @access Private
 */
const pauseSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        message: 'Pause reason is mandatory. Please state why the timer is being paused (e.g. Lunch Break, Tea Break, Meeting).',
      });
    }

    const session = await TimeSession.findById(id).populate('task');

    if (!session) {
      return res.status(404).json({ message: 'Active timer session not found' });
    }

    // User check: assigned user, session owner, or Admin
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
    const isOwner = session.user.toString() === req.user._id.toString();
    let isTaskAssignee = false;
    if (session.task) {
      const taskDoc = session.task._id ? session.task : await Task.findById(session.task);
      if (taskDoc && (taskDoc.assignedTo?._id || taskDoc.assignedTo)?.toString() === req.user._id.toString()) {
        isTaskAssignee = true;
      }
    }

    if (!isOwner && !isAdmin && !isTaskAssignee) {
      return res.status(403).json({
        message: 'Access Denied: Only the assigned employee or Admin can pause this work timer.',
      });
    }

    if (session.status !== 'running') {
      return res.status(400).json({ message: 'Only running timer sessions can be paused' });
    }

    const now = new Date();
    const metrics = session.calculateCurrentMetrics();

    session.status = 'paused';
    session.currentPauseReason = reason.trim();
    session.pauses.push({
      pausedAt: now,
      reason: reason.trim(),
    });

    session.timeline.push({
      timestamp: now,
      type: 'pause',
      title: 'Timer Paused',
      reason: reason.trim(),
      note: `Paused for: ${reason.trim()}`,
      elapsedSecondsAtMoment: metrics.productiveDurationSeconds,
    });

    await session.save();

    broadcastTimerUpdate('timeSession:paused', {
      sessionId: session._id,
      userId: req.user._id,
      userName: req.user.name,
      reason: reason.trim(),
      status: 'paused',
      pausedAt: now,
    });

    sendNotificationToUser(req.user, {
      title: '⏸️ Work Timer Paused',
      body: `Paused for: "${reason.trim()}". Remember to resume when you return!`,
      url: '/time-tracker',
    }).catch(() => {});

    res.status(200).json({
      message: 'Timer paused successfully',
      session,
    });
  } catch (error) {
    console.error('Error in pauseSession:', error);
    res.status(500).json({ message: 'Failed to pause timer session', error: error.message });
  }
};

/**
 * @desc Resume a paused timer session
 * @route POST /api/time-sessions/:id/resume
 * @access Private
 */
const resumeSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await TimeSession.findById(id).populate('task');

    if (!session) {
      return res.status(404).json({ message: 'Paused timer session not found' });
    }

    // User check: assigned user, session owner, or Admin
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
    const isOwner = session.user.toString() === req.user._id.toString();
    let isTaskAssignee = false;
    if (session.task) {
      const taskDoc = session.task._id ? session.task : await Task.findById(session.task);
      if (taskDoc && (taskDoc.assignedTo?._id || taskDoc.assignedTo)?.toString() === req.user._id.toString()) {
        isTaskAssignee = true;
      }
    }

    if (!isOwner && !isAdmin && !isTaskAssignee) {
      return res.status(403).json({
        message: 'Access Denied: Only the assigned employee or Admin can resume this work timer.',
      });
    }

    if (session.status !== 'paused') {
      return res.status(400).json({ message: 'Only paused timer sessions can be resumed' });
    }

    const now = new Date();

    // Finalize the last open pause event
    let pauseDurationSec = 0;
    let lastReason = session.currentPauseReason || 'Break';

    if (session.pauses && session.pauses.length > 0) {
      const lastPause = session.pauses[session.pauses.length - 1];
      if (!lastPause.resumedAt) {
        lastPause.resumedAt = now;
        pauseDurationSec = Math.max(0, Math.floor((now - new Date(lastPause.pausedAt)) / 1000));
        lastPause.durationSeconds = pauseDurationSec;
        lastReason = lastPause.reason || lastReason;
      }
    }

    session.status = 'running';
    session.currentPauseReason = '';

    const metrics = session.calculateCurrentMetrics();
    session.totalPauseSeconds = metrics.totalPauseSeconds;

    const pauseMinutes = Math.round(pauseDurationSec / 60);
    const pauseText = pauseMinutes > 0 ? `${pauseMinutes}m` : `${pauseDurationSec}s`;

    session.timeline.push({
      timestamp: now,
      type: 'resume',
      title: 'Timer Resumed',
      note: `Resumed work after ${pauseText} break (${lastReason})`,
      elapsedSecondsAtMoment: metrics.productiveDurationSeconds,
    });

    await session.save();

    broadcastTimerUpdate('timeSession:resumed', {
      sessionId: session._id,
      userId: req.user._id,
      userName: req.user.name,
      status: 'running',
      resumedAt: now,
    });

    sendNotificationToUser(req.user, {
      title: '▶️ Work Timer Resumed',
      body: `Back to work on "${session.taskTitle}". Let's stay productive!`,
      url: '/time-tracker',
    }).catch(() => {});

    res.status(200).json({
      message: 'Timer resumed successfully',
      session,
    });
  } catch (error) {
    console.error('Error in resumeSession:', error);
    res.status(500).json({ message: 'Failed to resume timer session', error: error.message });
  }
};

/**
 * @desc End / Complete a work timer session
 * @route POST /api/time-sessions/:id/end
 * @access Private
 */
const endSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { completionNotes } = req.body;

    const session = await TimeSession.findById(id).populate('task');

    if (!session) {
      return res.status(404).json({ message: 'Active timer session not found to end' });
    }

    // User check: assigned user, session owner, or Admin
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
    const isOwner = session.user.toString() === req.user._id.toString();
    let isTaskAssignee = false;
    if (session.task) {
      const taskDoc = session.task._id ? session.task : await Task.findById(session.task);
      if (taskDoc && (taskDoc.assignedTo?._id || taskDoc.assignedTo)?.toString() === req.user._id.toString()) {
        isTaskAssignee = true;
      }
    }

    if (!isOwner && !isAdmin && !isTaskAssignee) {
      return res.status(403).json({
        message: 'Access Denied: Only the assigned employee or Admin can end this work timer.',
      });
    }

    if (!['running', 'paused'].includes(session.status)) {
      return res.status(400).json({ message: 'This timer session is already ended or completed' });
    }

    const now = new Date();

    // If was paused when ending, close the pause
    if (session.status === 'paused' && session.pauses && session.pauses.length > 0) {
      const lastPause = session.pauses[session.pauses.length - 1];
      if (!lastPause.resumedAt) {
        lastPause.resumedAt = now;
        lastPause.durationSeconds = Math.max(0, Math.floor((now - new Date(lastPause.pausedAt)) / 1000));
      }
    }

    session.endTime = now;
    session.status = 'completed';
    session.currentPauseReason = '';
    session.completionNotes = (completionNotes || '').trim();

    // Compute final exact metrics
    const metrics = session.calculateCurrentMetrics();
    session.totalDurationSeconds = metrics.totalDurationSeconds;
    session.totalPauseSeconds = metrics.totalPauseSeconds;
    session.productiveDurationSeconds = metrics.productiveDurationSeconds;

    const productiveHrs = (session.productiveDurationSeconds / 3600).toFixed(2);

    session.timeline.push({
      timestamp: now,
      type: 'end',
      title: 'Work Session Completed',
      note: session.completionNotes
        ? `Finished (${productiveHrs}h productive): ${session.completionNotes}`
        : `Completed session with total ${productiveHrs}h productive time.`,
      elapsedSecondsAtMoment: session.productiveDurationSeconds,
    });

    await session.save();

    // Update linked task if present
    if (session.task) {
      try {
        const linkedTask = await Task.findById(session.task);
        if (linkedTask) {
          linkedTask.activeTimeSession = null;
          linkedTask.totalLoggedSeconds = (linkedTask.totalLoggedSeconds || 0) + session.productiveDurationSeconds;
          linkedTask.history.push({
            action: `Work timer completed (${productiveHrs}h logged)`,
            user: req.user._id,
          });
          await linkedTask.save();
        }
      } catch (tErr) {
        console.error('Failed to update task on timer end:', tErr);
      }
    }

    broadcastTimerUpdate('timeSession:ended', {
      sessionId: session._id,
      userId: req.user._id,
      userName: req.user.name,
      status: 'completed',
      productiveHours: productiveHrs,
      endTime: now,
    });

    sendNotificationToUser(req.user, {
      title: '✅ Session Completed',
      body: `You logged ${productiveHrs}h productive work on "${session.taskTitle}". Great job!`,
      url: '/time-tracker',
    }).catch(() => {});

    res.status(200).json({
      message: 'Work timer session ended successfully',
      session,
    });
  } catch (error) {
    console.error('Error in endSession:', error);
    res.status(500).json({ message: 'Failed to end timer session', error: error.message });
  }
};

/**
 * @desc Add a milestone / checkpoint note to an active timeline
 * @route POST /api/time-sessions/:id/milestone
 * @access Private
 */
const addMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, title } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ message: 'Milestone description is required' });
    }

    const session = await TimeSession.findOne({
      _id: id,
      user: req.user._id,
      status: { $in: ['running', 'paused'] },
    });

    if (!session) {
      return res.status(404).json({ message: 'Active timer session not found' });
    }

    const now = new Date();
    const metrics = session.calculateCurrentMetrics();

    session.timeline.push({
      timestamp: now,
      type: 'milestone',
      title: (title || 'Progress Milestone').trim(),
      note: note.trim(),
      elapsedSecondsAtMoment: metrics.productiveDurationSeconds,
    });

    await session.save();

    res.status(200).json({
      message: 'Milestone added to timeline',
      session,
    });
  } catch (error) {
    console.error('Error in addMilestone:', error);
    res.status(500).json({ message: 'Failed to add milestone', error: error.message });
  }
};

/**
 * @desc Get user's own timer sessions history
 * @route GET /api/time-sessions/my-sessions
 * @access Private
 */
const getMySessions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date, search } = req.query;

    const query = {
      user: req.user._id,
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.startTime = { $gte: startOfDay, $lte: endOfDay };
    }

    if (search && search.trim()) {
      query.taskTitle = { $regex: search.trim(), $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [sessions, total] = await Promise.all([
      TimeSession.find(query)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('project', 'name color'),
      TimeSession.countDocuments(query),
    ]);

    // Compute live metrics for running/paused items
    const formatted = sessions.map((s) => {
      const obj = s.toObject();
      if (s.status === 'running' || s.status === 'paused') {
        obj.liveMetrics = s.calculateCurrentMetrics();
      }
      return obj;
    });

    res.status(200).json({
      sessions: formatted,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error in getMySessions:', error);
    res.status(500).json({ message: 'Failed to fetch sessions history', error: error.message });
  }
};

/**
 * @desc Admin: View all company users' timer logs & timeline history
 * @route GET /api/time-sessions/admin/all
 * @access Private (Admin / HR / TL / Super Admin)
 */
const getAdminAllSessions = async (req, res) => {
  try {
    // Check permission: Admin, Super Admin, CTO, HR, Team Lead or specific perms
    const r = (req.user.role || '').toLowerCase();
    const isAuthorized =
      r === 'admin' ||
      r === 'super admin' ||
      r === 'cto' ||
      r.includes('hr') ||
      r.includes('lead') ||
      req.user.permissions?.attendance?.view ||
      req.user.permissions?.reports?.view;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied. Only managers and administrators can view all employee time logs.' });
    }

    const {
      userId,
      status,
      startDate,
      endDate,
      pauseReason,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const query = {};

    // Scope to user's company (unless Super Admin)
    if (r !== 'super admin' && req.user.company) {
      query.company = req.user.company;
    }

    if (userId && userId !== 'all') {
      query.user = userId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (pauseReason && pauseReason.trim()) {
      query['pauses.reason'] = { $regex: pauseReason.trim(), $options: 'i' };
    }

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        query.startTime.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        query.startTime.$lte = e;
      }
    }

    if (search && search.trim()) {
      query.$or = [
        { taskTitle: { $regex: search.trim(), $options: 'i' } },
        { projectName: { $regex: search.trim(), $options: 'i' } },
        { currentPauseReason: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [sessions, total] = await Promise.all([
      TimeSession.find(query)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('user', 'name email designation department role')
        .populate('project', 'name color'),
      TimeSession.countDocuments(query),
    ]);

    const formatted = sessions.map((s) => {
      const obj = s.toObject();
      if (s.status === 'running' || s.status === 'paused') {
        obj.liveMetrics = s.calculateCurrentMetrics();
      }
      return obj;
    });

    res.status(200).json({
      sessions: formatted,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error in getAdminAllSessions:', error);
    res.status(500).json({ message: 'Failed to fetch admin time logs', error: error.message });
  }
};

/**
 * @desc Admin: Get live team tracking stats & overview
 * @route GET /api/time-sessions/admin/stats
 * @access Private (Admin / HR / TL / Super Admin)
 */
const getAdminStats = async (req, res) => {
  try {
    const r = (req.user.role || '').toLowerCase();
    const isAuthorized =
      r === 'admin' ||
      r === 'super admin' ||
      r === 'cto' ||
      r.includes('hr') ||
      r.includes('lead') ||
      req.user.permissions?.attendance?.view ||
      req.user.permissions?.reports?.view;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const companyFilter = r !== 'super admin' && req.user.company ? { company: req.user.company } : {};

    // 1. Currently active sessions right now
    const activeSessions = await TimeSession.find({
      ...companyFilter,
      status: { $in: ['running', 'paused'] },
    }).populate('user', 'name email designation department');

    const currentlyWorking = [];
    const currentlyPaused = [];

    activeSessions.forEach((s) => {
      const metrics = s.calculateCurrentMetrics();
      const payload = {
        _id: s._id,
        user: s.user,
        taskTitle: s.taskTitle,
        startTime: s.startTime,
        status: s.status,
        currentPauseReason: s.currentPauseReason,
        liveMetrics: metrics,
      };

      if (s.status === 'running') {
        currentlyWorking.push(payload);
      } else {
        currentlyPaused.push(payload);
      }
    });

    // 2. Today's completed metrics
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySessions = await TimeSession.find({
      ...companyFilter,
      startTime: { $gte: todayStart },
    });

    let todayProductiveSeconds = 0;
    let todayPauseSeconds = 0;
    const pauseReasonsCount = {};

    todaySessions.forEach((s) => {
      const metrics = s.calculateCurrentMetrics();
      todayProductiveSeconds += metrics.productiveDurationSeconds;
      todayPauseSeconds += metrics.totalPauseSeconds;

      if (Array.isArray(s.pauses)) {
        s.pauses.forEach((p) => {
          if (p.reason) {
            const rNorm = p.reason.trim();
            pauseReasonsCount[rNorm] = (pauseReasonsCount[rNorm] || 0) + 1;
          }
        });
      }
    });

    // Sort pause reasons by frequency
    const topPauseReasons = Object.entries(pauseReasonsCount)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    res.status(200).json({
      currentlyWorkingCount: currentlyWorking.length,
      currentlyPausedCount: currentlyPaused.length,
      totalActiveCount: activeSessions.length,
      currentlyWorking,
      currentlyPaused,
      todayProductiveHours: +(todayProductiveSeconds / 3600).toFixed(1),
      todayPauseHours: +(todayPauseSeconds / 3600).toFixed(1),
      todaySessionsCount: todaySessions.length,
      topPauseReasons,
    });
  } catch (error) {
    console.error('Error in getAdminStats:', error);
    res.status(500).json({ message: 'Failed to compute admin timer stats', error: error.message });
  }
};

/**
 * @desc Admin: Delete a timer session
 * @route DELETE /api/time-sessions/:id
 * @access Private (Admin / Super Admin)
 */
const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await TimeSession.findById(id);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const r = (req.user.role || '').toLowerCase();
    const isAdmin = r === 'admin' || r === 'super admin' || r === 'cto';

    if (!isAdmin && session.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this session' });
    }

    await TimeSession.findByIdAndDelete(id);

    res.status(200).json({ message: 'Timer session record removed' });
  } catch (error) {
    console.error('Error in deleteSession:', error);
    res.status(500).json({ message: 'Failed to delete timer session', error: error.message });
  }
};

/**
 * @desc Update target timeline duration or mode on active session
 * @route PATCH /api/time-sessions/:id/target
 * @access Private
 */
const updateTarget = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, targetDurationMinutes, targetEndTime } = req.body;

    const session = await TimeSession.findOne({
      _id: id,
      user: req.user._id,
      status: { $in: ['running', 'paused'] },
    });

    if (!session) {
      return res.status(404).json({ message: 'Active timer session not found' });
    }

    if (mode) session.mode = mode;
    if (targetDurationMinutes !== undefined) {
      session.targetDurationMinutes = Math.max(0, Number(targetDurationMinutes));
    }
    if (targetEndTime) {
      session.targetEndTime = new Date(targetEndTime);
    }

    session.timeline.push({
      timestamp: new Date(),
      type: 'milestone',
      title: 'Target Timeline Updated',
      note: `Target duration set to ${session.targetDurationMinutes} minutes`,
    });

    await session.save();

    res.status(200).json({
      message: 'Target timeline updated successfully',
      session,
    });
  } catch (error) {
    console.error('Error in updateTarget:', error);
    res.status(500).json({ message: 'Failed to update target timeline', error: error.message });
  }
};

/**
 * @desc Start time tracking for an assigned task
 * @route POST /api/time-sessions/task/:taskId/start
 * @access Private (Assigned User ONLY)
 */
const startTaskTimer = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { mode, targetDurationMinutes, description } = req.body;

    const task = await Task.findById(taskId).populate('assignedTo', 'name email').populate('project', 'name');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Permission check: assigned user, task creator, or Admin/Manager
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
    const assignedId = task.assignedTo?._id ? task.assignedTo._id.toString() : task.assignedTo ? task.assignedTo.toString() : null;
    const isAssignee = Boolean(assignedId && assignedId === req.user._id.toString());
    const isAssigner = Boolean(task.assignedBy && (task.assignedBy._id || task.assignedBy).toString() === req.user._id.toString());

    if (!isAssignee && !isAdmin && !isAssigner) {
      const assigneeName = task.assignedTo?.name || 'the assigned employee';
      return res.status(403).json({
        message: `Access Denied: This task is assigned to ${assigneeName}. Only the assigned user or Admin can start, pause, or end time tracking for this task.`,
      });
    }

    // Check if user already has an active session
    const existing = await TimeSession.findOne({
      user: req.user._id,
      status: { $in: ['running', 'paused'] },
    });
    if (existing) {
      // If it's already active for this exact task, return successfully
      if (existing.task && existing.task.toString() === task._id.toString()) {
        return res.status(200).json({
          message: 'Timer is already active for this task',
          session: existing,
          task,
        });
      }
      return res.status(400).json({
        message: `You already have an active timer running for "${existing.taskTitle}". Please pause or end it first before starting a new one.`,
        session: existing,
      });
    }

    const duration = targetDurationMinutes !== undefined && targetDurationMinutes !== null
      ? Number(targetDurationMinutes)
      : (task.targetDurationMinutes || (task.estimatedTimeDuration ? Math.round(Number(task.estimatedTimeDuration) * 60) : 0));

    const now = new Date();
    const session = new TimeSession({
      user: req.user._id,
      company: req.user.company,
      taskTitle: task.title,
      description: description || task.description || '',
      project: task.project?._id || task.project,
      projectName: task.project?.name || '',
      task: task._id,
      mode: mode || task.timeTrackingMode || (duration > 0 ? 'timeline' : 'stopwatch'),
      targetDurationMinutes: duration,
      startTime: now,
      status: 'running',
      timeline: [
        {
          timestamp: now,
          type: 'start',
          title: 'Task Timer Started',
          note: `Started working on assigned task: "${task.title}"`,
          elapsedSecondsAtMoment: 0,
        },
      ],
    });

    await session.save();

    task.activeTimeSession = session._id;
    if (task.status === 'Pending') {
      task.status = 'In Progress';
    }
    task.history.push({
      action: `Timer started by assigned user (${req.user.name})`,
      user: req.user._id,
    });
    await task.save();

    broadcastTimerUpdate('timeSession:started', {
      sessionId: session._id,
      taskId: task._id,
      userId: req.user._id,
      userName: req.user.name,
      taskTitle: session.taskTitle,
      status: 'running',
      startTime: now,
    });

    res.status(201).json({
      message: 'Task timer started successfully',
      session,
      task,
    });
  } catch (error) {
    console.error('Error in startTaskTimer:', error);
    res.status(500).json({ message: 'Failed to start task timer', error: error.message });
  }
};

/**
 * @desc Get timer status & permission for a task
 * @route GET /api/time-sessions/task/:taskId/status
 * @access Private
 */
const getTaskTimerStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId).populate('assignedTo', 'name email role');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const activeSession = await TimeSession.findOne({
      task: taskId,
      status: { $in: ['running', 'paused'] },
    }).populate('user', 'name email');

    const assignedId = task.assignedTo?._id ? task.assignedTo._id.toString() : task.assignedTo?.toString();
    const isAssignedToMe = Boolean(assignedId && assignedId === req.user._id.toString());
    const userRole = (req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'super admin', 'cto'].includes(userRole);
    const isAssigner = Boolean(task.assignedBy && (task.assignedBy._id || task.assignedBy).toString() === req.user._id.toString());
    const canControlTimer = isAssignedToMe || isAdmin || isAssigner;

    res.json({
      taskId: task._id,
      title: task.title,
      targetDurationMinutes: task.targetDurationMinutes || (task.estimatedTimeDuration ? Math.round(Number(task.estimatedTimeDuration) * 60) : 0),
      timeTrackingMode: task.timeTrackingMode || 'stopwatch',
      isTimerRequired: task.isTimerRequired !== false,
      totalLoggedSeconds: task.totalLoggedSeconds || 0,
      assignedTo: task.assignedTo,
      isAssignedToMe,
      activeSession: activeSession ? {
        ...activeSession.toObject(),
        liveMetrics: activeSession.calculateCurrentMetrics(),
      } : null,
      canControlTimer,
    });
  } catch (error) {
    console.error('Error in getTaskTimerStatus:', error);
    res.status(500).json({ message: 'Failed to fetch task timer status', error: error.message });
  }
};

/**
 * @desc Pause active timer session for a task
 * @route POST /api/time-sessions/task/:taskId/pause
 * @access Private (Assigned User ONLY)
 */
const pauseTaskTimer = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        message: 'Pause reason is mandatory. Please state why the timer is being paused.',
      });
    }

    const session = await TimeSession.findOne({
      task: taskId,
      status: 'running',
    });

    if (!session) {
      return res.status(404).json({ message: 'No running timer session found for this task' });
    }

    req.params.id = session._id.toString();
    return pauseSession(req, res);
  } catch (error) {
    console.error('Error in pauseTaskTimer:', error);
    res.status(500).json({ message: 'Failed to pause task timer', error: error.message });
  }
};

/**
 * @desc Resume paused timer session for a task
 * @route POST /api/time-sessions/task/:taskId/resume
 * @access Private (Assigned User ONLY)
 */
const resumeTaskTimer = async (req, res) => {
  try {
    const { taskId } = req.params;

    const session = await TimeSession.findOne({
      task: taskId,
      status: 'paused',
    });

    if (!session) {
      return res.status(404).json({ message: 'No paused timer session found for this task' });
    }

    req.params.id = session._id.toString();
    return resumeSession(req, res);
  } catch (error) {
    console.error('Error in resumeTaskTimer:', error);
    res.status(500).json({ message: 'Failed to resume task timer', error: error.message });
  }
};

/**
 * @desc End active timer session for a task
 * @route POST /api/time-sessions/task/:taskId/end
 * @access Private (Assigned User ONLY)
 */
const endTaskTimer = async (req, res) => {
  try {
    const { taskId } = req.params;

    const session = await TimeSession.findOne({
      task: taskId,
      status: { $in: ['running', 'paused'] },
    });

    if (!session) {
      return res.status(404).json({ message: 'No active timer session found for this task to end' });
    }

    req.params.id = session._id.toString();
    return endSession(req, res);
  } catch (error) {
    console.error('Error in endTaskTimer:', error);
    res.status(500).json({ message: 'Failed to end task timer', error: error.message });
  }
};

module.exports = {
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
};
