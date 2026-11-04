const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendTaskAssignmentEmail } = require('../utils/emailService');
const { sendNotificationToUser } = require('../utils/pushService');
const { logAudit } = require('../utils/auditLogger');

// Helper to extract companyId from request
const getCompanyId = (req) => {
  return (req.user?.company?._id || req.user?.company || req.companyId)?.toString();
};

// ===================== GET COMPANY TEAM MEMBERS WITH WORKLOAD =====================
exports.getTeamMembers = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    // Fetch all active company users (Staff, Leads, Admins, CTOs, etc.)
    const users = await User.find({
      company: companyId,
      status: { $ne: 'Inactive' },
    })
      .select('name email role designation department profilePicture')
      .sort({ name: 1 })
      .lean();

    // Calculate active workload stats for each user in this company
    const activeTasks = await Task.find({
      company: companyId,
      status: { $in: ['Pending', 'In Progress', 'Awaiting Approval'] },
    })
      .select('assignedTo estimatedTimeDuration status')
      .lean();

    const workloadMap = {};
    activeTasks.forEach((t) => {
      const uId = t.assignedTo?.toString();
      if (uId) {
        if (!workloadMap[uId]) {
          workloadMap[uId] = { activeTasksCount: 0, allocatedHours: 0 };
        }
        workloadMap[uId].activeTasksCount += 1;
        workloadMap[uId].allocatedHours += Number(t.estimatedTimeDuration) || 0;
      }
    });

    const membersWithWorkload = users.map((u) => {
      const w = workloadMap[u._id.toString()] || { activeTasksCount: 0, allocatedHours: 0 };
      return {
        ...u,
        activeTasksCount: w.activeTasksCount,
        allocatedHours: w.allocatedHours,
      };
    });

    res.json(membersWithWorkload);
  } catch (err) {
    console.error('Error fetching team members:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch team members' });
  }
};

// ===================== GET ALL SPRINTS =====================
exports.getSprints = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const { project, status } = req.query;
    const query = { company: companyId };

    if (project && project !== 'All') {
      query.project = project;
    }
    if (status && status !== 'All') {
      query.status = status;
    }

    const sprints = await Sprint.find(query)
      .populate('project', 'name status startDate endDate logo')
      .populate('members', 'name email role designation department')
      .populate('createdBy', 'name email role')
      .sort({ sprintNumber: 1, startDate: 1 });

    // Aggregate real-time task metrics for each sprint
    const sprintIds = sprints.map((s) => s._id);
    const tasks = await Task.find({ sprint: { $in: sprintIds } })
      .select('sprint status estimatedTimeDuration dueDate completedAt')
      .lean();

    const tasksBySprint = {};
    tasks.forEach((t) => {
      const sId = t.sprint?.toString();
      if (!tasksBySprint[sId]) {
        tasksBySprint[sId] = [];
      }
      tasksBySprint[sId].push(t);
    });

    const now = new Date();

    const sprintsWithMetrics = sprints.map((sprint) => {
      const sId = sprint._id.toString();
      const sprintTasks = tasksBySprint[sId] || [];
      const totalTasks = sprintTasks.length;
      const completedTasks = sprintTasks.filter((t) => t.status === 'Completed').length;
      const inProgressTasks = sprintTasks.filter((t) => t.status === 'In Progress').length;
      const pendingTasks = sprintTasks.filter(
        (t) => t.status === 'Pending' || t.status === 'Awaiting Approval'
      ).length;

      const totalEstimatedHours = sprintTasks.reduce(
        (sum, t) => sum + (Number(t.estimatedTimeDuration) || 0),
        0
      );
      const completedHours = sprintTasks
        .filter((t) => t.status === 'Completed')
        .reduce((sum, t) => sum + (Number(t.estimatedTimeDuration) || 0), 0);

      const progressPercentage =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Day calculations
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.endDate);
      const diffTime = Math.abs(end - start);
      const totalDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      let daysElapsed = 0;
      let daysRemaining = totalDays;
      if (now > start) {
        daysElapsed = Math.min(totalDays, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
        daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
      }

      const isOverdue = now > end && sprint.status !== 'Completed';

      return {
        ...sprint.toObject(),
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        totalEstimatedHours,
        completedHours,
        progressPercentage,
        totalDays,
        daysElapsed,
        daysRemaining,
        isOverdue,
      };
    });

    res.json(sprintsWithMetrics);
  } catch (err) {
    console.error('Error fetching sprints:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch sprints' });
  }
};

