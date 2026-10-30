const mongoose = require('mongoose');

const companySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a company/office name'],
      trim: true,
    },
    companyCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    industry: {
      type: String,
      default: 'Information Technology',
    },
    location: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: '',
    },
    registrationNumber: {
      type: String,
      default: '',
      trim: true,
    },
    gstNumber: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    employeeSize: {
      type: String,
      default: '1-15',
    },
    paymentDetails: {
      orderId: { type: String, default: '' },
      paymentId: { type: String, default: '' },
      amount: { type: Number, default: 0 },
      method: { type: String, default: 'Razorpay' },
      paidAt: { type: Date }
    },
    logo: {
      type: String,
      default: '',
    },
    adminUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    subscription: {
      plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
      },
      planName: {
        type: String,
        default: 'Free Trial',
      },
      status: {
        type: String,
        enum: ['Active', 'Trial', 'Expired', 'Suspended'],
        default: 'Trial',
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      endDate: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days trial
      },
      maxEmployees: {
        type: Number,
        default: 20,
      },
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Suspended'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate companyCode if not provided
companySchema.pre('save', function () {
  if (!this.companyCode) {
    const slug = (this.name || 'COMP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    this.companyCode = `${slug}-${random}`;
  }
});

module.exports = mongoose.model('Company', companySchema);
