const mongoose = require('mongoose');

const stickyNoteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Please add note content'],
      trim: true,
    },
    color: {
      type: String,
      enum: ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'teal', 'white'],
      default: 'yellow',
    },
    fontStyle: {
      type: String,
      enum: ['caveat', 'kalam', 'typewriter', 'playfair', 'quicksand'],
      default: 'caveat',
    },
    textColor: {
      type: String,
      default: '',
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    reminderAt: {
      type: Date,
      default: null,
      index: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    sendEmailReminder: {
      type: Boolean,
      default: true,
    },
    sendInAppReminder: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for high performance reminder lookup and user notes list
stickyNoteSchema.index({ user: 1, isArchived: 1, isPinned: -1, createdAt: -1 });
stickyNoteSchema.index({ reminderAt: 1, reminderSent: 1, isCompleted: 1 });

module.exports = mongoose.model('StickyNote', stickyNoteSchema);
