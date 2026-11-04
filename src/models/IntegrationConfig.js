const mongoose = require('mongoose');
const crypto = require('crypto');

const integrationConfigSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    websiteUrl: {
      type: String,
      trim: true,
      default: '',
    },
    contactUsEndpoint: {
      type: String,
      trim: true,
      default: '',
    },
    appointmentsEndpoint: {
      type: String,
      trim: true,
      default: '',
    },
    careersEndpoint: {
      type: String,
      trim: true,
      default: '',
    },
    authType: {
      type: String,
      enum: ['None', 'Bearer Token', 'API Key Header', 'Custom Header'],
      default: 'None',
    },
    authToken: {
      type: String,
      trim: true,
      default: '',
    },
    apiKeyHeaderName: {
      type: String,
      trim: true,
      default: 'Authorization',
    },
    inboundApiKey: {
      type: String,
      unique: true,
      index: true,
      default: () => 'whk_' + crypto.randomBytes(16).toString('hex'),
    },
    autoSyncEnabled: {
      type: Boolean,
      default: true,
    },
    lastSync: {
      contactUs: {
        lastAttemptAt: Date,
        lastSuccessAt: Date,
        status: { type: String, default: 'never_synced' },
        count: { type: Number, default: 0 },
        message: { type: String, default: '' },
      },
      appointments: {
        lastAttemptAt: Date,
        lastSuccessAt: Date,
        status: { type: String, default: 'never_synced' },
        count: { type: Number, default: 0 },
        message: { type: String, default: '' },
      },
      careers: {
        lastAttemptAt: Date,
        lastSuccessAt: Date,
        status: { type: String, default: 'never_synced' },
        count: { type: Number, default: 0 },
        message: { type: String, default: '' },
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IntegrationConfig', integrationConfigSchema);

