const mongoose = require('mongoose');

const projectSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  description: {
    type: String,
  },
  status: {
    type: String,
    enum: ['Planning', 'In Progress', 'On Hold', 'Completed'],
    default: 'Planning',
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
  logo: {
    type: String,
  }
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
