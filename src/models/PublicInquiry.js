const mongoose = require('mongoose');

const publicInquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your full name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email address'],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    subject: {
      type: String,
      trim: true,
      default: 'General Enterprise Inquiry',
    },
    message: {
      type: String,
      required: [true, 'Please write your message'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['unread', 'read', 'contacted', 'resolved', 'archived'],
      default: 'unread',
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    respondedAt: {
      type: Date,
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PublicInquiry', publicInquirySchema);

