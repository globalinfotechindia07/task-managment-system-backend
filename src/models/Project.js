const mongoose = require('mongoose');

const billingMilestoneSchema = new mongoose.Schema(
  {
    milestoneNumber: {
      type: Number,
      default: 1,
    },
    title: {
      type: String,
      required: [true, 'Milestone title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Milestone amount is required'],
      default: 0,
      min: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Partially Paid', 'Overdue', 'Cancelled'],
      default: 'Pending',
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAt: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      default: '', // 'Bank Transfer', 'UPI', 'Card', 'Cheque', 'Cash', 'Razorpay'
    },
    paymentReference: {
      type: String,
      default: '', // UTR / Transaction Ref / Cheque #
      trim: true,
    },
    invoiceNumber: {
      type: String,
      default: '',
      trim: true,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const deliverableSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
    completedAt: {
      type: Date,
    },
    link: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Planning', 'In Progress', 'On Hold', 'Completed'],
      default: 'Planning',
      index: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    logo: {
      type: String,
      default: '',
    },

    // Client Association & Contact
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    clientName: {
      type: String,
      default: '',
      trim: true,
    },
    clientEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      index: true,
    },
    clientPhone: {
      type: String,
      default: '',
      trim: true,
    },
    clientCompany: {
      type: String,
      default: '',
      trim: true,
    },

    // Financials & Budget
    budget: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },

    // Progress & Delivery
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    liveUrl: {
      type: String,
      default: '',
      trim: true,
    },
    stagingUrl: {
      type: String,
      default: '',
      trim: true,
    },
    githubRepo: {
      type: String,
      default: '',
      trim: true,
    },

    // Internal Team Lead / Project Manager
    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    projectManagerName: {
      type: String,
      default: '',
    },

    // Billing Milestones & Invoices
    billingMilestones: [billingMilestoneSchema],

    // Client Deliverables Checklist
    deliverables: [deliverableSchema],
  },
  { timestamps: true }
);

projectSchema.index({ company: 1, createdAt: -1 });
projectSchema.index({ company: 1, client: 1 });

module.exports = mongoose.model('Project', projectSchema);
