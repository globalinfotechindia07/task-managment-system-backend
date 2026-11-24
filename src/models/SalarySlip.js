const mongoose = require('mongoose');

const salarySlipSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
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
  salaryStructure: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalaryStructure'
  },
  dynamicEarnings: [{
    name: String,
    amount: Number
  }],
  dynamicDeductions: [{
    name: String,
    amount: Number,
    payer: String
  }],
  dynamicEmployerContributions: [{
    name: String,
    amount: Number
  }],
  stats: {
    totalDays: Number,
    workingDays: Number,
    presentDays: Number,
    lateDays: Number,
    absentDays: Number
  },
  status: {
    type: String,
    enum: ['Pending', 'In Process', 'Paid', 'On Hold'],
    default: 'Pending',
    index: true
  },
  paymentMode: {
    type: String,
    default: ''
  },
  paymentDate: {
    type: Date
  },
  transactionRef: {
    type: String,
    trim: true,
    default: ''
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('SalarySlip', salarySlipSchema);
