const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderRole: {
      type: String,
      required: true,
    },
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    attachments: [mongoose.Schema.Types.Mixed],
  },
  {
    timestamps: true,
  }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject for the ticket'],
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Billing & Plans',
        'Attendance & Geofencing',
        'Payroll & Salary',
        'Tasks & Projects',
        'Technical Bug / Error',
        'User Management',
        'Feature Request',
        'Other'
      ],
      default: 'Technical Bug / Error',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide problem details in description'],
    },
    attachments: [mongoose.Schema.Types.Mixed],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: '',
    },
    userEmail: {
      type: String,
      default: '',
    },
    userRole: {
      type: String,
      default: '',
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true,
    },
    companyName: {
      type: String,
      default: 'Global System',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolutionNotes: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    messages: [ticketMessageSchema],
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ company: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);

