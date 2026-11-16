const mongoose = require('mongoose');

const leavePolicySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    defaultPaidLeave: {
      type: Number,
      required: true,
      default: 15, // Standard 15 Paid Leaves per year
      min: 0,
    },
    defaultSickLeave: {
      type: Number,
      required: true,
      default: 10, // Standard 10 Sick Leaves per year
      min: 0,
    },
    defaultCasualLeave: {
      type: Number,
      required: true,
      default: 8, // Standard 8 Casual Leaves per year
      min: 0,
    },
    maxCarryForward: {
      type: Number,
      required: true,
      default: 10, // Max carry forward leaves to next year
      min: 0,
    },
    allowHalfDay: {
      type: Boolean,
      default: true, // Allow 1st half and 2nd half leaves
    },
    carryForwardAllowed: {
      type: Boolean,
      default: true,
    },
    requireReason: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);