// ===================== GET SINGLE SPRINT =====================
exports.getSprintById = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const sprint = await Sprint.findOne({ _id: req.params.id, company: companyId })
      .populate('project', 'name status startDate endDate logo description')
      .populate('members', 'name email role designation department')
      .populate('createdBy', 'name email role');

    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    // Fetch tasks belonging to this sprint
    const tasks = await Task.find({ sprint: sprint._id })
      .populate('assignedTo', 'name email role designation department')
      .populate('assignedBy', 'name email role')
      .sort({ scheduledDate: 1, sprintDay: 1, dueDate: 1, createdAt: 1 });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
    const pendingTasks = tasks.filter(
      (t) => t.status === 'Pending' || t.status === 'Awaiting Approval'
    ).length;

    const totalEstimatedHours = tasks.reduce(
      (sum, t) => sum + (Number(t.estimatedTimeDuration) || 0),
      0
    );
    const completedHours = tasks
      .filter((t) => t.status === 'Completed')
      .reduce((sum, t) => sum + (Number(t.estimatedTimeDuration) || 0), 0);

    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Member workload breakdown within this sprint
    const membersMap = {};
    (sprint.members || []).forEach((m) => {
      membersMap[m._id.toString()] = {
        member: m,
        tasksCount: 0,
        completedCount: 0,
        inProgressCount: 0,
        totalHours: 0,
        completedHours: 0,
      };
    });

    tasks.forEach((t) => {
      const u = t.assignedTo;
      if (u) {
        const uId = u._id?.toString() || u.toString();
        if (!membersMap[uId]) {
          membersMap[uId] = {
            member: u,
            tasksCount: 0,
            completedCount: 0,
            inProgressCount: 0,
            totalHours: 0,
            completedHours: 0,
          };
        }
        membersMap[uId].tasksCount += 1;
        if (t.status === 'Completed') {
          membersMap[uId].completedCount += 1;
          membersMap[uId].completedHours += Number(t.estimatedTimeDuration) || 0;
        } else if (t.status === 'In Progress') {
          membersMap[uId].inProgressCount += 1;
        }
        membersMap[uId].totalHours += Number(t.estimatedTimeDuration) || 0;
      }
    });

    const membersWorkload = Object.values(membersMap).map((item) => ({
      ...item,
      progress:
        item.tasksCount > 0 ? Math.round((item.completedCount / item.tasksCount) * 100) : 0,
    }));

    res.json({
      sprint,
      tasks,
      membersWorkload,
      metrics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        totalEstimatedHours,
        completedHours,
        progressPercentage,
      },
    });
  } catch (err) {
    console.error('Error fetching sprint by ID:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch sprint details' });
  }
};

