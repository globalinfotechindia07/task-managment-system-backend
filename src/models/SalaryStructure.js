const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  key: {
    type: String,
    trim: true,
    lowercase: true,
  },
  type: {
    type: String,
    enum: ['Earning', 'Deduction', 'EmployerContribution'],
    required: true,
    default: 'Earning',
  },
  calculationType: {
    type: String,
    enum: ['PercentageOfBasic', 'PercentageOfCTC', 'Fixed'],
    default: 'Fixed',
  },
  value: {
    type: Number,
    required: true,
    default: 0,
  },
  payer: {
    type: String,
    enum: ['Employee', 'Employer'],
    default: 'Employee',
  },
  isTaxable: {
    type: Boolean,
    default: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
});

const salaryStructureSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    employmentType: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Intern', 'Contract', 'Consultant', 'All'],
      default: 'Full-Time',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    components: [componentSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
