const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const User = require('../models/User');
const Company = require('../models/Company');
const SalarySlip = require('../models/SalarySlip');
const UserSalary = require('../models/UserSalary');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TimeSession = require('../models/TimeSession');

// Helper to format seconds into readable hours and minutes
const formatSecondsToHoursMins = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
};

// ============================================================
// 1. ATTENDANCE REPORT CONTROLLER
// ============================================================
const getAttendanceReport = async (req, res) => {
  try {
    const { year: qYear, month: qMonth, employeeId, department } = req.query;
    const now = new Date();
    const year = Number(qYear) || now.getFullYear();
    const month = Number(qMonth) || (now.getMonth() + 1);

    const companyId = req.companyId || req.user.company?._id || req.user.company;
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'Company context required' });
    }

    const company = companyId ? await Company.findById(companyId).select('name companyCode email phone address logo') : null;
    const policy = (companyId ? await AttendancePolicy.findOne({ company: companyId }) : null) || {
      inTime: '09:30',
      outTime: '18:30',
      allowedLateMarks: 3,
      bufferMinutes: 15,
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    };

    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const numDays = new Date(year, month, 0).getDate();
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

    // --- Case A: Individual Employee Detailed Monthly Report ---
    if (employeeId && employeeId !== 'All') {
      const employee = await User.findById(employeeId).select('name email role designation department phone status createdAt');
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }

      const attendanceLogs = await Attendance.find({
        user: employeeId,
        date: { $gte: startDateStr, $lte: endDateStr },
      }).sort({ date: 1 });

      const logMap = {};
      attendanceLogs.forEach((log) => {
        logMap[log.date] = log;
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dailyRecords = [];
      let presentCount = 0;
      let lateCount = 0;
      let halfDayCount = 0;
      let absentCount = 0;
      let leaveCount = 0;
      let weekendCount = 0;
      let totalLateMinutes = 0;
      let totalWorkingSeconds = 0;

      for (let day = 1; day <= numDays; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dObj = new Date(year, month - 1, day);
        const dayOfWeek = dayNames[dObj.getDay()];
        const isWeekend = !policy.workingDays.includes(dayOfWeek);

        const log = logMap[dateStr];
        let status = 'Absent';
        let punchInStr = '—';
        let punchOutStr = '—';
        let workDurationStr = '—';
        let lateMins = 0;
        let daySec = 0;

        if (log) {
          status = log.status || 'Present';
          lateMins = log.lateByMinutes || 0;
          totalLateMinutes += lateMins;

          if (log.punchIn) {
            punchInStr = new Date(log.punchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          }
          if (log.punchOut) {
            punchOutStr = new Date(log.punchOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          }

          if (log.punchIn && log.punchOut) {
            const diffMs = new Date(log.punchOut).getTime() - new Date(log.punchIn).getTime();
            if (diffMs > 0) {
              daySec = Math.floor(diffMs / 1000);
              totalWorkingSeconds += daySec;
              workDurationStr = formatSecondsToHoursMins(daySec);
            }
          }

          if (status === 'Present') presentCount++;
          else if (status === 'Late') lateCount++;
          else if (status === 'Half Day') halfDayCount++;
          else if (status === 'On Leave') leaveCount++;
          else if (status === 'Absent') absentCount++;
        } else {
          if (isWeekend) {
            status = 'Weekend';
            weekendCount++;
          } else {
            // If date is in the future
            if (dObj > now) {
              status = 'Upcoming';
            } else {
              status = 'Absent';
              absentCount++;
            }
          }
        }

        dailyRecords.push({
          date: dateStr,
          day: dayOfWeek,
          isWeekend,
          status,
          punchIn: punchInStr,
          punchOut: punchOutStr,
          workDuration: workDurationStr,
          workSeconds: daySec,
          lateByMinutes: lateMins,
          isManuallyEdited: Boolean(log?.isManuallyEdited),
          remarks: log?.editRemarks || '',
        });
      }

      const totalExpectedDays = numDays - weekendCount;
      const attendancePercentage = totalExpectedDays > 0 ? Math.round(((presentCount + lateCount + halfDayCount * 0.5) / totalExpectedDays) * 100) : 0;

      return res.json({
        reportType: 'individual_attendance',
        month,
        year,
        period: `${new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long' })} ${year}`,
        company,
        employee,
        summary: {
          totalDaysInMonth: numDays,
          workingDays: totalExpectedDays,
          presentDays: presentCount,
          lateDays: lateCount,
          halfDays: halfDayCount,
          absentDays: absentCount,
          leaveDays: leaveCount,
          weekendDays: weekendCount,
          totalLateMinutes,
          totalWorkingHours: (totalWorkingSeconds / 3600).toFixed(1),
          totalWorkingHoursFormatted: formatSecondsToHoursMins(totalWorkingSeconds),
          attendancePercentage,
        },
        dailyRecords,
      });
    }

    // --- Case B: Company-Wide Attendance Summary for all Employees ---
    const userFilter = { status: { $ne: 'Inactive' } };
    if (companyId) userFilter.company = companyId;
    if (department && department !== 'All') userFilter.department = department;

    const employees = await User.find(userFilter).select('name email role designation department phone').sort({ name: 1 });

    const attendanceLogs = await Attendance.find({
      company: companyId,
      date: { $gte: startDateStr, $lte: endDateStr },
    });

    const logsByUser = {};
    attendanceLogs.forEach((log) => {
      const uStr = log.user.toString();
      if (!logsByUser[uStr]) logsByUser[uStr] = [];
      logsByUser[uStr].push(log);
    });

    // Approximate working days in this month
    let weekendDaysInMonth = 0;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (let day = 1; day <= numDays; day++) {
      const dObj = new Date(year, month - 1, day);
      if (!policy.workingDays.includes(dayNames[dObj.getDay()])) {
        weekendDaysInMonth++;
      }
    }
    const expectedWorkingDays = numDays - weekendDaysInMonth;

    let companyTotalPresent = 0;
    let companyTotalLate = 0;
    let companyTotalHalfDay = 0;
    let companyTotalAbsent = 0;
    let companyTotalHoursSec = 0;

    const employeeSummaries = employees.map((emp) => {
      const userLogs = logsByUser[emp._id.toString()] || [];
      const presentCount = userLogs.filter((l) => l.status === 'Present').length;
      const lateCount = userLogs.filter((l) => l.status === 'Late').length;
      const halfDayCount = userLogs.filter((l) => l.status === 'Half Day').length;
      const leaveCount = userLogs.filter((l) => l.status === 'On Leave').length;
      const loggedAbsent = userLogs.filter((l) => l.status === 'Absent').length;

      // Calculate absent days based on past days without attendance
      const pastDaysTillNow = Math.min(numDays, Math.ceil((Math.min(now.getTime(), new Date(year, month, 0).getTime()) - new Date(year, month - 1, 1).getTime()) / (1000 * 3600 * 24)) + 1);
      const pastWorkingDays = Math.max(0, pastDaysTillNow - Math.floor((pastDaysTillNow / 7) * (7 - policy.workingDays.length)));
      const accountedDays = presentCount + lateCount + halfDayCount + leaveCount + loggedAbsent;
      const absentDays = Math.max(0, loggedAbsent, pastWorkingDays - (presentCount + lateCount + halfDayCount + leaveCount));

      let userLateMinutes = 0;
      let userWorkingSeconds = 0;

      userLogs.forEach((l) => {
        userLateMinutes += l.lateByMinutes || 0;
        if (l.punchIn && l.punchOut) {
          const diffMs = new Date(l.punchOut).getTime() - new Date(l.punchIn).getTime();
          if (diffMs > 0) userWorkingSeconds += Math.floor(diffMs / 1000);
        }
      });

      companyTotalPresent += presentCount;
      companyTotalLate += lateCount;
      companyTotalHalfDay += halfDayCount;
      companyTotalAbsent += absentDays;
      companyTotalHoursSec += userWorkingSeconds;

      const rate = expectedWorkingDays > 0 ? Math.min(100, Math.round(((presentCount + lateCount + halfDayCount * 0.5) / expectedWorkingDays) * 100)) : 0;

      return {
        _id: emp._id,
        name: emp.name,
        email: emp.email,
        designation: emp.designation || 'Staff',
        department: emp.department || 'General',
        totalWorkingDays: expectedWorkingDays,
        presentDays: presentCount,
        lateDays: lateCount,
        halfDays: halfDayCount,
        absentDays: absentDays,
        leaveDays: leaveCount,
        totalLateMinutes: userLateMinutes,
        totalHoursFormatted: formatSecondsToHoursMins(userWorkingSeconds),
        totalHoursNumeric: Number((userWorkingSeconds / 3600).toFixed(1)),
        attendanceRate: rate,
      };
    });

    const overallAttendanceRate = employees.length > 0 && expectedWorkingDays > 0
      ? Math.round((companyTotalPresent / (employees.length * expectedWorkingDays)) * 100)
      : 0;

    return res.json({
      reportType: 'company_attendance',
      month,
      year,
      period: `${new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long' })} ${year}`,
      company,
      summary: {
        totalStaff: employees.length,
        expectedWorkingDays,
        totalPresentMarks: companyTotalPresent,
        totalLateMarks: companyTotalLate,
        totalHalfDays: companyTotalHalfDay,
        totalAbsents: companyTotalAbsent,
        overallAttendanceRate: Math.min(100, overallAttendanceRate),
        totalCompanyHours: Number((companyTotalHoursSec / 3600).toFixed(1)),
        totalCompanyHoursFormatted: formatSecondsToHoursMins(companyTotalHoursSec),
      },
      employees: employeeSummaries,
    });
  } catch (error) {
    console.error('Error in getAttendanceReport:', error);
    res.status(500).json({ message: 'Failed to generate attendance report', error: error.message });
  }
};

// ============================================================
// 2. SALARY & DEDUCTION REPORT CONTROLLER
// ============================================================
const getSalaryReport = async (req, res) => {
  try {
    const { year: qYear, month: qMonth, employeeId } = req.query;
    const now = new Date();
    const year = Number(qYear) || now.getFullYear();
    const month = Number(qMonth) || (now.getMonth() + 1);

    const companyId = req.companyId || req.user.company?._id || req.user.company;
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'Company context required' });
    }

    const company = companyId ? await Company.findById(companyId).select('name companyCode email phone address logo') : null;
    const policy = (companyId ? await AttendancePolicy.findOne({ company: companyId }) : null) || { allowedLateMarks: 3 };

    // Find official salary slips if generated
    const slipFilter = { year, month };
    if (companyId) slipFilter.company = companyId;
    if (employeeId && employeeId !== 'All') slipFilter.user = employeeId;

    const salarySlips = await SalarySlip.find(slipFilter).populate('user', 'name email designation department role').sort({ 'user.name': 1 });

    const slipMap = {};
    salarySlips.forEach((slip) => {
      if (slip.user && slip.user._id) {
        slipMap[slip.user._id.toString()] = slip;
      }
    });

    // Fetch user configurations to build complete report even if slips are not generated yet
    const userFilter = { status: { $ne: 'Inactive' } };
    if (companyId) userFilter.company = companyId;
    if (employeeId && employeeId !== 'All') userFilter._id = employeeId;

    const employees = await User.find(userFilter).select('name email role designation department phone').sort({ name: 1 });
    const userConfigs = await UserSalary.find(companyId ? { company: companyId } : {});
    const configMap = {};
    userConfigs.forEach((c) => {
      configMap[c.user.toString()] = c;
    });

    // Fetch monthly attendance to compute late days & deductions
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const numDays = new Date(year, month, 0).getDate();
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;

    const attendanceLogs = await Attendance.find({
      company: companyId,
      date: { $gte: startDateStr, $lte: endDateStr },
    });

    const attMap = {};
    attendanceLogs.forEach((l) => {
      const uId = l.user.toString();
      if (!attMap[uId]) attMap[uId] = [];
      attMap[uId].push(l);
    });

    let totalGrossSum = 0;
    let totalLateDeductionsSum = 0;
    let totalPFSum = 0;
    let totalESICSum = 0;
    let totalPTSum = 0;
    let totalDeductionsSum = 0;
    let totalNetPaySum = 0;
    let paidCount = 0;
    let pendingCount = 0;

    const workingDaysInMonth = 22;

    const salaryList = employees.map((emp) => {
      const empIdStr = emp._id.toString();
      const existingSlip = slipMap[empIdStr];
      const cfg = configMap[empIdStr];
      const userLogs = attMap[empIdStr] || [];

      if (existingSlip) {
        const gross = existingSlip.grossEarnings || 0;
        const net = existingSlip.netPay || 0;
        const totalDed = existingSlip.totalDeductions || 0;
        const lateDed = existingSlip.deductions?.lateDeduction || 0;
        const pf = existingSlip.deductions?.pf || 0;
        const esic = existingSlip.deductions?.esic || 0;
        const pt = existingSlip.deductions?.professionalTax || 0;
        const status = existingSlip.status || 'Pending';

        totalGrossSum += gross;
        totalLateDeductionsSum += lateDed;
        totalPFSum += pf;
        totalESICSum += esic;
        totalPTSum += pt;
        totalDeductionsSum += totalDed;
        totalNetPaySum += net;
        if (status === 'Paid') paidCount++;
        else pendingCount++;

        return {
          _id: existingSlip._id,
          userId: emp._id,
          employeeName: emp.name,
          email: emp.email,
          designation: emp.designation || 'Staff',
          department: emp.department || 'General',
          isSlipGenerated: true,
          status,
          fixedCTC: existingSlip.fixedCTC || 0,
          grossEarnings: gross,
          basic: existingSlip.earnings?.basic || 0,
          hra: existingSlip.earnings?.hra || 0,
          allowances: (existingSlip.earnings?.splAllowance || 0) + (existingSlip.earnings?.exGratia || 0),
          workingDays: existingSlip.stats?.workingDays || workingDaysInMonth,
          presentDays: existingSlip.stats?.presentDays || 0,
          lateDays: existingSlip.stats?.lateDays || 0,
          absentDays: existingSlip.stats?.absentDays || 0,
          lateDeduction: lateDed,
          pfDeduction: pf,
          esicDeduction: esic,
          ptDeduction: pt,
          totalDeductions: totalDed,
          netPay: net,
          paymentMode: existingSlip.paymentMode || '—',
          paymentDate: existingSlip.paymentDate ? new Date(existingSlip.paymentDate).toLocaleDateString('en-IN') : '—',
          transactionRef: existingSlip.transactionRef || '—',
        };
      }

      // Compute Live Preview Figures
      const presentDays = userLogs.filter((l) => l.status === 'Present').length;
      const lateDays = userLogs.filter((l) => l.status === 'Late').length;
      const halfDays = userLogs.filter((l) => l.status === 'Half Day').length;
      const absentDays = userLogs.filter((l) => l.status === 'Absent').length;

      const e = cfg?.earnings || {};
      let gross = (e.basic || 0) + (e.hra || 0) + (e.exGratia || 0) + (e.splAllowance || 0);
      if (gross === 0 && cfg?.fixedCTC) {
        gross = Math.round(cfg.fixedCTC / 12);
      }

      let lateDed = 0;
      if (lateDays > (policy.allowedLateMarks || 3) && gross > 0) {
        const excessLate = lateDays - (policy.allowedLateMarks || 3);
        const perDay = gross / workingDaysInMonth;
        lateDed = Math.round((excessLate / 2) * perDay);
      }

      const d = cfg?.deductions || {};
      const pf = d.pf || 0;
      const esic = d.esic || 0;
      const pt = d.professionalTax || (gross > 10000 ? 200 : 0);
      const totalDed = lateDed + pf + esic + pt;
      const net = Math.max(0, gross - totalDed);

      totalGrossSum += gross;
      totalLateDeductionsSum += lateDed;
      totalPFSum += pf;
      totalESICSum += esic;
      totalPTSum += pt;
      totalDeductionsSum += totalDed;
      totalNetPaySum += net;
      pendingCount++;

      return {
        _id: `draft-${emp._id}`,
        userId: emp._id,
        employeeName: emp.name,
        email: emp.email,
        designation: emp.designation || 'Staff',
        department: emp.department || 'General',
        isSlipGenerated: false,
        status: 'Draft / Unprocessed',
        fixedCTC: cfg?.fixedCTC || 0,
        grossEarnings: gross,
        basic: e.basic || Math.round(gross * 0.5),
        hra: e.hra || Math.round(gross * 0.3),
        allowances: (e.splAllowance || 0) + (e.exGratia || 0),
        workingDays: workingDaysInMonth,
        presentDays,
        lateDays,
        absentDays,
        lateDeduction: lateDed,
        pfDeduction: pf,
        esicDeduction: esic,
        ptDeduction: pt,
        totalDeductions: totalDed,
        netPay: net,
        paymentMode: 'Pending Disbursement',
        paymentDate: '—',
        transactionRef: '—',
      };
    });

    return res.json({
      reportType: 'salary_payroll',
      month,
      year,
      period: `${new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long' })} ${year}`,
      company,
      summary: {
        totalEmployees: employees.length,
        totalGrossPayroll: totalGrossSum,
        totalLateDeductions: totalLateDeductionsSum,
        totalPF: totalPFSum,
        totalESIC: totalESICSum,
        totalPT: totalPTSum,
        totalDeductions: totalDeductionsSum,
        totalNetDisbursed: totalNetPaySum,
        paidCount,
        pendingCount,
      },
      salaries: salaryList,
    });
  } catch (error) {
    console.error('Error in getSalaryReport:', error);
    res.status(500).json({ message: 'Failed to generate salary report', error: error.message });
  }
};

