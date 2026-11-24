const mongoose = require('mongoose');

const pauseEventSchema = new mongoose.Schema(
  {
    pausedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    resumedAt: {
      type: Date,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const timelineItemSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    type: {
      type: String,
      enum: ['start', 'pause', 'resume', 'milestone', 'end'],
      required: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    elapsedSecondsAtMoment: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const timeSessionSchema = new mongoose.Schema(
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
    taskTitle: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    projectName: {
      type: String,
      trim: true,
      default: '',
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    mode: {
      type: String,
      enum: ['stopwatch', 'timeline'],
      default: 'stopwatch',
    },
    targetDurationMinutes: {
      type: Number,
      default: 0, // 0 = open ended stopwatch
    },
    targetEndTime: {
      type: Date,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    endTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['running', 'paused', 'completed', 'cancelled'],
      default: 'running',
      index: true,
    },
    currentPauseReason: {
      type: String,
      default: '',
      trim: true,
    },
    pauses: [pauseEventSchema],
    timeline: [timelineItemSchema],
    totalDurationSeconds: {
      type: Number,
      default: 0,
    },
    totalPauseSeconds: {
      type: Number,
      default: 0,
    },
    productiveDurationSeconds: {
      type: Number,
      default: 0,
    },
    completionNotes: {
      type: String,
      trim: true,
      default: '',
    },
    notificationsSent: {
      type: [String], // Array of keys, e.g. 'milestone-30', 'milestone-60', 'target-reached', 'pause-15m'
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for real-time active duration calculation
timeSessionSchema.methods.calculateCurrentMetrics = function () {
  const now = new Date();
  const start = new Date(this.startTime);

  // Calculate total pause seconds
  let completedPauseSeconds = 0;
  let activePauseSeconds = 0;

  if (Array.isArray(this.pauses)) {
    this.pauses.forEach((p) => {
      if (p.resumedAt) {
        completedPauseSeconds += p.durationSeconds || Math.max(0, Math.floor((new Date(p.resumedAt) - new Date(p.pausedAt)) / 1000));
      } else if (this.status === 'paused') {
        activePauseSeconds = Math.max(0, Math.floor((now - new Date(p.pausedAt)) / 1000));
      }
    });
  }

  const totalPauses = completedPauseSeconds + activePauseSeconds;
  const currentTotal = this.endTime
    ? Math.max(0, Math.floor((new Date(this.endTime) - start) / 1000))
    : Math.max(0, Math.floor((now - start) / 1000));

  const productive = Math.max(0, currentTotal - totalPauses);

  return {
    totalDurationSeconds: currentTotal,
    totalPauseSeconds: totalPauses,
    productiveDurationSeconds: productive,
    activePauseSeconds,
  };
};

module.exports = mongoose.model('TimeSession', timeSessionSchema);
