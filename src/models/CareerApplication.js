const mongoose = require('mongoose');

const careerApplicationSchema = new mongoose.Schema(
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
    applicationId: {
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
    position: {
      type: String,
      trim: true,
      default: 'General Position',
      index: true,
    },
    experience: {
      type: String,
      trim: true,
      default: '',
    },
    currentLocation: {
      type: String,
      trim: true,
      default: '',
    },
    currentCtc: {
      type: String,
      trim: true,
      default: '',
    },
    expectedCtc: {
      type: String,
      trim: true,
      default: '',
    },
    noticePeriod: {
      type: String,
      trim: true,
      default: '',
    },
    resumeUrl: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['received', 'under_review', 'shortlisted', 'interview_scheduled', 'rejected', 'hired'],
      default: 'received',
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
  },
  { timestamps: true }
);

careerApplicationSchema.index({ company: 1, applicationId: 1 }, { sparse: true });
careerApplicationSchema.index({ company: 1, externalId: 1 }, { sparse: true });

module.exports = mongoose.model('CareerApplication', careerApplicationSchema);

