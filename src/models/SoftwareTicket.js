const mongoose = require('mongoose');

const softwareTicketMessageSchema = new mongoose.Schema(
  {
    senderType: {
      type: String,
      enum: ['client', 'agent', 'system'],
      default: 'client',
    },
    senderName: {
      type: String,
      required: true,
    },
    senderEmail: {
      type: String,
      default: '',
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

const softwareTicketSchema = new mongoose.Schema(
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
    software: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SoftwareApp',
      required: true,
      index: true,
    },
    softwareId: {
      type: String,
      required: true,
      index: true,
    },
    softwareName: {
      type: String,
      required: true,
    },
    externalTicketId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    clientName: {
      type: String,
      required: [true, 'Client/User name is required'],
      trim: true,
    },
    clientEmail: {
      type: String,
      required: [true, 'Client email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    clientPhone: {
      type: String,
      default: '',
      trim: true,
    },
    clientOrg: {
      type: String,
      default: '',
      trim: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Problem description is required'],
    },
    category: {
      type: String,
      enum: [
        'Bug / Error',
        'Feature Request',
        'Performance / Slow',
        'Data / Calculation Issue',
        'Integration / API',
        'UI / Display Glitch',
        'Billing / Licensing',
        'General Query',
      ],
      default: 'Bug / Error',
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
      enum: ['Open', 'In Progress', 'Waiting on Client', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    appVersion: {
      type: String,
      default: '',
      trim: true,
    },
    environment: {
      type: String,
      enum: ['Production', 'Staging', 'Development', 'Beta', 'Other'],
      default: 'Production',
    },
    deviceInfo: {
      type: String,
      default: '',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
    messages: [softwareTicketMessageSchema],
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

softwareTicketSchema.index({ company: 1, softwareId: 1, createdAt: -1 });
softwareTicketSchema.index({ company: 1, status: 1 });
softwareTicketSchema.index({ company: 1, assignedTo: 1 });
softwareTicketSchema.index({ clientEmail: 1, createdAt: -1 });

module.exports = mongoose.model('SoftwareTicket', softwareTicketSchema);

