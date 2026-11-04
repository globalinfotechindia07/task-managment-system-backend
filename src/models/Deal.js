const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Deal title is required'],
      trim: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientCompany: {
      type: String,
      trim: true,
      default: '',
    },
    clientEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    clientPhone: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Deal amount is required'],
      default: 0,
    },
    stage: {
      type: String,
      enum: ['Discovery', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
      default: 'Discovery',
      index: true,
    },
    probability: {
      type: Number,
      default: 20,
    },
    expectedCloseDate: {
      type: Date,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Deal', dealSchema);

