const mongoose = require('mongoose');

const attendanceSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true
  },
  punchIn: {
    type: Date,
    required: true
  },
  punchOut: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Half Day', 'Absent'],
    default: 'Present'
  },
  punchInLocation: {
    latitude: Number,
    longitude: Number
  },
  punchInPhoto: {
    type: String // URL of the captured selfie
  }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
