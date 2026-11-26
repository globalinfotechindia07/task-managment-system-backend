const mongoose = require('mongoose');

const endpointSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE'],
      default: 'GET',
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const envSettingsSchema = new mongoose.Schema(
  {
    apiKey: {
      type: String,
      trim: true,
      default: '',
    },
    baseUrl: {
      type: String,
      trim: true,
      default: 'https://backend.chitraguptccrms.com/api/v1',
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    // The 4 configurable APIs with custom methods & endpoints
    endpoints: {
      fetchTemplates: {
        type: endpointSchema,
        default: () => ({
          name: 'Fetch Templates API',
          method: 'GET',
          url: '',
          description: 'Fetches active agreement templates and requirements',
        }),
      },
      createTemplate: {
        type: endpointSchema,
        default: () => ({
          name: 'Create Template API',
          method: 'POST',
          url: '',
          description: 'Creates or updates agreement templates on gateway',
        }),
      },
      initiateAgreement: {
        type: endpointSchema,
        default: () => ({
          name: 'Initiate Agreement API',
          method: 'POST',
          url: '',
          description: 'Generates agreement with dynamic variables and parties',
        }),
      },
      checkStatus: {
        type: endpointSchema,
        default: () => ({
          name: 'Agreement Status API',
          method: 'GET',
          url: '',
          description: 'Checks digital signature details, eSign audit trail and signed PDF URL',
        }),
      },
    },
    lastTestedAt: {
      type: Date,
      default: null,
    },
    lastTestStatus: {
      type: String,
      enum: ['NEVER_TESTED', 'SUCCESS', 'FAILED'],
      default: 'NEVER_TESTED',
    },
    lastTestMessage: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const agreementConfigSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    // Active environment selected by Admin: sandbox or production
    environment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
    },
    // Global Master Gateway Toggle
    isEnabled: {
      type: Boolean,
      default: false,
    },
    autoSyncTemplates: {
      type: Boolean,
      default: true,
    },
    // Sandbox specific configuration (with its own API key, base URL, and 4 endpoints)
    sandbox: {
      type: envSettingsSchema,
      default: () => ({
        apiKey: '',
        baseUrl: 'https://backend.chitraguptccrms.com/api/v1',
        isEnabled: true,
        endpoints: {
          fetchTemplates: {
            name: 'Fetch Templates API (Sandbox)',
            method: 'GET',
            url: 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/templates',
            description: 'Fetches active agreement templates in sandbox mode',
          },
          createTemplate: {
            name: 'Create Template API (Sandbox)',
            method: 'POST',
            url: 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/templates',
            description: 'Creates or updates templates in sandbox',
          },
          initiateAgreement: {
            name: 'Initiate Agreement API (Sandbox)',
            method: 'POST',
            url: 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/initiate',
            description: 'Generates sandbox simulated agreements with Aadhaar eSign',
          },
          checkStatus: {
            name: 'Agreement Status API (Sandbox)',
            method: 'GET',
            url: 'https://backend.chitraguptccrms.com/api/v1/sandbox/agreements/:agreement_id/status',
            description: 'Retrieves audit details and signed PDF document link',
          },
        },
      }),
    },
    // Production specific configuration (with its own API key, base URL, and 4 endpoints)
    production: {
      type: envSettingsSchema,
      default: () => ({
        apiKey: '',
        baseUrl: 'https://backend.chitraguptccrms.com/api/v1',
        isEnabled: false,
        endpoints: {
          fetchTemplates: {
            name: 'Fetch Templates API (Production)',
            method: 'GET',
            url: 'https://backend.chitraguptccrms.com/api/v1/production/agreements/templates',
            description: 'Fetches legally binding production templates',
          },
          createTemplate: {
            name: 'Create Template API (Production)',
            method: 'POST',
            url: 'https://backend.chitraguptccrms.com/api/v1/production/agreements/templates',
            description: 'Publishes production agreement templates',
          },
          initiateAgreement: {
            name: 'Initiate Agreement API (Production)',
            method: 'POST',
            url: 'https://backend.chitraguptccrms.com/api/v1/production/agreements/initiate',
            description: 'Initiates legally binding Aadhaar eSign agreement',
          },
          checkStatus: {
            name: 'Agreement Status API (Production)',
            method: 'GET',
            url: 'https://backend.chitraguptccrms.com/api/v1/production/agreements/:agreement_id/status',
            description: 'Retrieves legally compliant audit certificate and signed PDF',
          },
        },
      }),
    },
    // Legacy single apiKey for fallback
    apiKey: {
      type: String,
      trim: true,
      default: '',
    },
    baseUrl: {
      type: String,
      trim: true,
      default: 'https://backend.chitraguptccrms.com/api/v1',
    },
    lastTestedAt: {
      type: Date,
      default: null,
    },
    lastTestStatus: {
      type: String,
      enum: ['NEVER_TESTED', 'SUCCESS', 'FAILED'],
      default: 'NEVER_TESTED',
    },
    lastTestMessage: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AgreementConfig', agreementConfigSchema);
