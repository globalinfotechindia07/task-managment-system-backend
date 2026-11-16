const Holiday = require('../models/Holiday');
const LeavePolicy = require('../models/LeavePolicy');
const UserLeaveBalance = require('../models/UserLeaveBalance');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { sendRealTimeNotification } = require('../utils/socketService');
const { logAudit } = require('../utils/auditLogger');

// Helper to get company ID from authenticated user
const getUserCompanyId = (user) => {
  if (!user) return null;
  return user.company?._id || user.company;
};

// Helper to get or create company leave policy defaults
const getOrCreateCompanyPolicy = async (companyId) => {
  let policy = await LeavePolicy.findOne({ company: companyId });
  if (!policy) {
    policy = new LeavePolicy({
      company: companyId,
      defaultPaidLeave: 15,
      defaultSickLeave: 10,
      defaultCasualLeave: 8,
      maxCarryForward: 10,
      allowHalfDay: true,
      carryForwardAllowed: true,
    });
    await policy.save();
  }
  return policy;
};

// Helper to get or create an employee's annual leave balance record
const getOrCreateEmployeeBalance = async (companyId, userId, year = new Date().getFullYear()) => {
  let balance = await UserLeaveBalance.findOne({ company: companyId, user: userId, year });
  if (!balance) {
    const policy = await getOrCreateCompanyPolicy(companyId);
    balance = new UserLeaveBalance({
      company: companyId,
      user: userId,
      year,
      paidLeave: { total: policy.defaultPaidLeave, used: 0 },
      sickLeave: { total: policy.defaultSickLeave, used: 0 },
      casualLeave: { total: policy.defaultCasualLeave, used: 0 },
      carryForward: { fromPreviousYear: 0, used: 0 },
      unpaidLeaveUsed: 0,
    });
    await balance.save();
  }
  return balance;
};

// ============================================================
// 1. HOLIDAYS MANAGEMENT
// ============================================================

// @desc    Get all holidays for company
// @route   GET /api/leaves/holidays
// @access  Private (All authenticated users)
const getHolidays = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { year } = req.query;

    const query = { company: companyId };
    if (year && year !== 'ALL') {
      query.year = Number(year);
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });
    res.json({ success: true, count: holidays.length, holidays });
  } catch (error) {
    console.error('Error in getHolidays:', error);
    res.status(500).json({ message: 'Failed to fetch holidays', error: error.message });
  }
};

// @desc    Create a new holiday
// @route   POST /api/leaves/holidays
// @access  Private (Admin / HR)
const createHoliday = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { title, date, type = 'Festival', description = '', isOptional = false } = req.body;

    if (!title || !date) {
      return res.status(400).json({ message: 'Holiday title and date are required' });
    }

    const holidayDate = new Date(date);
    const year = holidayDate.getFullYear();

    const holiday = new Holiday({
      company: companyId,
      title: title.trim(),
      date: holidayDate,
      year,
      type,
      description: description.trim(),
      isOptional: Boolean(isOptional),
      createdBy: req.user._id,
      createdByName: req.user.name,
    });

    await holiday.save();

    logAudit({
      req,
      action: 'HOLIDAY_CREATED',
      category: 'COMPANY',
      status: 'SUCCESS',
      details: { title, date: holidayDate },
    });

    res.status(201).json({
      success: true,
      message: `Holiday "${title}" added successfully.`,
      holiday,
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({ message: 'Failed to create holiday', error: error.message });
  }
};

// @desc    Update an existing holiday
// @route   PUT /api/leaves/holidays/:id
// @access  Private (Admin / HR)
const updateHoliday = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { title, date, type, description, isOptional } = req.body;

    const holiday = await Holiday.findOne({ _id: req.params.id, company: companyId });
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    if (title) holiday.title = title.trim();
    if (date) {
      holiday.date = new Date(date);
      holiday.year = holiday.date.getFullYear();
    }
    if (type) holiday.type = type;
    if (description !== undefined) holiday.description = description.trim();
    if (isOptional !== undefined) holiday.isOptional = Boolean(isOptional);

    await holiday.save();

    res.json({ success: true, message: 'Holiday updated successfully.', holiday });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({ message: 'Failed to update holiday', error: error.message });
  }
};

