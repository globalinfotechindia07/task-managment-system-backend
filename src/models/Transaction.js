const mongoose = require('mongoose');

const transactionSchema = mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
    },
    planName: {
      type: String,
      required: true,
    },
    billingCycle: {
      type: String,
      default: 'monthly',
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    paymentGateway: {
      type: String,
      default: 'Razorpay',
    },
    paymentId: {
      type: String,
      default: '',
    },
    orderId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Success', 'Pending', 'Failed', 'Refunded'],
      default: 'Success',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
