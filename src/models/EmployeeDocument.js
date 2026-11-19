const mongoose = require('mongoose');

const employeeDocumentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true,
    },
    documentType: {
      type: String,
      required: true,
      enum: [
        'Aadhaar Card',
        'PAN Card',
        'Passport',
        'Driving License',
        'Voter ID',
        'Degree / Diploma Certificate',
        '10th / 12th Marksheet',
        'Previous Company Offer Letter',
        'Previous Experience Letter',
        'Previous Relieving Letter',
        'Previous Salary Slips',
        'Bank Passbook / Cancelled Cheque',
        'Resume / CV',
        'Address Proof / Electricity Bill',
        'Medical Certificate',
        'Other Document',
      ],
      default: 'Other Document',
    },
    customTitle: {
      type: String,
      trim: true,
      default: '',
    },
    documentNumber: {
      type: String,
      trim: true,
      default: '',
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
      default: '',
    },
    fileType: {
      type: String,
      default: 'application/octet-stream',
    },
    fileSize: {
      type: Number,
      default: 0, // in bytes
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    expiryDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful index for fast queries by company, user, and status
employeeDocumentSchema.index({ company: 1, user: 1, status: 1 });

module.exports = mongoose.model('EmployeeDocument', employeeDocumentSchema);
