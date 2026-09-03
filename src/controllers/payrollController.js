const UserSalary = require('../models/UserSalary');
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const User = require('../models/User');

exports.getConfig = async (req, res) => {
  try {
    let config = await UserSalary.findOne({ user: req.params.userId });
    if (!config) {
      config = { baseLPA: 0, pfDeduction: 0, professionalTax: 0 };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { userId, baseLPA, pfDeduction, professionalTax } = req.body;
    let config = await UserSalary.findOne({ user: userId });
    
    if (config) {
      config.baseLPA = baseLPA;
      config.pfDeduction = pfDeduction;
      config.professionalTax = professionalTax;
      await config.save();
    } else {
      config = await UserSalary.create({
        user: userId,
        baseLPA,
        pfDeduction,
        professionalTax
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
      if (!config || config.baseLPA === 0) continue; // Skip if no salary config

      const monthlyGross = config.baseLPA / 12;

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

      const workingDaysInMonth = 22; // Assume 22 for now, can be calculated precisely based on policy.workingDays

      // Calculate Late Deductions
      let lateDeductionAmount = 0;
      if (lateDays > policy.allowedLateMarks) {
        const excessLateDays = lateDays - policy.allowedLateMarks;
        const perDaySalary = monthlyGross / workingDaysInMonth;
        lateDeductionAmount = excessLateDays * perDaySalary;
      }

      // Calculate Net Pay
      const totalDeductions = config.pfDeduction + config.professionalTax + lateDeductionAmount;
      const netPay = monthlyGross - totalDeductions;

      // Create or update Slip
      let slip = await SalarySlip.findOne({ user: user._id, month, year });
      const slipData = {
        user: user._id,
        month,
        year,
        grossSalary: monthlyGross,
        deductions: {
          pf: config.pfDeduction,
          pt: config.professionalTax,
          lateDeduction: lateDeductionAmount,
          other: 0
        },
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
