const mongoose = require('mongoose');

const userSalarySchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  baseLPA: {
    type: Number,
    required: true,
    default: 0
  },
  pfDeduction: {
    type: Number,
    required: true,
    default: 0 // Monthly PF amount
  },
  professionalTax: {
    type: Number,
    required: true,
    default: 0 // Monthly PT amount
  }
}, { timestamps: true });

module.exports = mongoose.model('UserSalary', userSalarySchema);
