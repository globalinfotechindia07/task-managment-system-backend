const mongoose = require('mongoose');

const partySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      default: 'Signer',
      trim: true,
    },
  },
  { _id: false }
);

const supportingDocSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const signingDetailsSchema = new mongoose.Schema(
  {
    verification_method: {
      type: String,
      default: 'Aadhaar eSign (Simulated Sandbox)',
    },
    signed_at: {
      type: Date,
      default: null,
    },
    signer_ip: {
      type: String,
      default: '',
    },
    certificate_validity: {
      type: String,
      default: 'Valid (Sandbox Simulation)',
    },
  },
  { _id: false }
);

const agreementSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgreementTemplate',
      default: null,
    },
    template_id: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    agreement_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    signer_name: {
      type: String,
      default: '',
      trim: true,
    },
    variable_data: {
      type: Map,
      of: String,
      default: {},
    },
    parties: [partySchema],
    supporting_documents: [supportingDocSchema],
    addEStamp: {
      type: Boolean,
      default: false,
    },
    amount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Draft', 'Initiated', 'Pending Sign', 'Signed', 'Rejected', 'Expired'],
      default: 'Initiated',
      index: true,
    },
    document_url: {
      type: String,
      default: '',
    },
    content_preview: {
      type: String,
      default: '',
    },
    signing_details: signingDetailsSchema,
    environment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Agreement', agreementSchema);
