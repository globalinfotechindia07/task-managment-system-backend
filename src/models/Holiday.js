const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Holiday title is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Holiday date is required'],
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
      index: true,
    },
    type: {
      type: String,
      enum: ['National', 'Festival', 'Company', 'Optional'],
      default: 'Festival',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isOptional: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: {
      type: String,
      default: 'Admin',
    },
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of holiday date per company
holidaySchema.index({ company: 1, date: 1, title: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);

