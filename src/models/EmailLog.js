const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true,
  },
  from: {
    type: String,
    default: '',
  },
  recipient: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  senderType: {
    type: String,
    enum: ['CompanySMTP', 'GlobalSMTP', 'Fallback'],
    default: 'GlobalSMTP',
  },
  status: {
    type: String,
    enum: ['Sent', 'Failed'],
    required: true,
  },
  error: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', emailLogSchema);
