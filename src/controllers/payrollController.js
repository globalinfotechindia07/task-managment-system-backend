const UserSalary = require('../models/UserSalary');
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const User = require('../models/User');
const Company = require('../models/Company');
const { sendEmail } = require('../utils/emailService');

// Reusable Helper to calculate and generate or update salary slip for an individual user
async function calculateAndSaveSlipForUser(user, month, year, companyId, initialStatus = 'Pending') {
  const uId = user._id || user;
  const config = await UserSalary.findOne({ user: uId });
  if (!config) return null;

  const policyFilter = companyId ? { company: companyId } : {};
  const policy = (await AttendancePolicy.findOne(policyFilter)) || { allowedLateMarks: 3 };

  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const attendanceLogs = await Attendance.find({
    user: uId,
    date: { $gte: startDate, $lte: endDate },
  });

  const presentDays = attendanceLogs.filter((log) => log.status === 'Present').length;
  const lateDays = attendanceLogs.filter((log) => log.status === 'Late').length;
  const halfDays = attendanceLogs.filter((log) => log.status === 'Half Day').length;
  const absentDays = attendanceLogs.filter((log) => log.status === 'Absent').length;

  const workingDaysInMonth = 22;

  const e = config.earnings || {};
  let grossEarnings = (e.basic || 0) + (e.hra || 0) + (e.exGratia || 0) + (e.splAllowance || 0);

  let dynamicEarnings = [];
  let dynamicDeductions = [];
  let dynamicEmployerContributions = [];

  if (Array.isArray(config.dynamicComponents) && config.dynamicComponents.length > 0) {
    config.dynamicComponents.forEach((dc) => {
      if (dc.type === 'Earning') {
        dynamicEarnings.push({ name: dc.name, amount: dc.amount || 0 });
      } else if (dc.type === 'Deduction') {
        dynamicDeductions.push({ name: dc.name, amount: dc.amount || 0, payer: dc.payer || 'Employee' });
      } else if (dc.type === 'EmployerContribution') {
        dynamicEmployerContributions.push({ name: dc.name, amount: dc.amount || 0 });
      }
    });
  }

  const dynamicEarnTotal = dynamicEarnings.reduce((sum, c) => sum + (c.amount || 0), 0);
  if (grossEarnings === 0 && dynamicEarnTotal > 0) {
    grossEarnings = dynamicEarnTotal;
  }

  let lateDeductionAmount = 0;
  if (lateDays > policy.allowedLateMarks) {
    const excessLateDays = lateDays - policy.allowedLateMarks;
    const perDaySalary = grossEarnings / workingDaysInMonth;
    lateDeductionAmount = Math.round(excessLateDays * perDaySalary);
  }

  const d = config.deductions || {};
  let totalDeductions =
    (d.pf || 0) +
    (d.esic || 0) +
    (d.labourWelfareFund || 0) +
    (d.professionalTax || 0) +
    (d.welfareFund || 0) +
    lateDeductionAmount;
  const dynamicDedTotal = dynamicDeductions.reduce((sum, c) => sum + (c.amount || 0), 0);
  if (totalDeductions === lateDeductionAmount && dynamicDedTotal > 0) {
    totalDeductions += dynamicDedTotal;
  }

  const c = config.employerContributions || {};
  let totalEmployerContributions =
    (c.pf || 0) + (c.esic || 0) + (c.labourWelfareFund || 0) + (c.professionalTax || 0);
  const dynamicEmpTotal = dynamicEmployerContributions.reduce((sum, c) => sum + (c.amount || 0), 0);
  if (totalEmployerContributions === 0 && dynamicEmpTotal > 0) {
    totalEmployerContributions = dynamicEmpTotal;
  }

  const netPay = Math.max(0, grossEarnings - totalDeductions);

  let slip = await SalarySlip.findOne({ user: uId, month, year });
  const slipData = {
    user: uId,
    company: companyId || user.company,
    salaryStructure: config.salaryStructure || undefined,
    month,
    year,
    fixedCTC: config.fixedCTC,
    earnings: e,
    deductions: {
      ...d,
      lateDeduction: lateDeductionAmount,
    },
    employerContributions: c,
    dynamicEarnings,
    dynamicDeductions,
    dynamicEmployerContributions,
    grossEarnings,
    totalDeductions,
    totalEmployerContributions,
    netPay,
    status: slip?.status || initialStatus,
    stats: {
      totalDays: new Date(year, month, 0).getDate(),
      workingDays: workingDaysInMonth,
      presentDays,
      lateDays,
      absentDays,
    },
  };

  if (slip) {
    slip = await SalarySlip.findByIdAndUpdate(slip._id, slipData, { new: true });
  } else {
    slip = await SalarySlip.create(slipData);
  }

  return slip;
}

