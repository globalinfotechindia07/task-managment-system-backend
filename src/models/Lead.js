const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Lead contact person name is required'],
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    value: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
      default: 'New',
      index: true,
    },
    source: {
      type: String,
      enum: [
        'Website',
        'LinkedIn',
        'Referral',
        'Cold Call',
        'Google Ads',
        'Social Media',
        'Email Campaign',
        'Walk-In',
        'Other',
      ],
      default: 'Website',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    followUpDate: {
      type: Date,
    },
    convertedToDeal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
    convertedToCustomer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    isConverted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);