// ===================== CREATE SPRINT =====================
exports.createSprint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const {
      project,
      name,
      goal,
      startDate,
      endDate,
      status = 'Planned',
      targetHours,
      notes,
      members = [],
    } = req.body;

    if (!project || !name || !startDate || !endDate) {
      return res.status(400).json({
        message: 'Project, sprint name, start date, and end date are required',
      });
    }

    // Verify project belongs to this company
    const projectDoc = await Project.findOne({ _id: project, company: companyId });
    if (!projectDoc) {
      return res.status(404).json({ message: 'Project not found in this company workspace' });
    }

    // Calculate sprint number for this project
    const existingCount = await Sprint.countDocuments({ company: companyId, project });
    const sprintNumber = existingCount + 1;

    // Calculate duration in days
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return res.status(400).json({ message: 'Sprint end date cannot be earlier than start date' });
    }
    const diffTime = Math.abs(end - start);
    const totalDurationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const sprint = await Sprint.create({
      company: companyId,
      project,
      name: name.trim(),
      sprintNumber,
      goal: goal?.trim() || '',
      startDate: start,
      endDate: end,
      status,
      totalDurationDays,
      targetHours: Number(targetHours) || 0,
      notes: notes?.trim() || '',
      members: Array.isArray(members) ? members.filter(Boolean) : [],
      createdBy: req.user._id,
    });

    const populatedSprint = await Sprint.findById(sprint._id)
      .populate('project', 'name status startDate endDate logo')
      .populate('members', 'name email role designation department')
      .populate('createdBy', 'name email role');

    logAudit({
      user: req.user,
      action: 'SPRINT_CREATED',
      category: 'WORK',
      status: 'SUCCESS',
      details: {
        sprintId: sprint._id,
        name: sprint.name,
        project: projectDoc.name,
        durationDays: totalDurationDays,
      },
      req,
    });

    res.status(201).json(populatedSprint);
  } catch (err) {
    console.error('Error creating sprint:', err);
    res.status(500).json({ message: err.message || 'Failed to create sprint' });
  }
};

// ===================== UPDATE SPRINT =====================
exports.updateSprint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const sprint = await Sprint.findOne({ _id: req.params.id, company: companyId });
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const { name, goal, startDate, endDate, status, targetHours, notes, members } = req.body;

    if (name) sprint.name = name.trim();
    if (goal !== undefined) sprint.goal = goal.trim();
    if (notes !== undefined) sprint.notes = notes.trim();
    if (targetHours !== undefined) sprint.targetHours = Number(targetHours) || 0;
    if (Array.isArray(members)) {
      sprint.members = members.filter(Boolean);
    }

    if (startDate) sprint.startDate = new Date(startDate);
    if (endDate) sprint.endDate = new Date(endDate);

    if (sprint.endDate < sprint.startDate) {
      return res.status(400).json({ message: 'Sprint end date cannot be earlier than start date' });
    }

    const diffTime = Math.abs(new Date(sprint.endDate) - new Date(sprint.startDate));
    sprint.totalDurationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (status && status !== sprint.status) {
      sprint.status = status;
      if (status === 'Completed') {
        sprint.completedAt = new Date();
      }
    }

    await sprint.save();

    const updated = await Sprint.findById(sprint._id)
      .populate('project', 'name status startDate endDate logo')
      .populate('members', 'name email role designation department')
      .populate('createdBy', 'name email role');

    logAudit({
      user: req.user,
      action: 'SPRINT_UPDATED',
      category: 'WORK',
      status: 'SUCCESS',
      details: { sprintId: sprint._id, name: sprint.name, status: sprint.status },
      req,
    });

    res.json(updated);
  } catch (err) {
    console.error('Error updating sprint:', err);
    res.status(500).json({ message: err.message || 'Failed to update sprint' });
  }
};

// ===================== DELETE SPRINT =====================
exports.deleteSprint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const sprint = await Sprint.findOne({ _id: req.params.id, company: companyId });
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    // Unlink tasks assigned to this sprint instead of deleting them
    await Task.updateMany(
      { sprint: sprint._id },
      { $set: { sprint: null, sprintDay: null, scheduledDate: null } }
    );

    await sprint.deleteOne();

    logAudit({
      user: req.user,
      action: 'SPRINT_DELETED',
      category: 'WORK',
      status: 'SUCCESS',
      details: { sprintId: sprint._id, name: sprint.name },
      req,
    });

    res.json({ success: true, message: 'Sprint removed and tasks safely unassigned' });
  } catch (err) {
    console.error('Error deleting sprint:', err);
    res.status(500).json({ message: err.message || 'Failed to delete sprint' });
  }
};

