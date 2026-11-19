const mongoose = require('mongoose');

const attendanceSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  date: {
    type: String, 
    required: true
  },
  punchIn: {
    type: Date,
    required: false
  },
  punchOut: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Half Day', 'Absent', 'On Leave'],
    default: 'Present'
  },
  lateByMinutes: {
    type: Number,
    default: 0
  },
  punchInLocation: {
    latitude: Number,
    longitude: Number
  },
  punchInPhoto: {
    type: String // URL of the captured selfie
  },
  punchOutPhoto: {
    type: String // URL of the captured selfie
  },
  isManuallyEdited: {
    type: Boolean,
    default: false
  },
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastEditedAt: {
    type: Date
  },
  editRemarks: {
    type: String,
    default: ''
  },
  editHistory: [
    {
      editedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      editedAt: {
        type: Date,
        default: Date.now
      },
      reason: {
        type: String,
        default: ''
      },
      previousState: {
        status: String,
        punchIn: Date,
        punchOut: Date
      },
      newState: {
        status: String,
        punchIn: Date,
        punchOut: Date
      }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
