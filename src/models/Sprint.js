const mongoose = require('mongoose');

const sprintSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required for a Sprint'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Sprint name is required'],
      trim: true,
    },
    sprintNumber: {
      type: Number,
      default: 1,
    },
    goal: {
      type: String,
      trim: true,
      default: '',
    },
    startDate: {
      type: Date,
      required: [true, 'Sprint start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Sprint end date is required'],
    },
    status: {
      type: String,
      enum: ['Planned', 'Active', 'Completed', 'Cancelled'],
      default: 'Planned',
      index: true,
    },
    totalDurationDays: {
      type: Number,
      default: 14,
    },
    targetHours: {
      type: Number,
      default: 0,
    },
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Pre-save to calculate totalDurationDays if dates are provided
sprintSchema.pre('save', function () {
  if (this.startDate && this.endDate) {
    const diffTime = Math.abs(new Date(this.endDate) - new Date(this.startDate));
    this.totalDurationDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }
});

module.exports = mongoose.model('Sprint', sprintSchema);

