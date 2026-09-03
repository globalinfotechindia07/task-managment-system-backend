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
  grossSalary: {
    type: Number, // Monthly gross
    required: true
  },
  deductions: {
    pf: { type: Number, default: 0 },
    pt: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 }, // Value deducted for excessive late marks
    other: { type: Number, default: 0 }
  },
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