// @desc    Delete a holiday
// @route   DELETE /api/leaves/holidays/:id
// @access  Private (Admin / HR)
const deleteHoliday = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const holiday = await Holiday.findOneAndDelete({ _id: req.params.id, company: companyId });
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    res.json({ success: true, message: `Holiday "${holiday.title}" removed successfully.` });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ message: 'Failed to delete holiday', error: error.message });
  }
};

// ============================================================
// 2. LEAVE POLICY & EMPLOYEE BALANCE MANAGEMENT (ADMIN / HR)
// ============================================================

// @desc    Get company leave policy
// @route   GET /api/leaves/policy
// @access  Private
const getCompanyPolicy = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const policy = await getOrCreateCompanyPolicy(companyId);
    res.json({ success: true, policy });
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({ message: 'Failed to fetch policy', error: error.message });
  }
};

// @desc    Update company leave policy
// @route   PUT /api/leaves/policy
// @access  Private (Admin / HR)
const updateCompanyPolicy = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      defaultPaidLeave,
      defaultSickLeave,
      defaultCasualLeave,
      maxCarryForward,
      allowHalfDay,
      carryForwardAllowed,
    } = req.body;

    const policy = await getOrCreateCompanyPolicy(companyId);

    if (defaultPaidLeave !== undefined) policy.defaultPaidLeave = Number(defaultPaidLeave) || 0;
    if (defaultSickLeave !== undefined) policy.defaultSickLeave = Number(defaultSickLeave) || 0;
    if (defaultCasualLeave !== undefined) policy.defaultCasualLeave = Number(defaultCasualLeave) || 0;
    if (maxCarryForward !== undefined) policy.maxCarryForward = Number(maxCarryForward) || 0;
    if (allowHalfDay !== undefined) policy.allowHalfDay = Boolean(allowHalfDay);
    if (carryForwardAllowed !== undefined) policy.carryForwardAllowed = Boolean(carryForwardAllowed);

    policy.updatedBy = req.user._id;
    await policy.save();

    res.json({ success: true, message: 'Leave policy updated successfully.', policy });
  } catch (error) {
    console.error('Error updating leave policy:', error);
    res.status(500).json({ message: 'Failed to update policy', error: error.message });
  }
};

// @desc    Get all employees' leave balances
// @route   GET /api/leaves/balances
// @access  Private (Admin / HR / Team Lead)
const getAllEmployeeBalances = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const year = Number(req.query.year) || new Date().getFullYear();

    // Fetch active users in company (excluding Super Admin and external Client)
    const users = await User.find({
      company: companyId,
      role: { $nin: ['Super Admin', 'Client'] },
      status: 'Active',
    })
      .select('name email phone department designation profilePicture role')
      .sort({ name: 1 });

    // Ensure each employee has balance initialized for this year
    const balances = await Promise.all(
      users.map(async (u) => {
        const bal = await getOrCreateEmployeeBalance(companyId, u._id, year);
        const plRemaining = Math.max(0, (bal.paidLeave?.total || 0) - (bal.paidLeave?.used || 0));
        const slRemaining = Math.max(0, (bal.sickLeave?.total || 0) - (bal.sickLeave?.used || 0));
        const clRemaining = Math.max(0, (bal.casualLeave?.total || 0) - (bal.casualLeave?.used || 0));
        const cfRemaining = Math.max(
          0,
          (bal.carryForward?.fromPreviousYear || 0) - (bal.carryForward?.used || 0)
        );

        return {
          _id: bal._id,
          user: u,
          year,
          paidLeave: {
            total: bal.paidLeave?.total || 0,
            used: bal.paidLeave?.used || 0,
            remaining: plRemaining,
          },
          sickLeave: {
            total: bal.sickLeave?.total || 0,
            used: bal.sickLeave?.used || 0,
            remaining: slRemaining,
          },
          casualLeave: {
            total: bal.casualLeave?.total || 0,
            used: bal.casualLeave?.used || 0,
            remaining: clRemaining,
          },
          carryForward: {
            fromPreviousYear: bal.carryForward?.fromPreviousYear || 0,
            used: bal.carryForward?.used || 0,
            remaining: cfRemaining,
          },
          unpaidLeaveUsed: bal.unpaidLeaveUsed || 0,
          totalAvailableLeaves: plRemaining + slRemaining + clRemaining + cfRemaining,
          totalLeavesAllocated:
            (bal.paidLeave?.total || 0) +
            (bal.sickLeave?.total || 0) +
            (bal.casualLeave?.total || 0) +
            (bal.carryForward?.fromPreviousYear || 0),
          totalLeavesConsumed:
            (bal.paidLeave?.used || 0) +
            (bal.sickLeave?.used || 0) +
            (bal.casualLeave?.used || 0) +
            (bal.carryForward?.used || 0),
          notes: bal.notes || '',
        };
      })
    );

    res.json({ success: true, count: balances.length, year, balances });
  } catch (error) {
    console.error('Error fetching employee balances:', error);
    res.status(500).json({ message: 'Failed to fetch balances', error: error.message });
  }
};

