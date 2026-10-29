const mongoose = require('mongoose');

const salarySlipSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: Number, // 1-12
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  fixedCTC: { type: Number, default: 0 },
  earnings: {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    exGratia: { type: Number, default: 0 },
    splAllowance: { type: Number, default: 0 }
  },
  deductions: {
    pf: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    labourWelfareFund: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    welfareFund: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 }
  },
  employerContributions: {
    pf: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    labourWelfareFund: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 }
  },
  grossEarnings: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalEmployerContributions: { type: Number, default: 0 },
  netPay: {
    type: Number,
    required: true
  },
  stats: {
    totalDays: Number,
    workingDays: Number,
    presentDays: Number,
    lateDays: Number,
    absentDays: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('SalarySlip', salarySlipSchema);
