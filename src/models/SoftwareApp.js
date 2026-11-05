const mongoose = require('mongoose');
const crypto = require('crypto');

const softwareAppSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    softwareId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a software name'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Web Application',
        'Mobile App (Android/iOS)',
        'Desktop ERP',
        'SaaS Platform',
        'API & Microservice',
        'E-Commerce & Portal',
        'Custom Software',
      ],
      default: 'Web Application',
    },
    platform: {
      type: String,
      default: 'Web & Cloud',
    },
    apiKey: {
      type: String,
      unique: true,
      index: true,
      default: () => 'swk_' + crypto.randomBytes(16).toString('hex'),
    },
    status: {
      type: String,
      enum: ['Active', 'Maintenance', 'Deprecated'],
      default: 'Active',
      index: true,
    },
    assignedLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedLeadName: {
      type: String,
      default: '',
    },
    webhookUrl: {
      type: String,
      default: '',
      trim: true,
    },
    ticketsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

softwareAppSchema.index({ company: 1, softwareId: 1 }, { unique: true });

module.exports = mongoose.model('SoftwareApp', softwareAppSchema);

