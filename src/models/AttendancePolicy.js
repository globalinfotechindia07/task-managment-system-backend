const mongoose = require('mongoose');

const attendancePolicySchema = mongoose.Schema({
  officeLatitude: {
    type: Number,
    required: true,
    default: 0
  },
  officeLongitude: {
    type: Number,
    required: true,
    default: 0
  },
  allowedRadiusMeters: {
    type: Number,
    required: true,
    default: 50 // Default 50 meters
  },
  inTime: {
    type: String,
    required: true,
    default: "09:00"
  },
  outTime: {
    type: String,
    required: true,
    default: "18:00"
  },
  bufferMinutes: {
    type: Number,
    required: true,
    default: 15
  },
  allowedLateMarks: {
    type: Number,
    required: true,
    default: 3
  },
  workingDays: {
    type: [String],
    default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  }
}, { timestamps: true });

module.exports = mongoose.model('AttendancePolicy', attendancePolicySchema);