exports.getConfig = async (req, res) => {
  try {
    let config = await UserSalary.findOne({ user: req.params.userId }).populate('salaryStructure');
    if (!config) {
      config = { 
        fixedCTC: 0,
        earnings: { basic: 0, hra: 0, exGratia: 0, splAllowance: 0 },
        deductions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0, welfareFund: 0 },
        employerContributions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0 },
        dynamicComponents: [],
        salaryStructure: null
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyConfig = async (req, res) => {
  try {
    let config = await UserSalary.findOne({ user: req.user._id }).populate('salaryStructure');
    if (!config) {
      config = { 
        fixedCTC: 0,
        earnings: { basic: 0, hra: 0, exGratia: 0, splAllowance: 0 },
        deductions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0, welfareFund: 0 },
        employerContributions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0 },
        dynamicComponents: [],
        salaryStructure: null
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const {
      userId,
      fixedCTC,
      earnings,
      deductions,
      employerContributions,
      salaryStructure,
      dynamicComponents,
      netMonthlyTakeHome,
    } = req.body;
    let config = await UserSalary.findOne({ user: userId });
    
    if (config) {
      config.fixedCTC = fixedCTC || 0;
      config.earnings = earnings || {};
      config.deductions = deductions || {};
      config.employerContributions = employerContributions || {};
      if (salaryStructure !== undefined) config.salaryStructure = salaryStructure || null;
      if (dynamicComponents !== undefined) config.dynamicComponents = dynamicComponents || [];
      if (netMonthlyTakeHome !== undefined) config.netMonthlyTakeHome = netMonthlyTakeHome || 0;
      if (!config.company && (req.companyId || req.user.company)) {
        config.company = req.companyId || req.user.company;
      }
      await config.save();
    } else {
      config = await UserSalary.create({
        user: userId,
        company: req.companyId || req.user.company,
        fixedCTC,
        earnings,
        deductions,
        employerContributions,
        salaryStructure: salaryStructure || null,
        dynamicComponents: dynamicComponents || [],
        netMonthlyTakeHome: netMonthlyTakeHome || 0,
      });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.generateSalary = async (req, res) => {
  try {
    const { month, year } = req.body;
    
    // Get all users who have salary config within company
    const userFilter = { role: { $nin: ['Admin', 'Super Admin'] } };
    if (req.user.role !== 'Super Admin' && req.companyId) {
      userFilter.company = req.companyId;
    }
    const users = await User.find(userFilter);
    const policyFilter = req.companyId ? { company: req.companyId } : {};
    const policy = await AttendancePolicy.findOne(policyFilter) || { allowedLateMarks: 3 };
    
    const results = [];

    for (const user of users) {
      const config = await UserSalary.findOne({ user: user._id });
      if (!config || !config.fixedCTC) continue; // Skip if no salary config

      // Get Attendance for the month
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      const attendanceLogs = await Attendance.find({
        user: user._id,
        date: { $gte: startDate, $lte: endDate }
      });

      const presentDays = attendanceLogs.filter(log => log.status === 'Present').length;
      const lateDays = attendanceLogs.filter(log => log.status === 'Late').length;
      const halfDays = attendanceLogs.filter(log => log.status === 'Half Day').length;
      const absentDays = attendanceLogs.filter(log => log.status === 'Absent').length;

      const workingDaysInMonth = 22; // Assume 22 for now

      // Earnings (A)
      const e = config.earnings || {};
      let grossEarnings = (e.basic || 0) + (e.hra || 0) + (e.exGratia || 0) + (e.splAllowance || 0);

      // Dynamic components map
      let dynamicEarnings = [];
      let dynamicDeductions = [];
      let dynamicEmployerContributions = [];

      if (Array.isArray(config.dynamicComponents) && config.dynamicComponents.length > 0) {
        config.dynamicComponents.forEach((dc) => {
          if (dc.type === 'Earning') {
            dynamicEarnings.push({ name: dc.name, amount: dc.amount || 0 });
          } else if (dc.type === 'Deduction') {
            dynamicDeductions.push({ name: dc.name, amount: dc.amount || 0, payer: dc.payer || 'Employee' });
          } else if (dc.type === 'EmployerContribution') {
            dynamicEmployerContributions.push({ name: dc.name, amount: dc.amount || 0 });
          }
        });
      }

      const dynamicEarnTotal = dynamicEarnings.reduce((sum, c) => sum + (c.amount || 0), 0);
      if (grossEarnings === 0 && dynamicEarnTotal > 0) {
        grossEarnings = dynamicEarnTotal;
      }

      // Calculate Late Deductions
      let lateDeductionAmount = 0;
      if (lateDays > policy.allowedLateMarks) {
        const excessLateDays = lateDays - policy.allowedLateMarks;
        const perDaySalary = grossEarnings / workingDaysInMonth;
        lateDeductionAmount = Math.round(excessLateDays * perDaySalary);
      }

      // Deductions (B)
      const d = config.deductions || {};
      let totalDeductions = (d.pf || 0) + (d.esic || 0) + (d.labourWelfareFund || 0) + (d.professionalTax || 0) + (d.welfareFund || 0) + lateDeductionAmount;
      const dynamicDedTotal = dynamicDeductions.reduce((sum, c) => sum + (c.amount || 0), 0);
      if (totalDeductions === lateDeductionAmount && dynamicDedTotal > 0) {
        totalDeductions += dynamicDedTotal;
      }

      // Employer Contributions (C)
      const c = config.employerContributions || {};
      let totalEmployerContributions = (c.pf || 0) + (c.esic || 0) + (c.labourWelfareFund || 0) + (c.professionalTax || 0);
      const dynamicEmpTotal = dynamicEmployerContributions.reduce((sum, c) => sum + (c.amount || 0), 0);
      if (totalEmployerContributions === 0 && dynamicEmpTotal > 0) {
        totalEmployerContributions = dynamicEmpTotal;
      }

      // Net Pay = A - B
      const netPay = Math.max(0, grossEarnings - totalDeductions);

      // Create or update Slip
      let slip = await SalarySlip.findOne({ user: user._id, month, year });
      const slipData = {
        user: user._id,
        company: req.companyId || user.company,
        salaryStructure: config.salaryStructure || undefined,
        month,
        year,
        fixedCTC: config.fixedCTC,
        earnings: e,
        deductions: {
          ...d,
          lateDeduction: lateDeductionAmount
        },
        employerContributions: c,
        dynamicEarnings,
        dynamicDeductions,
        dynamicEmployerContributions,
        grossEarnings,
        totalDeductions,
        totalEmployerContributions,
        netPay,
        stats: {
          totalDays: new Date(year, month, 0).getDate(),
          workingDays: workingDaysInMonth,
          presentDays,
          lateDays,
          absentDays
        }
      };

      if (slip) {
        slip = await SalarySlip.findByIdAndUpdate(slip._id, slipData, { new: true });
      } else {
        slip = await SalarySlip.create(slipData);
      }

      results.push(slip);
    }

    res.json({ message: `Generated ${results.length} salary slips`, slips: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMySlips = async (req, res) => {
  try {
    const slips = await SalarySlip.find({ user: req.user._id })
      .populate('salaryStructure', 'name code employmentType')
      .populate('company', 'name location address contactEmail phone registrationNumber gstNumber logo letterhead')
      .populate('user', 'name email designation department')
      .sort({ year: -1, month: -1 });
    res.json(slips);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllSlips = async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = {};
    if (req.user.role !== 'Super Admin' && req.companyId) {
      filter.company = req.companyId;
    }
    if (month && year) {
      filter.month = parseInt(month);
      filter.year = parseInt(year);
    }
    const slips = await SalarySlip.find(filter)
      .populate('user', 'name email designation department profilePicture')
      .populate('salaryStructure', 'name code employmentType')
      .populate('company', 'name location address contactEmail phone registrationNumber gstNumber logo letterhead')
      .sort({ year: -1, month: -1 });
    res.json(slips);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all employees along with their configured salary plan & CTC
// @route   GET /api/payroll/employees-salary
// @access  Private (Admin / HR)
exports.getEmployeesSalaryList = async (req, res) => {
  try {
    let companyId = req.companyId || req.user?.company?._id || req.user?.company;
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

    const salaries = await UserSalary.find(companyId ? { company: companyId } : {})
      .populate('salaryStructure', 'name code employmentType isDefault status components');

    const salaryMap = {};
    salaries.forEach((s) => {
      salaryMap[s.user.toString()] = s;
    });

    const enriched = users.map((u) => {
      const sal = salaryMap[u._id.toString()];
      return {
        ...u.toObject(),
        salaryConfig: sal || null,
        salaryStructure: sal?.salaryStructure || null,
        fixedCTC: sal?.fixedCTC || 0,
        netMonthlyTakeHome: sal?.netMonthlyTakeHome || 0,
        isConfigured: Boolean(sal && sal.fixedCTC > 0),
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error in getEmployeesSalaryList:', error);
    res.status(500).json({ message: 'Failed to fetch employee salaries', error: error.message });
  }
};

// @desc    Get Salary Processing & Disbursement status list for all employees (Admin & Accountant)
// @route   GET /api/payroll/process-status
// @access  Private (Admin / Accountant / HR)
exports.getSalaryProcessList = async (req, res) => {
  try {
    let companyId = req.companyId || req.user?.company?._id || req.user?.company;
    if (req.user.role === 'Super Admin' && req.query.companyId) {
      companyId = req.query.companyId;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const month = parseInt(req.query.month || currentMonth, 10);
    const year = parseInt(req.query.year || currentYear, 10);
    const filterStatus = req.query.status || 'All';
    const filterDept = req.query.department || 'All';
    const search = (req.query.search || '').trim().toLowerCase();

    // 1. Get all employees in company
    const userFilter = { role: { $nin: ['Admin', 'Super Admin'] } };
    if (companyId) {
      userFilter.company = companyId;
    }
    if (filterDept && filterDept !== 'All') {
      userFilter.department = filterDept;
    }

    const users = await User.find(userFilter)
      .select('name email role designation department profilePicture')
      .sort({ name: 1 });

    // 2. Fetch existing SalarySlips for (companyId, month, year)
    const slipFilter = { month, year };
    if (companyId) slipFilter.company = companyId;
    const slips = await SalarySlip.find(slipFilter)
      .populate('processedBy', 'name role email');

    const slipMap = {};
    slips.forEach((sl) => {
      slipMap[sl.user.toString()] = sl;
    });

    // 3. Fetch UserSalary configs
    const salaries = await UserSalary.find(companyId ? { company: companyId } : {})
      .populate('salaryStructure', 'name code employmentType');

    const salaryMap = {};
    salaries.forEach((s) => {
      salaryMap[s.user.toString()] = s;
    });

    // 4. Build enriched employee list
    let allRecords = users.map((u) => {
      const uId = u._id.toString();
      const existingSlip = slipMap[uId];
      const salConfig = salaryMap[uId];

      const fixedCTC = salConfig?.fixedCTC || 0;
      const expectedMonthlyGross = fixedCTC > 0 ? Math.round(fixedCTC / 12) : 0;
      const expectedNetPay = salConfig?.netMonthlyTakeHome || expectedMonthlyGross;

      const hasSlip = Boolean(existingSlip);
      const status = existingSlip?.status || 'Pending';
      const grossEarnings = hasSlip ? existingSlip.grossEarnings : expectedMonthlyGross;
      const totalDeductions = hasSlip ? existingSlip.totalDeductions : 0;
      const netPay = hasSlip ? existingSlip.netPay : expectedNetPay;

      return {
        _id: u._id,
        user: {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          designation: u.designation,
          department: u.department,
          profilePicture: u.profilePicture,
        },
        hasSlip,
        slipId: existingSlip?._id || null,
        month,
        year,
        fixedCTC,
        grossEarnings,
        totalDeductions,
        netPay,
        status, // 'Pending', 'In Process', 'Paid', 'On Hold'
        paymentMode: existingSlip?.paymentMode || '',
        paymentDate: existingSlip?.paymentDate || null,
        transactionRef: existingSlip?.transactionRef || '',
        remarks: existingSlip?.remarks || '',
        processedBy: existingSlip?.processedBy || null,
        processedAt: existingSlip?.processedAt || null,
        stats: existingSlip?.stats || null,
        salaryConfigured: Boolean(salConfig && salConfig.fixedCTC > 0),
        salaryStructureName: salConfig?.salaryStructure?.name || null,
      };
    });

    // Filter by status if specified
    if (filterStatus && filterStatus !== 'All') {
      allRecords = allRecords.filter((r) => r.status.toLowerCase() === filterStatus.toLowerCase());
    }

    // Filter by search if specified
    if (search) {
      allRecords = allRecords.filter(
        (r) =>
          r.user.name.toLowerCase().includes(search) ||
          r.user.email.toLowerCase().includes(search) ||
          (r.user.designation || '').toLowerCase().includes(search) ||
          (r.user.department || '').toLowerCase().includes(search) ||
          (r.transactionRef || '').toLowerCase().includes(search)
      );
    }

    // Compute Summary Statistics
    let totalEmployees = allRecords.length;
    let totalPayrollAmount = 0;
    let paidCount = 0;
    let paidAmount = 0;
    let inProcessCount = 0;
    let inProcessAmount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let onHoldCount = 0;
    let onHoldAmount = 0;

    allRecords.forEach((r) => {
      const amt = r.netPay || 0;
      totalPayrollAmount += amt;

      if (r.status === 'Paid') {
        paidCount++;
        paidAmount += amt;
      } else if (r.status === 'In Process') {
        inProcessCount++;
        inProcessAmount += amt;
      } else if (r.status === 'On Hold') {
        onHoldCount++;
        onHoldAmount += amt;
      } else {
        pendingCount++;
        pendingAmount += amt;
      }
    });

    res.json({
      month,
      year,
      summary: {
        totalEmployees,
        totalPayrollAmount,
        paidCount,
        paidAmount,
        inProcessCount,
        inProcessAmount,
        pendingCount,
        pendingAmount,
        onHoldCount,
        onHoldAmount,
      },
      records: allRecords,
    });
  } catch (error) {
    console.error('Error in getSalaryProcessList:', error);
    res.status(500).json({ message: 'Failed to fetch salary processing list', error: error.message });
  }
};

// @desc    Update single employee salary process/payment status
// @route   PATCH /api/payroll/process-status/:userId
// @access  Private (Admin / Accountant / HR)
exports.updateSalaryProcessStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      month,
      year,
      status, // 'Pending', 'In Process', 'Paid', 'On Hold'
      paymentMode,
      paymentDate,
      transactionRef,
      remarks,
    } = req.body;

    const companyId = req.companyId || req.user?.company?._id || req.user?.company;

    let slip = await SalarySlip.findOne({ user: userId, month, year });
    if (!slip) {
      // Auto-generate slip for this user
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      slip = await calculateAndSaveSlipForUser(user, month, year, companyId, status || 'Pending');
    }

    if (!slip) {
      return res.status(400).json({
        message: 'Could not generate salary slip. Please ensure user has a salary structure configured in Salary Management.',
      });
    }

    if (status) slip.status = status;
    if (paymentMode !== undefined) slip.paymentMode = paymentMode;
    if (paymentDate !== undefined) slip.paymentDate = paymentDate ? new Date(paymentDate) : null;
    if (transactionRef !== undefined) slip.transactionRef = (transactionRef || '').trim();
    if (remarks !== undefined) slip.remarks = (remarks || '').trim();

    slip.processedBy = req.user._id;
    slip.processedAt = new Date();

    await slip.save();

    res.json({
      message: `Salary for employee marked as ${slip.status}`,
      slip,
    });
  } catch (error) {
    console.error('Error in updateSalaryProcessStatus:', error);
    res.status(500).json({ message: 'Failed to update salary status', error: error.message });
  }
};

// @desc    Bulk process / disburse salaries for multiple employees
// @route   POST /api/payroll/bulk-process-status
// @access  Private (Admin / Accountant / HR)
exports.bulkUpdateSalaryProcessStatus = async (req, res) => {
  try {
    const {
      userIds = [],
      month,
      year,
      status,
      paymentMode,
      paymentDate,
      transactionRef,
      remarks,
    } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'No employees selected for bulk processing' });
    }

    const companyId = req.companyId || req.user?.company?._id || req.user?.company;
    const updated = [];

    for (const uId of userIds) {
      let slip = await SalarySlip.findOne({ user: uId, month, year });
      if (!slip) {
        const u = await User.findById(uId);
        if (u) {
          slip = await calculateAndSaveSlipForUser(u, month, year, companyId, status || 'Pending');
        }
      }

      if (slip) {
        if (status) slip.status = status;
        if (paymentMode !== undefined) slip.paymentMode = paymentMode;
        if (paymentDate !== undefined) slip.paymentDate = paymentDate ? new Date(paymentDate) : null;
        if (transactionRef !== undefined) slip.transactionRef = (transactionRef || '').trim();
        if (remarks !== undefined) slip.remarks = (remarks || '').trim();

        slip.processedBy = req.user._id;
        slip.processedAt = new Date();
        await slip.save();
        updated.push(slip._id);
      }
    }

    res.json({
      message: `Successfully processed ${updated.length} employee salary records to status '${status}'`,
      processedCount: updated.length,
    });
  } catch (error) {
    console.error('Error in bulkUpdateSalaryProcessStatus:', error);
    res.status(500).json({ message: 'Failed to process bulk salaries', error: error.message });
  }
};

// @desc    Send Salary Slip notification via email to employee
// @route   POST /api/payroll/send-slip-email/:slipId
// @access  Private (Admin / Accountant / HR)
exports.sendSalarySlipEmail = async (req, res) => {
  try {
    const { slipId } = req.params;
    const slip = await SalarySlip.findById(slipId)
      .populate('user', 'name email designation department')
      .populate('company', 'name contactEmail phone address')
      .populate('salaryStructure', 'name');

    if (!slip || !slip.user || !slip.user.email) {
      return res.status(404).json({ message: 'Salary slip or employee email not found' });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[slip.month - 1] || `Month ${slip.month}`;
    const companyName = slip.company?.name || 'Company';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0;">${companyName}</h2>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Official Salary Slip for ${monthName} ${slip.year}</p>
        </div>

        <p style="font-size: 14px; color: #334155;">Dear <strong>${slip.user.name}</strong>,</p>
        <p style="font-size: 13px; color: #475569; line-height: 1.5;">
          Your salary for the month of <strong>${monthName} ${slip.year}</strong> has been processed by the Finance / Accounts department.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Designation / Dept:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${slip.user.designation || 'Staff'} (${slip.user.department || 'General'})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Disbursement Status:</td>
              <td style="padding: 6px 0; color: ${slip.status === 'Paid' ? '#16a34a' : '#d97706'}; font-weight: 700; text-align: right;">${slip.status.toUpperCase()}</td>
            </tr>
            ${slip.paymentMode ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Payment Mode:</td>
              <td style="padding: 6px 0; color: #0f172a; text-align: right;">${slip.paymentMode}</td>
            </tr>` : ''}
            ${slip.transactionRef ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Transaction UTR / Ref:</td>
              <td style="padding: 6px 0; color: #0f172a; font-family: monospace; text-align: right;">${slip.transactionRef}</td>
            </tr>` : ''}
            <tr style="border-top: 1px solid #cbd5e1;">
              <td style="padding: 10px 0 6px 0; color: #64748b;">Gross Earnings:</td>
              <td style="padding: 10px 0 6px 0; color: #0f172a; font-weight: 600; text-align: right;">₹${(slip.grossEarnings || 0).toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Total Deductions:</td>
              <td style="padding: 6px 0; color: #e11d48; font-weight: 600; text-align: right;">- ₹${(slip.totalDeductions || 0).toLocaleString('en-IN')}</td>
            </tr>
            <tr style="border-top: 2px solid #e2e8f0;">
              <td style="padding: 10px 0; font-size: 15px; font-weight: 800; color: #1e293b;">Net Payable Take-Home:</td>
              <td style="padding: 10px 0; font-size: 18px; font-weight: 800; color: #16a34a; text-align: right;">₹${(slip.netPay || 0).toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
          You can log in to your employee portal at any time to download your full detailed salary slip.
        </p>
      </div>
    `;

    await sendEmail(
      slip.user.email,
      `Salary Slip Disbursed: ${monthName} ${slip.year} - ${companyName}`,
      htmlContent,
      { companyId: slip.company?._id || slip.company }
    );

    res.json({ message: `Salary slip email sent to ${slip.user.email}` });
  } catch (error) {
    console.error('Error in sendSalarySlipEmail:', error);
    res.status(500).json({ message: 'Failed to send salary slip email', error: error.message });
  }
};
