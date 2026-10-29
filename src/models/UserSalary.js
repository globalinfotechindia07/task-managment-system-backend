const mongoose = require('mongoose');

const userSalarySchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  fixedCTC: {
    type: Number,
    required: true,
    default: 0
  },
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
    welfareFund: { type: Number, default: 0 }
  },
  employerContributions: {
    pf: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    labourWelfareFund: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('UserSalary', userSalarySchema);
