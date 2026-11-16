const mongoose = require('mongoose');

const leaveCategoryBalanceSchema = new mongoose.Schema(
  {
    total: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    used: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const userLeaveBalanceSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
      index: true,
    },
    paidLeave: {
      type: leaveCategoryBalanceSchema,
      default: () => ({ total: 15, used: 0 }),
    },
    sickLeave: {
      type: leaveCategoryBalanceSchema,
      default: () => ({ total: 10, used: 0 }),
    },
    casualLeave: {
      type: leaveCategoryBalanceSchema,
      default: () => ({ total: 8, used: 0 }),
    },
    carryForward: {
      fromPreviousYear: {
        type: Number,
        default: 0,
        min: 0,
      },
      used: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    unpaidLeaveUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index to guarantee one balance record per user per year in a company
userLeaveBalanceSchema.index({ company: 1, user: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('UserLeaveBalance', userLeaveBalanceSchema);

