const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userName: {
      type: String,
      default: 'System / Anonymous',
    },
    userEmail: {
      type: String,
      default: '',
    },
    userRole: {
      type: String,
      default: 'Guest',
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    companyName: {
      type: String,
      default: 'Global System',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['AUTH', 'WORK', 'ATTENDANCE', 'PAYROLL', 'SYSTEM', 'DATABASE', 'BILLING', 'SUPPORT'],
      default: 'SYSTEM',
      index: true,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'WARNING', 'ERROR'],
      default: 'SUCCESS',
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
    },
    endpoint: {
      type: String,
      default: '',
    },
    method: {
      type: String,
      default: '',
    },
    statusCode: {
      type: Number,
      default: 200,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ company: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });

// MongoDB TTL Index: Automatically purge audit logs older than 7 days (604,800 seconds)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

