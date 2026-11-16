const mongoose = require('mongoose');

const settingsSchema = mongoose.Schema({
  roles: {
    type: [String],
    default: ['Admin', 'Team Head', 'HR Manager', 'Accountant', 'User']
  },
  designations: {
    type: [String],
    default: ['System Administrator', 'HR Manager', 'Accountant', 'Project Manager', 'Frontend Developer', 'Backend Developer']
  },
  departments: {
    type: [String],
    default: ['IT', 'HR', 'Marketing', 'Sales', 'Finance']
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
