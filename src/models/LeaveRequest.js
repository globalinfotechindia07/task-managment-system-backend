const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: ['Paid Leave', 'Sick Leave', 'Casual Leave', 'Carry Forward Leave', 'Unpaid Leave'],
      required: true,
      default: 'Paid Leave',
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    halfDayType: {
      type: String,
      enum: ['None', 'First Half', 'Second Half'],
      default: 'None',
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
      default: 1,
    },
    reason: {
      type: String,
      required: [true, 'Reason for leave is required'],
      trim: true,
    },
    attachment: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedByName: {
      type: String,
      default: '',
    },
    actionDate: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    deductedCategory: {
      type: String,
      enum: ['paidLeave', 'sickLeave', 'casualLeave', 'carryForward', 'unpaid', 'none'],
      default: 'none',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);