// @desc    Assign or adjust an employee's leave balance
// @route   PUT /api/leaves/balances/:userId
// @access  Private (Admin / HR)
const updateEmployeeLeaveBalance = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { userId } = req.params;
    const year = Number(req.body.year) || new Date().getFullYear();
    const {
      paidLeaveTotal,
      paidLeaveUsed,
      sickLeaveTotal,
      sickLeaveUsed,
      casualLeaveTotal,
      casualLeaveUsed,
      carryForwardTotal,
      carryForwardUsed,
      notes,
    } = req.body;

    const balance = await getOrCreateEmployeeBalance(companyId, userId, year);

    if (paidLeaveTotal !== undefined) balance.paidLeave.total = Number(paidLeaveTotal);
    if (paidLeaveUsed !== undefined) balance.paidLeave.used = Number(paidLeaveUsed);

    if (sickLeaveTotal !== undefined) balance.sickLeave.total = Number(sickLeaveTotal);
    if (sickLeaveUsed !== undefined) balance.sickLeave.used = Number(sickLeaveUsed);

    if (casualLeaveTotal !== undefined) balance.casualLeave.total = Number(casualLeaveTotal);
    if (casualLeaveUsed !== undefined) balance.casualLeave.used = Number(casualLeaveUsed);

    if (carryForwardTotal !== undefined)
      balance.carryForward.fromPreviousYear = Number(carryForwardTotal);
    if (carryForwardUsed !== undefined) balance.carryForward.used = Number(carryForwardUsed);

    if (notes !== undefined) balance.notes = notes;

    await balance.save();

    res.json({
      success: true,
      message: 'Leave quota updated successfully.',
      balance,
    });
  } catch (error) {
    console.error('Error updating employee balance:', error);
    res.status(500).json({ message: 'Failed to update balance', error: error.message });
  }
};

// @desc    Bulk Carry-Forward rollover for new year
// @route   POST /api/leaves/carry-forward/rollover
// @access  Private (Admin / HR)
const rolloverCarryForward = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const fromYear = Number(req.body.fromYear) || new Date().getFullYear() - 1;
    const toYear = Number(req.body.toYear) || new Date().getFullYear();

    const policy = await getOrCreateCompanyPolicy(companyId);
    if (!policy.carryForwardAllowed) {
      return res.status(400).json({ message: 'Carry forward is disabled in company leave policy' });
    }

    const previousBalances = await UserLeaveBalance.find({ company: companyId, year: fromYear });

    let rolloverCount = 0;
    for (const pb of previousBalances) {
      const plUnused = Math.max(0, (pb.paidLeave?.total || 0) - (pb.paidLeave?.used || 0));
      const clUnused = Math.max(0, (pb.casualLeave?.total || 0) - (pb.casualLeave?.used || 0));
      const totalUnused = plUnused + clUnused;

      // Cap by company policy maxCarryForward
      const carryOverAmount = Math.min(policy.maxCarryForward, totalUnused);

      if (carryOverAmount > 0) {
        const nextBal = await getOrCreateEmployeeBalance(companyId, pb.user, toYear);
        nextBal.carryForward.fromPreviousYear = carryOverAmount;
        nextBal.notes = `Carried forward ${carryOverAmount} day(s) from ${fromYear}`;
        await nextBal.save();
        rolloverCount += 1;
      }
    }

    res.json({
      success: true,
      message: `Successfully rolled over carry-forward leaves for ${rolloverCount} employee(s) from ${fromYear} to ${toYear}.`,
      rolloverCount,
    });
  } catch (error) {
    console.error('Error rolling over carry forward:', error);
    res.status(500).json({ message: 'Failed to rollover carry forward', error: error.message });
  }
};

// ============================================================
// 3. EMPLOYEE LEAVE OPERATIONS (MY LEAVES)
// ============================================================