// ===================== ASSIGN TASKS TO SPRINT =====================
exports.assignTasksToSprint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { taskIds, sprintId, scheduledDate, sprintDay } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: 'taskIds array is required' });
    }

    const sprint = await Sprint.findOne({ _id: sprintId, company: companyId });
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const updatePayload = {
      sprint: sprint._id,
      project: sprint.project, // ensure task project matches sprint project
    };
    if (scheduledDate) updatePayload.scheduledDate = new Date(scheduledDate);
    if (sprintDay !== undefined && sprintDay !== null) updatePayload.sprintDay = Number(sprintDay);

    await Task.updateMany(
      { _id: { $in: taskIds }, company: companyId },
      { $set: updatePayload }
    );

    res.json({
      success: true,
      message: `${taskIds.length} task(s) assigned to ${sprint.name}`,
    });
  } catch (err) {
    console.error('Error assigning tasks to sprint:', err);
    res.status(500).json({ message: err.message || 'Failed to assign tasks to sprint' });
  }
};

// ===================== BATCH DIVIDE TASKS ACROSS USERS IN SPRINT =====================
exports.batchDivideTasks = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sprintId } = req.params;
    const { tasks: tasksToCreate } = req.body;

    if (!Array.isArray(tasksToCreate) || tasksToCreate.length === 0) {
      return res.status(400).json({ message: 'tasks array is required' });
    }

    const sprint = await Sprint.findOne({ _id: sprintId, company: companyId });
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const createdTasks = [];
    const newMembersSet = new Set((sprint.members || []).map((m) => m.toString()));

    for (const t of tasksToCreate) {
      if (!t.title || !t.assignedTo) continue;

      const startDate = t.startDate ? new Date(t.startDate) : new Date(sprint.startDate);
      const dueDate = t.dueDate ? new Date(t.dueDate) : new Date(sprint.endDate);
      const scheduledDate = t.scheduledDate ? new Date(t.scheduledDate) : startDate;

      const taskDoc = await Task.create({
        title: t.title.trim(),
        description: t.description?.trim() || t.title.trim() || 'Sprint Task',
        company: companyId,
        project: sprint.project,
        sprint: sprint._id,
        assignedTo: t.assignedTo,
        assignedBy: req.user._id,
        startDate,
        dueDate,
        scheduledDate,
        sprintDay: t.sprintDay ? Number(t.sprintDay) : null,
        estimatedTimeDuration: Number(t.estimatedTimeDuration) || 0,
        priority: t.priority || 'Normal',
        status: t.status || 'Pending',
        history: [
          {
            action: `Task divided & created in Sprint: ${sprint.name}`,
            user: req.user._id,
          },
        ],
      });

      newMembersSet.add(t.assignedTo.toString());
      createdTasks.push(taskDoc);

      // Notify assignee asynchronously
      User.findById(t.assignedTo).then((assignedUser) => {
        if (assignedUser) {
          sendTaskAssignmentEmail(taskDoc, assignedUser, req.user).catch(() => {});
          sendNotificationToUser(assignedUser, {
            title: `Sprint Task Assigned: ${sprint.name}`,
            body: `${req.user.name} assigned you: ${taskDoc.title}`,
            url: '/admin/sprints',
          }).catch(() => {});
          Notification.create({
            user: t.assignedTo,
            title: 'Sprint Task Assigned',
            message: `You were assigned "${taskDoc.title}" in sprint "${sprint.name}"`,
            link: '/admin/sprints',
          }).catch(() => {});
        }
      });
    }

    // Update sprint members list with any newly assigned users
    sprint.members = Array.from(newMembersSet);
    await sprint.save();

    res.status(201).json({
      success: true,
      message: `${createdTasks.length} tasks divided and assigned successfully!`,
      tasks: createdTasks,
    });
  } catch (err) {
    console.error('Error dividing sprint tasks:', err);
    res.status(500).json({ message: err.message || 'Failed to divide tasks' });
  }
};

