const AttendancePolicy = require('../models/AttendancePolicy');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
};

exports.getPolicy = async (req, res) => {
  try {
    const filter = req.companyId ? { company: req.companyId } : {};
    let policy = await AttendancePolicy.findOne(filter);
    if (!policy) {
      policy = await AttendancePolicy.create({ company: req.companyId });
    }
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    const filter = req.companyId ? { company: req.companyId } : {};
    let policy = await AttendancePolicy.findOne(filter);
    if (!policy) {
      policy = await AttendancePolicy.create({ ...req.body, company: req.companyId });
    } else {
      policy = await AttendancePolicy.findOneAndUpdate(filter, req.body, { new: true });
    }
    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.punchIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    // Get Policy
    const policyFilter = req.companyId ? { company: req.companyId } : {};
    let policy = await AttendancePolicy.findOne(policyFilter);
    if (!policy) policy = await AttendancePolicy.create({ company: req.companyId });
    
    // Check Location
    if (policy.officeLatitude && policy.officeLongitude) {
      const parsedLat = parseFloat(latitude);
      const parsedLng = parseFloat(longitude);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({ message: 'GPS coordinates are required to verify office attendance radius.' });
      }
      const distance = getDistance(
        parseFloat(policy.officeLatitude), 
        parseFloat(policy.officeLongitude), 
        parsedLat, 
        parsedLng
      );
      
      if (distance > policy.allowedRadiusMeters) {
        return res.status(403).json({ message: `You are not in the office location. (Distance: ${Math.round(distance)}m > ${policy.allowedRadiusMeters}m)` });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    let attendance = await Attendance.findOne({ user: req.user._id, date: today });
    
    if (attendance) {
      return res.status(400).json({ message: 'Already punched in today.' });
    }

    // Calculate if late
    const now = new Date();
    const inTimeParts = policy.inTime.split(':');
    const expectedInTime = new Date(now);
    expectedInTime.setHours(parseInt(inTimeParts[0]), parseInt(inTimeParts[1]), 0, 0);
    
    // Add buffer
    const limitTime = new Date(expectedInTime.getTime() + policy.bufferMinutes * 60000);
    
    let status = 'Present';
    let lateByMinutes = 0;
    
    // Calculate late duration from exact inTime (no buffer for duration calc)
    const diffMs = now.getTime() - expectedInTime.getTime();
    if (diffMs > 0) {
      lateByMinutes = Math.floor(diffMs / 60000);
    }
    
    if (now > limitTime) {
      status = 'Late';
    }

    const photoPath = req.file ? `/uploads/attendance/${req.file.filename}` : null;

    attendance = await Attendance.create({
      user: req.user._id,
      company: req.companyId || req.user.company,
      date: today,
      punchIn: now,
      status,
      lateByMinutes,
      punchInLocation: {
        latitude: !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null,
        longitude: !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null,
      },
      punchInPhoto: photoPath
    });

    logAudit({
      user: req.user,
      action: 'ATTENDANCE_PUNCH_IN',
      category: 'ATTENDANCE',
      status: 'SUCCESS',
      details: { status, lateByMinutes, date: today },
      req,
    });

    res.json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.punchOut = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let attendance = await Attendance.findOne({ user: req.user._id, date: today });
    
    if (!attendance) {
      return res.status(400).json({ message: 'You have not punched in today.' });
    }
    
    if (attendance.punchOut) {
      return res.status(400).json({ message: 'Already punched out today.' });
    }

    const photoPath = req.file ? `/uploads/attendance/${req.file.filename}` : null;
    attendance.punchOutPhoto = photoPath;
    attendance.punchOut = new Date();
    await attendance.save();

    logAudit({
      user: req.user,
      action: 'ATTENDANCE_PUNCH_OUT',
      category: 'ATTENDANCE',
      status: 'SUCCESS',
      details: { date: today, punchOutTime: attendance.punchOut },
      req,
    });

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = { user: req.user._id };
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const logs = await Attendance.find(filter).sort({ date: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllAttendance = async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    let filter = {};
    if (req.user.role !== 'Super Admin') {
      const companyId = req.companyId || req.user.company?._id || req.user.company;
      if (!companyId) return res.json([]);
      filter.company = companyId;
    }
    if (date) filter.date = date;

    const logs = await Attendance.find(filter)
      .populate('user', 'name email designation profilePicture')
      .sort({ date: -1 });
      
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getTodayStatus = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const attendance = await Attendance.findOne({ user: req.user._id, date: today });
    
    // Also fetch policy for shift time info
    const policyFilter = req.companyId ? { company: req.companyId } : {};
    const policy = await AttendancePolicy.findOne(policyFilter);

    const now = new Date();
    const currentHour = now.getHours();
    // 7:00 AM to 11:00 AM window
    const isMorningWindow = currentHour >= 7 && currentHour < 11;

    return res.json({
      date: today,
      hasPunchedIn: !!attendance,
      hasPunchedOut: !!attendance?.punchOut,
      punchInTime: attendance?.punchIn || null,
      punchOutTime: attendance?.punchOut || null,
      status: attendance?.status || null,
      shiftInTime: policy?.inTime || '09:30',
      bufferMinutes: policy?.bufferMinutes || 15,
      isMorningWindow,
      serverTime: now
    });
  } catch (error) {
    console.error('getTodayStatus error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get complete daily attendance of all staff for a specific date
// @route   GET /api/attendance/daily-overview
// @access  Private (Admin / HR with attendance view permission)
exports.getDailyAttendanceOverview = async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

    let companyId = req.companyId || req.user.company?._id || req.user.company;
    if (req.user.role === 'Super Admin' && req.query.companyId) {
      companyId = req.query.companyId;
    }

    const userFilter = { role: { $nin: ['Admin', 'Super Admin'] } };
    if (companyId) {
      userFilter.company = companyId;
    }

    const users = await User.find(userFilter)
      .select('name email role designation department profilePicture')
      .sort({ name: 1 });

    const attendanceFilter = { date: targetDate };
    if (companyId) attendanceFilter.company = companyId;

    const attendances = await Attendance.find(attendanceFilter)
      .populate('lastEditedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role');

    const attMap = {};
    attendances.forEach((a) => {
      attMap[a.user.toString()] = a;
    });

    // Also check LeaveRequest for approved leaves on this date
    let leaveUserMap = {};
    try {
      const LeaveRequest = require('../models/LeaveRequest');
      const approvedLeaves = await LeaveRequest.find({
        company: companyId,
        status: 'Approved',
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate },
      });
      approvedLeaves.forEach((l) => {
        leaveUserMap[l.user.toString()] = l;
      });
    } catch (err) {
      // ignore
    }

    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let editedCount = 0;

    const list = users.map((u) => {
      const att = attMap[u._id.toString()] || null;
      const leave = leaveUserMap[u._id.toString()] || null;

      let effectiveStatus = 'Absent';
      if (att) {
        effectiveStatus = att.status || 'Present';
      } else if (leave) {
        effectiveStatus = 'On Leave';
      }

      if (effectiveStatus === 'Present') presentCount++;
      else if (effectiveStatus === 'Late') lateCount++;
      else if (effectiveStatus === 'Half Day') halfDayCount++;
      else if (effectiveStatus === 'On Leave') onLeaveCount++;
      else absentCount++;

      if (att?.isManuallyEdited) editedCount++;

      return {
        user: u,
        attendance: att,
        leaveDetails: leave ? { type: leave.leaveType, reason: leave.reason } : null,
        status: effectiveStatus,
        hasPunched: Boolean(att && att.punchIn),
        punchIn: att?.punchIn || null,
        punchOut: att?.punchOut || null,
        lateByMinutes: att?.lateByMinutes || 0,
        punchInPhoto: att?.punchInPhoto || null,
        punchOutPhoto: att?.punchOutPhoto || null,
        isManuallyEdited: att?.isManuallyEdited || false,
        lastEditedBy: att?.lastEditedBy || null,
        lastEditedAt: att?.lastEditedAt || null,
        editRemarks: att?.editRemarks || '',
        editHistory: att?.editHistory || [],
      };
    });

    res.json({
      success: true,
      date: targetDate,
      summary: {
        totalStaff: users.length,
        presentCount,
        lateCount,
        halfDayCount,
        absentCount,
        onLeaveCount,
        editedCount,
      },
      records: list,
    });
  } catch (error) {
    console.error('Error in getDailyAttendanceOverview:', error);
    res.status(500).json({ message: 'Failed to fetch daily attendance', error: error.message });
  }
};

// @desc    Manually edit or mark an employee's attendance record with audit tracking
// @route   POST /api/attendance/manual-edit
// @access  Private (Admin / HR with attendance edit permission)
exports.editOrMarkAttendance = async (req, res) => {
  try {
    const { userId, date, status, punchIn, punchOut, reason } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ message: 'User ID and date are required' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason / remark for modifying attendance is mandatory' });
    }

    const companyId = req.companyId || req.user.company?._id || req.user.company;
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    let attendance = await Attendance.findOne({ user: userId, date });
    const isNew = !attendance;

    const previousState = {
      status: attendance ? attendance.status : 'Absent / Not Punched',
      punchIn: attendance?.punchIn || null,
      punchOut: attendance?.punchOut || null,
    };

    let pIn = punchIn ? new Date(punchIn) : undefined;
    let pOut = punchOut ? new Date(punchOut) : undefined;

    if (status === 'Absent' || status === 'On Leave') {
      if (!punchIn) pIn = null;
      if (!punchOut) pOut = null;
    } else if (!pIn && (!attendance || !attendance.punchIn)) {
      const parsedDate = new Date(`${date}T09:30:00.000Z`);
      pIn = parsedDate;
    }

    const newState = {
      status: status || 'Present',
      punchIn: pIn,
      punchOut: pOut,
    };

    const editEntry = {
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: reason.trim(),
      previousState,
      newState,
    };

    if (isNew) {
      attendance = await Attendance.create({
        user: userId,
        company: companyId || targetUser.company,
        date,
        punchIn: pIn,
        punchOut: pOut,
        status: status || 'Present',
        isManuallyEdited: true,
        lastEditedBy: req.user._id,
        lastEditedAt: new Date(),
        editRemarks: reason.trim(),
        editHistory: [editEntry],
      });
    } else {
      attendance.status = status || attendance.status;
      if (pIn !== undefined) attendance.punchIn = pIn;
      if (pOut !== undefined) attendance.punchOut = pOut;
      attendance.isManuallyEdited = true;
      attendance.lastEditedBy = req.user._id;
      attendance.lastEditedAt = new Date();
      attendance.editRemarks = reason.trim();
      attendance.editHistory.push(editEntry);
      await attendance.save();
    }

    await attendance.populate('lastEditedBy', 'name email role');
    await attendance.populate('editHistory.editedBy', 'name email role');
    await attendance.populate('user', 'name email designation department profilePicture');

    logAudit({
      req,
      action: isNew ? 'ATTENDANCE_MANUALLY_MARKED' : 'ATTENDANCE_MANUALLY_EDITED',
      category: 'ATTENDANCE',
      status: 'SUCCESS',
      details: {
        targetUser: targetUser.name,
        targetEmail: targetUser.email,
        date,
        previousStatus: previousState.status,
        newStatus: status,
        reason: reason.trim(),
      },
    });

    res.json({
      success: true,
      message: `Attendance for ${targetUser.name} on ${date} has been updated.`,
      attendance,
    });
  } catch (error) {
    console.error('Error in editOrMarkAttendance:', error);
    res.status(500).json({ message: 'Failed to update attendance', error: error.message });
  }
};

// @desc    Get attendance audit trail / change history across the company
// @route   GET /api/attendance/audit-logs
// @access  Private (Admin / HR)
exports.getAttendanceAuditLogs = async (req, res) => {
  try {
    let companyId = req.companyId || req.user.company?._id || req.user.company;
    if (req.user.role === 'Super Admin' && req.query.companyId) {
      companyId = req.query.companyId;
    }

    const filter = { isManuallyEdited: true };
    if (companyId) filter.company = companyId;

    const modifiedRecords = await Attendance.find(filter)
      .populate('user', 'name email designation department profilePicture')
      .populate('lastEditedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role')
      .sort({ lastEditedAt: -1, updatedAt: -1 })
      .limit(100);

    const logList = [];
    modifiedRecords.forEach((rec) => {
      (rec.editHistory || []).forEach((hist) => {
        logList.push({
          attendanceId: rec._id,
          date: rec.date,
          user: rec.user,
          editedBy: hist.editedBy,
          editedAt: hist.editedAt,
          reason: hist.reason,
          previousState: hist.previousState,
          newState: hist.newState,
        });
      });
    });

    logList.sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));

    res.json(logList.slice(0, 100));
  } catch (error) {
    console.error('Error in getAttendanceAuditLogs:', error);
    res.status(500).json({ message: 'Failed to fetch attendance edit logs', error: error.message });
  }
};
