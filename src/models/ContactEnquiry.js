const mongoose = require('mongoose');

const contactEnquirySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    mobile: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
      default: 'General Enquiry',
    },
    message: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'in_progress', 'resolved', 'spam'],
      default: 'pending',
      index: true,
    },
    source: {
      type: String,
      default: 'Official Website API',
    },
    externalCreatedAt: {
      type: String,
      default: '',
    },
    internalNotes: {
      type: String,
      default: '',
    },
    convertedToLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
  },
  { timestamps: true }
);

// Compound index so same external ID is not duplicated for the same company
contactEnquirySchema.index({ company: 1, externalId: 1 }, { sparse: true });

module.exports = mongoose.model('ContactEnquiry', contactEnquirySchema);