// ===================== CREATE TASK DIRECTLY IN SPRINT =====================
exports.createSprintTask = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sprintId } = req.params;

    const sprint = await Sprint.findOne({ _id: sprintId, company: companyId });
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const {
      title,
      description = '',
      assignedTo,
      startDate,
      dueDate,
      estimatedTimeDuration,
      priority = 'Normal',
      status = 'Pending',
      scheduledDate,
      sprintDay,
    } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({ message: 'Task title and assigned user are required' });
    }

    const taskStartDate = startDate ? new Date(startDate) : new Date(sprint.startDate);
    const taskDueDate = dueDate ? new Date(dueDate) : new Date(sprint.endDate);

    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || title.trim() || 'Sprint Task',
      company: companyId,
      project: sprint.project,
      sprint: sprint._id,
      assignedTo,
      assignedBy: req.user._id,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      estimatedTimeDuration: Number(estimatedTimeDuration) || 0,
      priority,
      status,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      sprintDay: sprintDay !== undefined && sprintDay !== null ? Number(sprintDay) : null,
      history: [
        {
          action: `Task created in Sprint: ${sprint.name}`,
          user: req.user._id,
        },
      ],
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email role designation department')
      .populate('assignedBy', 'name email role');

    // Notify user
    const assignedUser = await User.findById(assignedTo);
    if (assignedUser) {
      sendTaskAssignmentEmail(task, assignedUser, req.user).catch((err) =>
        console.error('Email error:', err)
      );
      sendNotificationToUser(assignedUser, {
        title: `Sprint Task Assigned: ${sprint.name}`,
        body: `${req.user.name} assigned you a task in ${sprint.name}: ${task.title}`,
        url: '/admin/sprints',
      }).catch((err) => console.error('Push error:', err));

      await Notification.create({
        user: assignedTo,
        title: 'New Sprint Task Assigned',
        message: `You were assigned "${task.title}" in sprint "${sprint.name}"`,
        link: '/admin/sprints',
      });
    }

    res.status(201).json(populatedTask);
  } catch (err) {
    console.error('Error creating sprint task:', err);
    res.status(500).json({ message: err.message || 'Failed to create sprint task' });
  }
};

// ===================== UPDATE TASK SCHEDULE / DAILY STATUS =====================
exports.updateTaskSchedule = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { taskId } = req.params;
    const { scheduledDate, sprintDay, dueDate, status, estimatedTimeDuration, priority } = req.body;

    const task = await Task.findOne({ _id: taskId, company: companyId });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (scheduledDate !== undefined) task.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (sprintDay !== undefined) task.sprintDay = sprintDay !== null ? Number(sprintDay) : null;
    if (dueDate) task.dueDate = new Date(dueDate);
    if (estimatedTimeDuration !== undefined) task.estimatedTimeDuration = Number(estimatedTimeDuration) || 0;
    if (priority) task.priority = priority;

    if (status && status !== task.status) {
      task.status = status;
      if (status === 'Completed') {
        task.completedAt = new Date();
      }
      task.history.push({
        action: `Status updated to ${status}`,
        user: req.user._id,
      });
    }

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email role designation department')
      .populate('assignedBy', 'name email role');

    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task schedule:', err);
    res.status(500).json({ message: err.message || 'Failed to update task schedule' });
  }
};