// @desc    Get current user's leave balance
// @route   GET /api/leaves/my-balance
// @access  Private (All authenticated employees)
const getMyLeaveBalance = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const year = Number(req.query.year) || new Date().getFullYear();

    const bal = await getOrCreateEmployeeBalance(companyId, req.user._id, year);
    const policy = await getOrCreateCompanyPolicy(companyId);

    const plRemaining = Math.max(0, (bal.paidLeave?.total || 0) - (bal.paidLeave?.used || 0));
    const slRemaining = Math.max(0, (bal.sickLeave?.total || 0) - (bal.sickLeave?.used || 0));
    const clRemaining = Math.max(0, (bal.casualLeave?.total || 0) - (bal.casualLeave?.used || 0));
    const cfRemaining = Math.max(
      0,
      (bal.carryForward?.fromPreviousYear || 0) - (bal.carryForward?.used || 0)
    );

    res.json({
      success: true,
      year,
      policy: {
        allowHalfDay: policy.allowHalfDay,
        maxCarryForward: policy.maxCarryForward,
      },
      balance: {
        paidLeave: {
          total: bal.paidLeave?.total || 0,
          used: bal.paidLeave?.used || 0,
          remaining: plRemaining,
        },
        sickLeave: {
          total: bal.sickLeave?.total || 0,
          used: bal.sickLeave?.used || 0,
          remaining: slRemaining,
        },
        casualLeave: {
          total: bal.casualLeave?.total || 0,
          used: bal.casualLeave?.used || 0,
          remaining: clRemaining,
        },
        carryForward: {
          fromPreviousYear: bal.carryForward?.fromPreviousYear || 0,
          used: bal.carryForward?.used || 0,
          remaining: cfRemaining,
        },
        unpaidLeaveUsed: bal.unpaidLeaveUsed || 0,
        totalAvailable: plRemaining + slRemaining + clRemaining + cfRemaining,
      },
    });
  } catch (error) {
    console.error('Error fetching my leave balance:', error);
    res.status(500).json({ message: 'Failed to fetch balance', error: error.message });
  }
};

// @desc    Get current user's leave application history
// @route   GET /api/leaves/my-requests
// @access  Private
const getMyLeaveRequests = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const requests = await LeaveRequest.find({ company: companyId, user: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, count: requests.length, requests });
  } catch (error) {
    console.error('Error fetching my requests:', error);
    res.status(500).json({ message: 'Failed to fetch requests', error: error.message });
  }
};

