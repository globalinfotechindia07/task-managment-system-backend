const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Item description is required'],
    trim: true,
  },
  sacHsnCode: {
    type: String,
    trim: true,
    default: '998314', // Default SAC for IT & Software development services
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 0.01,
  },
  unit: {
    type: String,
    trim: true,
    default: 'Milestone',
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  gstRate: {
    type: Number,
    default: 18, // 18% standard GST for IT/software
    min: 0,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
});

const clientInvoiceSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      trim: true,
      uppercase: true,
    },
    invoiceType: {
      type: String,
      enum: ['Tax Invoice', 'Proforma Invoice', 'Commercial Invoice', 'Retainer Invoice'],
      default: 'Tax Invoice',
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    clientCompany: {
      type: String,
      trim: true,
      default: '',
    },
    clientEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    clientPhone: {
      type: String,
      trim: true,
      default: '',
    },
    clientGstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    clientAddress: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    projectName: {
      type: String,
      trim: true,
      default: '',
    },
    milestoneId: {
      type: String,
      default: '',
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    items: [invoiceItemSchema],
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isInterstate: {
      type: Boolean,
      default: false, // If true => IGST, if false => CGST + SGST
    },
    cgstRate: {
      type: Number,
      default: 9,
    },
    cgstAmount: {
      type: Number,
      default: 0,
    },
    sgstRate: {
      type: Number,
      default: 9,
    },
    sgstAmount: {
      type: Number,
      default: 0,
    },
    igstRate: {
      type: Number,
      default: 18,
    },
    igstAmount: {
      type: Number,
      default: 0,
    },
    totalTax: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tdsDeducted: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Sent',
      index: true,
    },
    bankDetails: {
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      branchName: { type: String, default: '' },
      upiId: { type: String, default: '' },
    },
    termsAndConditions: {
      type: String,
      default: '1. Please remit payment by the due date.\n2. Late payments may attract interest as per company policy.\n3. Make all payments in favor of company account specified above.',
    },
    notes: {
      type: String,
      default: 'Thank you for your business.',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: {
      type: String,
      default: 'Accountant',
    },
  },
  { timestamps: true }
);

// Compound index for invoiceNumber uniqueness within a company
clientInvoiceSchema.index({ company: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('ClientInvoice', clientInvoiceSchema);

