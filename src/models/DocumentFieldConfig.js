const mongoose = require('mongoose');

const subFieldSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'select'],
      default: 'text',
    },
    required: {
      type: Boolean,
      default: false,
    },
    validationType: {
      type: String,
      enum: ['any', 'numeric', 'alphanumeric', 'pan', 'aadhaar', 'regex'],
      default: 'any',
    },
    pattern: {
      type: String,
      default: '',
      trim: true,
    },
    minLength: {
      type: Number,
      default: null,
    },
    maxLength: {
      type: Number,
      default: null,
    },
    placeholder: {
      type: String,
      default: '',
      trim: true,
    },
    errorMessage: {
      type: String,
      default: '',
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
  },
  { _id: true }
);

const documentFieldConfigSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Identity Proof', 'Address Proof', 'Academic', 'Experience', 'Financial', 'Other'],
      default: 'Identity Proof',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    subFields: [subFieldSchema],
    fileUpload: {
      enabled: {
        type: Boolean,
        default: true,
      },
      required: {
        type: Boolean,
        default: true,
      },
      allowedFormats: {
        type: [String],
        default: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      },
      maxSizeMB: {
        type: Number,
        default: 10,
      },
      label: {
        type: String,
        default: 'Upload Document / Photo (PDF, PNG, JPG)',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

documentFieldConfigSchema.index({ company: 1, isActive: 1, order: 1 });

module.exports = mongoose.model('DocumentFieldConfig', documentFieldConfigSchema);
