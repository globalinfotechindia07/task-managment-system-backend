const UserSalary = require('../models/UserSalary');
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const User = require('../models/User');

exports.getConfig = async (req, res) => {
  try {
    let config = await UserSalary.findOne({ user: req.params.userId });
    if (!config) {
      config = { 
        fixedCTC: 0,
        earnings: { basic: 0, hra: 0, exGratia: 0, splAllowance: 0 },
        deductions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0, welfareFund: 0 },
        employerContributions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0 }
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyConfig = async (req, res) => {
  try {
    let config = await UserSalary.findOne({ user: req.user._id });
    if (!config) {
      config = { 
        fixedCTC: 0,
        earnings: { basic: 0, hra: 0, exGratia: 0, splAllowance: 0 },
        deductions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0, welfareFund: 0 },
        employerContributions: { pf: 0, esic: 0, labourWelfareFund: 0, professionalTax: 0 }
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { userId, fixedCTC, earnings, deductions, employerContributions } = req.body;
    let config = await UserSalary.findOne({ user: userId });
    
    if (config) {
      config.fixedCTC = fixedCTC || 0;
      config.earnings = earnings || {};
      config.deductions = deductions || {};
      config.employerContributions = employerContributions || {};
      await config.save();
    } else {
      config = await UserSalary.create({
        user: userId,
        fixedCTC,
        earnings,
        deductions,
        employerContributions
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
    
    // Get all users who have salary config
    const users = await User.find({ role: { $ne: 'Admin' } });
    const policy = await AttendancePolicy.findOne() || { allowedLateMarks: 3 };
    
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
      const grossEarnings = (e.basic || 0) + (e.hra || 0) + (e.exGratia || 0) + (e.splAllowance || 0);

      // Calculate Late Deductions
      let lateDeductionAmount = 0;
      if (lateDays > policy.allowedLateMarks) {
        const excessLateDays = lateDays - policy.allowedLateMarks;
        const perDaySalary = grossEarnings / workingDaysInMonth;
        lateDeductionAmount = excessLateDays * perDaySalary;
      }

      // Deductions (B)
      const d = config.deductions || {};
      const totalDeductions = (d.pf || 0) + (d.esic || 0) + (d.labourWelfareFund || 0) + (d.professionalTax || 0) + (d.welfareFund || 0) + lateDeductionAmount;

      // Employer Contributions (C)
      const c = config.employerContributions || {};
      const totalEmployerContributions = (c.pf || 0) + (c.esic || 0) + (c.labourWelfareFund || 0) + (c.professionalTax || 0);

      // Net Pay = A - B
      const netPay = grossEarnings - totalDeductions;

      // Create or update Slip
      let slip = await SalarySlip.findOne({ user: user._id, month, year });
      const slipData = {
        user: user._id,
        month,
        year,
        fixedCTC: config.fixedCTC,
        earnings: e,
        deductions: {
          ...d,
          lateDeduction: lateDeductionAmount
        },
        employerContributions: c,
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
    const slips = await SalarySlip.find({ user: req.user._id }).sort({ year: -1, month: -1 });
    res.json(slips);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllSlips = async (req, res) => {
  try {
    const { month, year } = req.query;
    let filter = {};
    if (month && year) {
      filter = { month: parseInt(month), year: parseInt(year) };
    }
    const slips = await SalarySlip.find(filter)
      .populate('user', 'name email designation department')
      .sort({ year: -1, month: -1 });
    res.json(slips);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
