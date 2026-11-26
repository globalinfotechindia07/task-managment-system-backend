const mongoose = require('mongoose');

const documentRequirementSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isMandatory: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const templatePageSchema = new mongoose.Schema(
  {
    pageNumber: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const agreementTemplateSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    template_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    webUserPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActiveForWebUsers: {
      type: Boolean,
      default: false,
    },
    document_requirements: [documentRequirementSchema],
    pages: [templatePageSchema],
    body: {
      type: String,
      default: '',
    },
    variables: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    mode: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
    },
    externalSynced: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index so template_id is unique per company
agreementTemplateSchema.index({ company: 1, template_id: 1 }, { unique: true });

module.exports = mongoose.model('AgreementTemplate', agreementTemplateSchema);
