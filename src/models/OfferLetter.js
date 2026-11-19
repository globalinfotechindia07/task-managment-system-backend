const mongoose = require('mongoose');

const offerLetterSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    offerNumber: {
      type: String,
      required: true,
      trim: true,
    },
    // Candidate details
    candidateName: {
      type: String,
      required: [true, 'Please add candidate name'],
      trim: true,
    },
    candidateEmail: {
      type: String,
      required: [true, 'Please add candidate email'],
      trim: true,
      lowercase: true,
    },
    candidatePhone: {
      type: String,
      default: '',
      trim: true,
    },
    candidateAddress: {
      type: String,
      default: '',
      trim: true,
    },
    // Position details
    designation: {
      type: String,
      required: [true, 'Please add designation/job title'],
      trim: true,
    },
    department: {
      type: String,
      default: 'General',
      trim: true,
    },
    employmentType: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Intern', 'Contract', 'Consultant'],
      default: 'Full-Time',
    },
    workLocation: {
      type: String,
      default: 'Headquarters / On-site',
      trim: true,
    },
    joiningDate: {
      type: Date,
      required: [true, 'Please specify joining date'],
    },
    expiryDate: {
      type: Date, // validity of offer
    },
    probationPeriodMonths: {
      type: Number,
      default: 3,
    },
    // Compensation Details
    salaryStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryStructure',
    },
    annualCTC: {
      type: Number,
      required: true,
      default: 0,
    },
    monthlyGross: {
      type: Number,
      default: 0,
    },
    netMonthlyTakeHome: {
      type: Number,
      default: 0,
    },
    salaryBreakup: [
      {
        name: { type: String, required: true },
        type: { type: String, enum: ['Earning', 'Deduction', 'EmployerContribution'], default: 'Earning' },
        calculationType: { type: String, default: 'Fixed' },
        value: { type: Number, default: 0 },
        monthlyAmount: { type: Number, default: 0 },
        annualAmount: { type: Number, default: 0 },
      },
    ],
    // Terms & conditions clauses
    termsAndConditions: {
      type: String,
      default: '',
    },
    customNotes: {
      type: String,
      default: '',
    },
    // Letterhead template settings
    useLetterhead: {
      type: Boolean,
      default: true,
    },
    includeSignAndSeal: {
      type: Boolean,
      default: true,
    },
    // Status & Tracking
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Revoked'],
      default: 'Draft',
      index: true,
    },
    sentAt: {
      type: Date,
    },
    respondedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying by company and status
offerLetterSchema.index({ company: 1, status: 1 });
offerLetterSchema.index({ company: 1, offerNumber: 1 });

module.exports = mongoose.model('OfferLetter', offerLetterSchema);
