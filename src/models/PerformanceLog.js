const mongoose = require('mongoose');

const performanceLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date,
    required: true
  },
  daysLate: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: ['OnTime', 'Late'],
    required: true
  },
  month: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('PerformanceLog', performanceLogSchema);
