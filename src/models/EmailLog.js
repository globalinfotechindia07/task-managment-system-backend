const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
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
