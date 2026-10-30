const mongoose = require('mongoose');

const actionPermissionSchema = {
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false }
};

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null // null for system default templates
  },
  isSystemRole: {
    type: Boolean,
    default: false
  },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Compound unique index for role name per company
roleSchema.index({ name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
