const mongoose = require('mongoose');

const companySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a company name'],
      trim: true,
    },
    industry: {
      type: String,
      required: [true, 'Please add an industry'],
    },
    location: {
      type: String,
      required: [true, 'Please add a location'],
    },
    employeeCount: {
      type: Number,
      required: [true, 'Please add the number of employees'],
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Company', companySchema);