// ===================== OVERALL PROJECT TIMELINE & DURATION ANALYTICS =====================
// "pura project ka complete time duration niklega ... proper timeline nikalte aana chahiye"
exports.getProjectTimelineAndStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { projectId } = req.params;

    const project = await Project.findOne({ _id: projectId, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Fetch all sprints for this project
    const sprints = await Sprint.find({ project: project._id, company: companyId }).sort({
      startDate: 1,
      sprintNumber: 1,
    });

    // Fetch all tasks for this project
    const tasks = await Task.find({ project: project._id, company: companyId })
      .populate('assignedTo', 'name email designation')
      .sort({ startDate: 1, dueDate: 1 });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
    const pendingTasks = tasks.filter(
      (t) => t.status === 'Pending' || t.status === 'Awaiting Approval'
    ).length;

    const totalEstimatedHours = tasks.reduce(
      (sum, t) => sum + (Number(t.estimatedTimeDuration) || 0),
      0
    );
    const completedHours = tasks
      .filter((t) => t.status === 'Completed')
      .reduce((sum, t) => sum + (Number(t.estimatedTimeDuration) || 0), 0);
    const remainingHours = Math.max(0, totalEstimatedHours - completedHours);

    // Compute Overall Project Duration across Sprints & Project boundaries
    let projectStartDate = project.startDate ? new Date(project.startDate) : null;
    let projectEndDate = project.endDate ? new Date(project.endDate) : null;

    if (sprints.length > 0) {
      const earliestSprintStart = new Date(
        Math.min(...sprints.map((s) => new Date(s.startDate).getTime()))
      );
      const latestSprintEnd = new Date(
        Math.max(...sprints.map((s) => new Date(s.endDate).getTime()))
      );

      if (!projectStartDate || earliestSprintStart < projectStartDate) {
        projectStartDate = earliestSprintStart;
      }
      if (!projectEndDate || latestSprintEnd > projectEndDate) {
        projectEndDate = latestSprintEnd;
      }
    }

    const now = new Date();
    let totalProjectDurationDays = 0;
    let daysElapsed = 0;
    let daysRemaining = 0;

    if (projectStartDate && projectEndDate) {
      const diffTime = Math.abs(projectEndDate - projectStartDate);
      totalProjectDurationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (now > projectStartDate) {
        daysElapsed = Math.min(
          totalProjectDurationDays,
          Math.ceil((now - projectStartDate) / (1000 * 60 * 60 * 24))
        );
        daysRemaining = Math.max(
          0,
          Math.ceil((projectEndDate - now) / (1000 * 60 * 60 * 24))
        );
      } else {
        daysRemaining = totalProjectDurationDays;
      }
    }

    const overallProgressPercent =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const timeElapsedPercent =
      totalProjectDurationDays > 0
        ? Math.round((daysElapsed / totalProjectDurationDays) * 100)
        : 0;

    // Project Health Status determination
    let healthStatus = 'On Track';
    if (overallProgressPercent === 100) {
      healthStatus = 'Completed';
    } else if (timeElapsedPercent > overallProgressPercent + 15) {
      healthStatus = 'At Risk (Behind Schedule)';
    } else if (overallProgressPercent > timeElapsedPercent + 10) {
      healthStatus = 'Ahead of Schedule';
    } else {
      healthStatus = 'On Track';
    }

    // Velocity & Forecasting
    const completedSprintsCount = sprints.filter((s) => s.status === 'Completed').length;
    const activeSprintsCount = sprints.filter((s) => s.status === 'Active').length;
    const plannedSprintsCount = sprints.filter((s) => s.status === 'Planned').length;

    // Build visual Gantt / Timeline Items for each Sprint
    const timelineItems = sprints.map((s) => {
      const sTasks = tasks.filter((t) => t.sprint?.toString() === s._id.toString());
      const sCompleted = sTasks.filter((t) => t.status === 'Completed').length;
      const sProgress = sTasks.length > 0 ? Math.round((sCompleted / sTasks.length) * 100) : 0;
      const sEstHours = sTasks.reduce(
        (sum, t) => sum + (Number(t.estimatedTimeDuration) || 0),
        0
      );

      return {
        id: s._id,
        name: s.name,
        sprintNumber: s.sprintNumber,
        goal: s.goal,
        startDate: s.startDate,
        endDate: s.endDate,
        durationDays: s.totalDurationDays,
        status: s.status,
        progress: sProgress,
        tasksCount: sTasks.length,
        completedCount: sCompleted,
        estimatedHours: sEstHours,
        tasks: sTasks.map((t) => ({
          id: t._id,
          title: t.title,
          assignedTo: t.assignedTo?.name || 'Unassigned',
          priority: t.priority,
          status: t.status,
          startDate: t.startDate,
          dueDate: t.dueDate,
          scheduledDate: t.scheduledDate,
          estimatedHours: t.estimatedTimeDuration || 0,
        })),
      };
    });

    res.json({
      project: {
        id: project._id,
        name: project.name,
        status: project.status,
        description: project.description,
      },
      durationMetrics: {
        projectStartDate,
        projectEndDate,
        totalProjectDurationDays,
        daysElapsed,
        daysRemaining,
        timeElapsedPercent,
        overallProgressPercent,
        healthStatus,
      },
      taskMetrics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        totalEstimatedHours,
        completedHours,
        remainingHours,
      },
      sprintMetrics: {
        totalSprints: sprints.length,
        completedSprintsCount,
        activeSprintsCount,
        plannedSprintsCount,
      },
      timelineItems,
    });
  } catch (err) {
    console.error('Error fetching project timeline and stats:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch timeline analytics' });
  }
};

