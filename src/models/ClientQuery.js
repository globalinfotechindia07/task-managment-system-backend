const mongoose = require('mongoose');

const clientQuerySchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    projectName: {
      type: String,
      default: '',
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientName: {
      type: String,
      required: true,
    },
    clientEmail: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Query subject is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Query message is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['Progress Update', 'Billing & Invoice', 'Feature / Scope Change', 'Feedback', 'Other'],
      default: 'Progress Update',
    },
    status: {
      type: String,
      enum: ['Open', 'Under Review', 'Answered', 'Closed'],
      default: 'Open',
      index: true,
    },
    response: {
      type: String,
      default: '',
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    respondedByName: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

clientQuerySchema.index({ company: 1, client: 1, createdAt: -1 });

module.exports = mongoose.model('ClientQuery', clientQuerySchema);

