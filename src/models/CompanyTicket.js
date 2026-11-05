const mongoose = require('mongoose');

const companyTicketMessageSchema = new mongoose.Schema(
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
    senderAvatar: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    attachments: [mongoose.Schema.Types.Mixed],
    isInternalNote: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const companyTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      default: '',
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    creatorName: {
      type: String,
      required: true,
    },
    creatorEmail: {
      type: String,
      default: '',
    },
    creatorRole: {
      type: String,
      default: '',
    },
    creatorDepartment: {
      type: String,
      default: '',
    },
    creatorDesignation: {
      type: String,
      default: '',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedToName: {
      type: String,
      default: '',
    },
    assignedToEmail: {
      type: String,
      default: '',
    },
    assignedToRole: {
      type: String,
      default: '',
    },
    assignedToDepartment: {
      type: String,
      default: '',
    },
    assignedToDesignation: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject for the ticket'],
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Hardware Issue',
        'Internet & Network',
        'Software & Tools',
        'Account & Access',
        'Facilities & Office',
        'HR & Admin',
        'Other Internal Issue',
      ],
      default: 'Hardware Issue',
      index: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Waiting on User', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide problem details in description'],
    },
    attachments: [mongoose.Schema.Types.Mixed],
    resolutionNotes: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedByName: {
      type: String,
      default: '',
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    closedByName: {
      type: String,
      default: '',
    },
    messages: [companyTicketMessageSchema],
    activityLog: [
      {
        action: {
          type: String,
          required: true,
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        performedByName: {
          type: String,
          default: '',
        },
        details: {
          type: String,
          default: '',
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

companyTicketSchema.index({ company: 1, createdAt: -1 });
companyTicketSchema.index({ company: 1, status: 1 });
companyTicketSchema.index({ company: 1, assignedTo: 1 });
companyTicketSchema.index({ company: 1, creator: 1 });

module.exports = mongoose.model('CompanyTicket', companyTicketSchema);