// ===================== GET DAILY TASKS SCHEDULE =====================
exports.getDailySchedule = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sprintId } = req.params;
    const { date } = req.query;

    const sprint = await Sprint.findOne({ _id: sprintId, company: companyId }).populate(
      'project',
      'name status'
    );
    if (!sprint) {
      return res.status(404).json({ message: 'Sprint not found' });
    }

    const tasks = await Task.find({ sprint: sprint._id, company: companyId })
      .populate('assignedTo', 'name email role designation')
      .populate('assignedBy', 'name email')
      .sort({ scheduledDate: 1, dueDate: 1, createdAt: 1 });

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Group tasks by scheduled date or sprint day
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const totalDays = Math.max(1, Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)));

    const dayByDay = [];
    for (let i = 0; i < totalDays; i++) {
      const curDate = new Date(start);
      curDate.setDate(curDate.getDate() + i);
      const curDateStr = curDate.toISOString().split('T')[0];

      const dayTasks = tasks.filter((t) => {
        if (t.scheduledDate) {
          return new Date(t.scheduledDate).toISOString().split('T')[0] === curDateStr;
        }
        if (t.sprintDay !== null && t.sprintDay !== undefined) {
          return t.sprintDay === i + 1;
        }
        if (t.dueDate) {
          return new Date(t.dueDate).toISOString().split('T')[0] === curDateStr;
        }
        return false;
      });

      const dayHours = dayTasks.reduce(
        (sum, t) => sum + (Number(t.estimatedTimeDuration) || 0),
        0
      );

      dayByDay.push({
        dayNumber: i + 1,
        date: curDate,
        dateString: curDateStr,
        tasks: dayTasks,
        totalTasks: dayTasks.length,
        completedTasks: dayTasks.filter((t) => t.status === 'Completed').length,
        totalHours: dayHours,
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter((t) => {
      const sched = t.scheduledDate ? new Date(t.scheduledDate).toISOString().split('T')[0] : null;
      const due = t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : null;
      return sched === todayStr || due === todayStr;
    });

    const unassignedToDayTasks = tasks.filter(
      (t) => !t.scheduledDate && (t.sprintDay === null || t.sprintDay === undefined)
    );

    res.json({
      sprint: {
        id: sprint._id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
      },
      dayByDay,
      todayTasks,
      unassignedToDayTasks,
    });
  } catch (err) {
    console.error('Error fetching daily schedule:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch daily schedule' });
  }
};