// @desc    Employee applies for a leave (Full day, Half day 1st/2nd half, Range)
// @route   POST /api/leaves/apply
// @access  Private
const applyForLeave = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      leaveType = 'Paid Leave',
      isHalfDay = false,
      halfDayType = 'None',
      startDate,
      endDate,
      reason,
      attachment,
    } = req.body;

    if (!startDate || !reason || !reason.trim()) {
      return res.status(400).json({ message: 'Start date and reason for leave are required' });
    }

    const sDate = new Date(startDate);
    const eDate = isHalfDay ? new Date(startDate) : new Date(endDate || startDate);

    if (eDate < sDate) {
      return res.status(400).json({ message: 'End date cannot be prior to start date' });
    }

    let calculatedDays = 1;
    if (isHalfDay) {
      if (halfDayType !== 'First Half' && halfDayType !== 'Second Half') {
        return res.status(400).json({
          message: 'Please specify Half Day type as either "First Half" or "Second Half"',
        });
      }
      calculatedDays = 0.5;
    } else {
      const diffTime = Math.abs(eDate - sDate);
      calculatedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const year = sDate.getFullYear();
    const balance = await getOrCreateEmployeeBalance(companyId, req.user._id, year);

    // Validate balance for non-unpaid leaves
    if (leaveType === 'Paid Leave') {
      const remaining = (balance.paidLeave?.total || 0) - (balance.paidLeave?.used || 0);
      if (remaining < calculatedDays) {
        return res.status(400).json({
          message: `Insufficient Paid Leave balance. You have ${remaining} day(s) remaining but requested ${calculatedDays} day(s). You can apply for Unpaid Leave or Casual Leave instead.`,
        });
      }
    } else if (leaveType === 'Sick Leave') {
      const remaining = (balance.sickLeave?.total || 0) - (balance.sickLeave?.used || 0);
      if (remaining < calculatedDays) {
        return res.status(400).json({
          message: `Insufficient Sick Leave balance. You have ${remaining} day(s) remaining but requested ${calculatedDays} day(s).`,
        });
      }
    } else if (leaveType === 'Casual Leave') {
      const remaining = (balance.casualLeave?.total || 0) - (balance.casualLeave?.used || 0);
      if (remaining < calculatedDays) {
        return res.status(400).json({
          message: `Insufficient Casual Leave balance. You have ${remaining} day(s) remaining but requested ${calculatedDays} day(s).`,
        });
      }
    } else if (leaveType === 'Carry Forward Leave') {
      const remaining =
        (balance.carryForward?.fromPreviousYear || 0) - (balance.carryForward?.used || 0);
      if (remaining < calculatedDays) {
        return res.status(400).json({
          message: `Insufficient Carry Forward balance. You have ${remaining} day(s) remaining.`,
        });
      }
    }

    const newRequest = new LeaveRequest({
      company: companyId,
      user: req.user._id,
      leaveType,
      isHalfDay: Boolean(isHalfDay),
      halfDayType: isHalfDay ? halfDayType : 'None',
      startDate: sDate,
      endDate: eDate,
      totalDays: calculatedDays,
      reason: reason.trim(),
      attachment: attachment || '',
      status: 'Pending',
    });

    await newRequest.save();

    // Send notification to Admin / HR / Team Head
    const hrUsers = await User.find({
      company: companyId,
      role: { $in: ['Admin', 'HR Manager', 'Team Head'] },
    }).select('_id');

    hrUsers.forEach((hr) => {
      sendRealTimeNotification(hr._id, {
        title: `New Leave Request: ${req.user.name}`,
        message: `${req.user.name} applied for ${calculatedDays} day(s) ${leaveType} (${isHalfDay ? halfDayType : 'Full Day'}).`,
        type: 'leave',
        link: '/admin/leaves',
      });
    });

    res.status(201).json({
      success: true,
      message: `Leave application for ${calculatedDays} day(s) submitted successfully. Waiting for HR/Manager approval.`,
      request: newRequest,
    });
  } catch (error) {
    console.error('Error applying for leave:', error);
    res.status(500).json({ message: 'Failed to apply for leave', error: error.message });
  }
};

// @desc    Employee cancels their pending leave request
// @route   PUT /api/leaves/my-requests/:id/cancel
// @access  Private
const cancelMyLeaveRequest = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      company: companyId,
      user: req.user._id,
    });

    if (!request) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        message: `Cannot cancel a leave request that has already been ${request.status.toLowerCase()}.`,
      });
    }

    request.status = 'Cancelled';
    await request.save();

    res.json({ success: true, message: 'Leave request cancelled successfully.', request });
  } catch (error) {
    console.error('Error cancelling leave request:', error);
    res.status(500).json({ message: 'Failed to cancel request', error: error.message });
  }
};

// ============================================================
// 4. APPROVAL WORKFLOW (ADMIN, HR, TEAM HEAD)
// ============================================================

// @desc    Get all leave requests across company with filtering
// @route   GET /api/leaves/requests
// @access  Private (Admin / HR / Team Head)
const getAllLeaveRequests = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { status, leaveType, department, year } = req.query;

    const query = { company: companyId };
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (leaveType && leaveType !== 'ALL') {
      query.leaveType = leaveType;
    }

    const requests = await LeaveRequest.find(query)
      .populate('user', 'name email phone department designation profilePicture role')
      .populate('approvedBy', 'name role')
      .sort({ createdAt: -1 });

    // Filter by department in memory if provided
    let filtered = requests;
    if (department && department !== 'ALL') {
      filtered = requests.filter((r) => r.user?.department === department);
    }

    res.json({ success: true, count: filtered.length, requests: filtered });
  } catch (error) {
    console.error('Error fetching all leave requests:', error);
    res.status(500).json({ message: 'Failed to fetch leave requests', error: error.message });
  }
};

