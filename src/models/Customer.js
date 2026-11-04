const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
      default: 'General',
    },
    website: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    totalSpend: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Lead Converted', 'Inactive', 'VIP'],
      default: 'Active',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);

