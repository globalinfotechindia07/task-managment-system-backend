const mongoose = require('mongoose');

const externalAppointmentSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      trim: true,
      index: true,
    },
    appointmentId: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    mobile: {
      type: String,
      trim: true,
    },
    service: {
      type: String,
      trim: true,
      default: 'General Consultation',
    },
    appointmentDate: {
      type: String,
      default: '',
    },
    appointmentTime: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'],
      default: 'pending',
      index: true,
    },
    source: {
      type: String,
      default: 'Official Website API',
    },
    externalCreatedAt: {
      type: String,
      default: '',
    },
    internalNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index so same appointment ID is not duplicated for the same company
externalAppointmentSchema.index({ company: 1, appointmentId: 1 }, { sparse: true });
externalAppointmentSchema.index({ company: 1, externalId: 1 }, { sparse: true });

module.exports = mongoose.model('ExternalAppointment', externalAppointmentSchema);

