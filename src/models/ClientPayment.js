const mongoose = require('mongoose');

const clientPaymentSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    receiptNumber: {
      type: String,
      required: [true, 'Receipt voucher number is required'],
      trim: true,
      uppercase: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientInvoice',
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientCompany: {
      type: String,
      trim: true,
      default: '',
    },
    amountPaid: {
      type: Number,
      required: [true, 'Amount paid is required'],
      min: 0.01,
    },
    tdsAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    netReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: [
        'Bank Transfer / NEFT',
        'RTGS',
        'IMPS',
        'UPI / QR Code',
        'Cheque',
        'Credit / Debit Card',
        'Cash',
        'Wire Transfer',
        'Other',
      ],
      default: 'Bank Transfer / NEFT',
    },
    paymentReference: {
      type: String,
      trim: true,
      default: '', // UTR Number / Cheque # / Transaction ID
    },
    depositedToAccount: {
      type: String,
      trim: true,
      default: 'Primary Bank Account',
    },
    chequeDate: {
      type: Date,
      default: null,
    },
    chequeClearanceStatus: {
      type: String,
      enum: ['N/A', 'Uncleared', 'Cleared', 'Bounced'],
      default: 'N/A',
    },
    notes: {
      type: String,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recordedByName: {
      type: String,
      default: 'Accountant',
    },
  },
  { timestamps: true }
);

// Compound index for receiptNumber uniqueness within a company
clientPaymentSchema.index({ company: 1, receiptNumber: 1 }, { unique: true });

module.exports = mongoose.model('ClientPayment', clientPaymentSchema);