// ============================================================
// 3. PROJECT & TEAM WORK REPORT CONTROLLER ("Kisne Kitna Kaam Kiya")
// ============================================================
const getProjectReport = async (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.query;

    const companyId = req.companyId || req.user.company?._id || req.user.company;
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'Company context required' });
    }

    const company = companyId ? await Company.findById(companyId).select('name companyCode email phone address logo') : null;

    // --- Case A: Individual Project Work Breakdown ---
    if (projectId && projectId !== 'All') {
      const project = await Project.findById(projectId).populate('client', 'name email companyName phone');
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      const taskFilter = { project: projectId };
      const tasks = await Task.find(taskFilter)
        .populate('assignedTo', 'name email designation role')
        .populate('assignedBy', 'name role')
        .sort({ createdAt: -1 });

      const sessionFilter = { project: projectId, status: 'completed' };
      if (startDate && endDate) {
        sessionFilter.startTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }
      const timeSessions = await TimeSession.find(sessionFilter).populate('user', 'name email designation role');

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
      const inProgressTasks = tasks.filter((t) => t.status === 'In Progress').length;
      const pendingTasks = tasks.filter((t) => t.status === 'Pending').length;

      let totalLoggedSeconds = 0;
      tasks.forEach((t) => {
        totalLoggedSeconds += t.totalLoggedSeconds || 0;
      });

      // Group by team member: "Kisne kitna kaam kiya"
      const memberMap = {};

      // 1. Map through all tasks
      tasks.forEach((t) => {
        const u = t.assignedTo;
        if (!u || !u._id) return;
        const uId = u._id.toString();
        if (!memberMap[uId]) {
          memberMap[uId] = {
            userId: u._id,
            name: u.name,
            email: u.email,
            designation: u.designation || 'Team Member',
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            pendingTasks: 0,
            productiveSeconds: 0,
            sessionCount: 0,
            tasksList: [],
          };
        }
        memberMap[uId].totalTasks += 1;
        if (t.status === 'Completed') memberMap[uId].completedTasks += 1;
        else if (t.status === 'In Progress') memberMap[uId].inProgressTasks += 1;
        else memberMap[uId].pendingTasks += 1;

        memberMap[uId].productiveSeconds += (t.totalLoggedSeconds || 0);
        memberMap[uId].tasksList.push({
          taskId: t._id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          loggedSeconds: t.totalLoggedSeconds || 0,
          loggedFormatted: formatSecondsToHoursMins(t.totalLoggedSeconds || 0),
          targetMins: t.targetDurationMinutes || 0,
        });
      });

      // 2. Map through time sessions for exact session counts & live times
      timeSessions.forEach((s) => {
        const u = s.user;
        if (!u || !u._id) return;
        const uId = u._id.toString();
        if (!memberMap[uId]) {
          memberMap[uId] = {
            userId: u._id,
            name: u.name,
            email: u.email,
            designation: u.designation || 'Team Member',
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            pendingTasks: 0,
            productiveSeconds: 0,
            sessionCount: 0,
            tasksList: [],
          };
        }
        memberMap[uId].sessionCount += 1;
        // If not already counted from tasks
        if (memberMap[uId].totalTasks === 0) {
          memberMap[uId].productiveSeconds += (s.productiveDurationSeconds || 0);
        }
      });

      const teamMembers = Object.values(memberMap).map((m) => {
        const percentage = totalLoggedSeconds > 0 ? Math.round((m.productiveSeconds / totalLoggedSeconds) * 100) : 0;
        return {
          ...m,
          productiveHoursNumeric: Number((m.productiveSeconds / 3600).toFixed(2)),
          productiveHoursFormatted: formatSecondsToHoursMins(m.productiveSeconds),
          workContributionPercentage: Math.min(100, percentage),
        };
      }).sort((a, b) => b.productiveSeconds - a.productiveSeconds);

      return res.json({
        reportType: 'single_project',
        company,
        project: {
          _id: project._id,
          name: project.name,
          description: project.description,
          status: project.status,
          startDate: project.startDate ? new Date(project.startDate).toLocaleDateString('en-IN') : '—',
          endDate: project.endDate ? new Date(project.endDate).toLocaleDateString('en-IN') : '—',
          budget: project.budget || 0,
          currency: project.currency || 'INR',
          progress: project.progress || (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0),
          clientName: project.client?.name || project.clientName || 'Internal Company',
        },
        summary: {
          totalTasks,
          completedTasks,
          inProgressTasks,
          pendingTasks,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          totalLoggedSeconds,
          totalLoggedHours: Number((totalLoggedSeconds / 3600).toFixed(2)),
          totalLoggedHoursFormatted: formatSecondsToHoursMins(totalLoggedSeconds),
          totalContributors: teamMembers.length,
          topContributor: teamMembers[0]?.name || '—',
        },
        teamBreakdown: teamMembers,
        tasks: tasks.map((t) => ({
          _id: t._id,
          title: t.title,
          assigneeName: t.assignedTo?.name || 'Unassigned',
          status: t.status,
          priority: t.priority,
          startDate: t.startDate ? new Date(t.startDate).toLocaleDateString('en-IN') : '—',
          dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN') : '—',
          targetDurationMinutes: t.targetDurationMinutes || 0,
          loggedHoursFormatted: formatSecondsToHoursMins(t.totalLoggedSeconds || 0),
          loggedSeconds: t.totalLoggedSeconds || 0,
        })),
      });
    }

    // --- Case B: Company-Wide All Projects Summary ---
    const projectFilter = {};
    if (companyId) projectFilter.company = companyId;

    const allProjects = await Project.find(projectFilter).sort({ createdAt: -1 });
    const allTasks = await Task.find(companyId ? { company: companyId } : {}).select('project status totalLoggedSeconds');

    const tasksByProject = {};
    allTasks.forEach((t) => {
      if (!t.project) return;
      const pId = t.project.toString();
      if (!tasksByProject[pId]) tasksByProject[pId] = [];
      tasksByProject[pId].push(t);
    });

    let totalProjectsCount = allProjects.length;
    let completedProjectsCount = 0;
    let activeProjectsCount = 0;
    let grandTotalLoggedSeconds = 0;
    let grandTotalTasks = 0;
    let grandTotalCompletedTasks = 0;

    const projectSummaries = allProjects.map((p) => {
      const pId = p._id.toString();
      const pTasks = tasksByProject[pId] || [];
      const totalT = pTasks.length;
      const compT = pTasks.filter((t) => t.status === 'Completed').length;
      let pSeconds = 0;
      pTasks.forEach((t) => { pSeconds += (t.totalLoggedSeconds || 0); });

      grandTotalLoggedSeconds += pSeconds;
      grandTotalTasks += totalT;
      grandTotalCompletedTasks += compT;

      if (p.status === 'Completed') completedProjectsCount++;
      else activeProjectsCount++;

      const completionRate = totalT > 0 ? Math.round((compT / totalT) * 100) : 0;

      return {
        _id: p._id,
        name: p.name,
        status: p.status,
        startDate: p.startDate ? new Date(p.startDate).toLocaleDateString('en-IN') : '—',
        endDate: p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN') : '—',
        totalTasks: totalT,
        completedTasks: compT,
        completionRate,
        loggedHoursFormatted: formatSecondsToHoursMins(pSeconds),
        loggedHoursNumeric: Number((pSeconds / 3600).toFixed(1)),
      };
    });

    return res.json({
      reportType: 'all_projects',
      company,
      summary: {
        totalProjects: totalProjectsCount,
        activeProjects: activeProjectsCount,
        completedProjects: completedProjectsCount,
        totalTasks: grandTotalTasks,
        totalCompletedTasks: grandTotalCompletedTasks,
        totalLoggedHours: Number((grandTotalLoggedSeconds / 3600).toFixed(1)),
        totalLoggedHoursFormatted: formatSecondsToHoursMins(grandTotalLoggedSeconds),
      },
      projects: projectSummaries,
    });
  } catch (error) {
    console.error('Error in getProjectReport:', error);
    res.status(500).json({ message: 'Failed to generate project report', error: error.message });
  }
};

module.exports = {
  getAttendanceReport,
  getSalaryReport,
  getProjectReport,
};