// @desc    Approve or Reject a leave request
// @route   PUT /api/leaves/requests/:id/action
// @access  Private (Admin / HR / Team Head)
const reviewLeaveRequest = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { action, rejectionReason = '' } = req.body;

    if (action !== 'Approved' && action !== 'Rejected') {
      return res.status(400).json({ message: 'Action must be either "Approved" or "Rejected"' });
    }

    const request = await LeaveRequest.findOne({ _id: req.params.id, company: companyId }).populate(
      'user',
      'name email'
    );

    if (!request) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        message: `This leave request is already ${request.status}. Cannot re-process.`,
      });
    }

    const year = new Date(request.startDate).getFullYear();
    const balance = await getOrCreateEmployeeBalance(companyId, request.user._id, year);

    if (action === 'Approved') {
      request.status = 'Approved';
      request.approvedBy = req.user._id;
      request.approvedByName = req.user.name;
      request.actionDate = new Date();

      // Deduct from balance
      const days = Number(request.totalDays) || 1;

      if (request.leaveType === 'Paid Leave') {
        balance.paidLeave.used = (balance.paidLeave.used || 0) + days;
        request.deductedCategory = 'paidLeave';
      } else if (request.leaveType === 'Sick Leave') {
        balance.sickLeave.used = (balance.sickLeave.used || 0) + days;
        request.deductedCategory = 'sickLeave';
      } else if (request.leaveType === 'Casual Leave') {
        balance.casualLeave.used = (balance.casualLeave.used || 0) + days;
        request.deductedCategory = 'casualLeave';
      } else if (request.leaveType === 'Carry Forward Leave') {
        balance.carryForward.used = (balance.carryForward.used || 0) + days;
        request.deductedCategory = 'carryForward';
      } else {
        balance.unpaidLeaveUsed = (balance.unpaidLeaveUsed || 0) + days;
        request.deductedCategory = 'unpaid';
      }

      await balance.save();
      await request.save();

      // Sync with Attendance record for the leave dates
      const curr = new Date(request.startDate);
      const end = new Date(request.endDate);

      while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];
        let attendanceRecord = await Attendance.findOne({
          user: request.user._id,
          company: companyId,
          date: dateStr,
        });

        if (!attendanceRecord) {
          attendanceRecord = new Attendance({
            user: request.user._id,
            company: companyId,
            date: dateStr,
            punchIn: curr,
            status: request.isHalfDay ? 'Half Day' : 'Absent',
          });
        } else {
          attendanceRecord.status = request.isHalfDay ? 'Half Day' : 'Absent';
        }
        await attendanceRecord.save();
        curr.setDate(curr.getDate() + 1);
      }

      // Real-time notification to user
      sendRealTimeNotification(request.user._id, {
        title: 'Leave Approved',
        message: `Your ${request.leaveType} (${request.totalDays} day(s)) from ${new Date(
          request.startDate
        ).toLocaleDateString()} has been Approved by ${req.user.name}.`,
        type: 'leave',
        link: '/my-leaves',
      });

      logAudit({
        req,
        action: 'LEAVE_APPROVED',
        category: 'ATTENDANCE',
        status: 'SUCCESS',
        details: { requestId: request._id, employee: request.user.name, days },
      });

      return res.json({
        success: true,
        message: `Leave request for ${request.user.name} approved and deducted from ${request.leaveType}.`,
        request,
        balance,
      });
    }

    if (action === 'Rejected') {
      request.status = 'Rejected';
      request.approvedBy = req.user._id;
      request.approvedByName = req.user.name;
      request.actionDate = new Date();
      request.rejectionReason = rejectionReason.trim() || 'Rejected by management';

      await request.save();

      // Real-time notification to user
      sendRealTimeNotification(request.user._id, {
        title: 'Leave Rejected',
        message: `Your leave request for ${new Date(
          request.startDate
        ).toLocaleDateString()} was Rejected. Reason: "${request.rejectionReason}".`,
        type: 'leave',
        link: '/my-leaves',
      });

      logAudit({
        req,
        action: 'LEAVE_REJECTED',
        category: 'ATTENDANCE',
        status: 'SUCCESS',
        details: { requestId: request._id, employee: request.user.name, reason: request.rejectionReason },
      });

      return res.json({
        success: true,
        message: `Leave request for ${request.user.name} has been rejected.`,
        request,
      });
    }
  } catch (error) {
    console.error('Error reviewing leave request:', error);
    res.status(500).json({ message: 'Failed to process leave request', error: error.message });
  }
};

module.exports = {
  // Holidays
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,

  // Policy & Balance Management
  getCompanyPolicy,
  updateCompanyPolicy,
  getAllEmployeeBalances,
  updateEmployeeLeaveBalance,
  rolloverCarryForward,

  // Employee Operations
  getMyLeaveBalance,
  getMyLeaveRequests,
  applyForLeave,
  cancelMyLeaveRequest,

  // Approval Workflow
  getAllLeaveRequests,
  reviewLeaveRequest,
};

