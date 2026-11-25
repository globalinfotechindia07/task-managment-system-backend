const mongoose = require('mongoose');

const taskSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  sprint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint',
    default: null,
  },
  sprintDay: {
    type: Number,
    default: null,
  },
  scheduledDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'On Hold', 'Awaiting Approval'],
    default: 'Pending',
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  dueDate: {
    type: Date,
  },
  startDate: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  estimatedTimeDuration: {
    type: Number, // In hours
  },
  targetDurationMinutes: {
    type: Number,
    default: 0,
  },
  timeTrackingMode: {
    type: String,
    enum: ['stopwatch', 'timeline'],
    default: 'stopwatch',
  },
  isTimerRequired: {
    type: Boolean,
    default: true,
  },
  isDemoBaseline: {
    type: Boolean,
    default: false,
  },
  totalLoggedSeconds: {
    type: Number,
    default: 0,
  },
  activeTimeSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeSession',
    default: null,
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Normal'],
    default: 'Normal',
  },
  attachments: [{
    type: String // URL or path to file
  }],
  comments: [{
    text: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: { type: String, required: true }, // e.g., 'Status updated to In Progress', 'Priority changed to High'
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  reports: [{
    description: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
