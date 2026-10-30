const mongoose = require('mongoose');

const subscriptionPlanSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a plan name'],
      trim: true,
      unique: true,
    },
    price: {
      type: Number,
      required: [true, 'Please add a plan price'],
      default: 0,
    },
    billingCycle: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Yearly'],
      default: 'Monthly',
    },
    maxEmployees: {
      type: Number,
      required: [true, 'Please specify maximum employee limit'],
      default: 20, // 0 for unlimited
    },
    features: {
      type: [String],
      default: [
        'Employee Attendance with Geofencing',
        'Task & Project Management',
        'Dynamic Salary & Payroll Slips',
        'Team Chat & Collaboration',
        'Video Meetings',
        'Performance Analytics'
      ],
    },
    durationDays: {
      type: Number,
      required: true,
      default: 30, // 30 days for monthly, 365 for yearly
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
