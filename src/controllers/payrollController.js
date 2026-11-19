const UserSalary = require('../models/UserSalary');
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const User = require('../models/User');

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
