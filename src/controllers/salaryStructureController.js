const SalaryStructure = require('../models/SalaryStructure');
const UserSalary = require('../models/UserSalary');
const Company = require('../models/Company');

// Helper to get company ID from user/request
const getCompanyId = async (req) => {
  if (req.query?.companyId || req.body?.companyId) {
    return req.query.companyId || req.body.companyId;
  }
  const user = req.user;
  const direct = req.companyId || user?.company?._id || user?.company;
  if (direct) return direct;
  if (user?.role === 'Super Admin') {
    const firstCompany = await Company.findOne({ status: 'Active' }).select('_id');
    return firstCompany?._id || null;
  }
  return null;
};

// Seed 3 standard enterprise templates if company has none
const seedDefaultSalaryStructures = async (companyId, userId) => {
  const existingCount = await SalaryStructure.countDocuments({ company: companyId });
  if (existingCount > 0) return;

  const defaults = [
    {
      company: companyId,
      name: 'Full-Time Core Employee Plan',
      code: 'FULL_TIME_CORE',
      description: 'Standard compensation structure with Basic, HRA, Allowances, Employee PF, PT, and Employer PF.',
      employmentType: 'Full-Time',
      isDefault: true,
      status: 'Active',
      createdBy: userId,
      components: [
        {
          name: 'Basic Salary',
          key: 'basic',
          type: 'Earning',
          calculationType: 'PercentageOfCTC',
          value: 50, // 50% of monthly CTC
          payer: 'Employee',
          isTaxable: true,
          description: '50% of monthly gross CTC',
        },
        {
          name: 'House Rent Allowance (HRA)',
          key: 'hra',
          type: 'Earning',
          calculationType: 'PercentageOfBasic',
          value: 40, // 40% of Basic
          payer: 'Employee',
          isTaxable: true,
          description: '40% of Basic Salary',
        },
        {
          name: 'Special Allowance',
          key: 'special_allowance',
          type: 'Earning',
          calculationType: 'PercentageOfCTC',
          value: 30, // 30% of CTC
          payer: 'Employee',
          isTaxable: true,
          description: 'Balancing allowance component',
        },
        {
          name: 'Employee PF (Provident Fund)',
          key: 'pf_employee',
          type: 'Deduction',
          calculationType: 'PercentageOfBasic',
          value: 12, // 12% of Basic
          payer: 'Employee',
          isTaxable: false,
          description: '12% statutory employee PF contribution',
        },
        {
          name: 'Professional Tax (PT)',
          key: 'professional_tax',
          type: 'Deduction',
          calculationType: 'Fixed',
          value: 200,
          payer: 'Employee',
          isTaxable: false,
          description: 'State statutory professional tax',
        },
        {
          name: 'Employer PF Contribution',
          key: 'pf_employer',
          type: 'EmployerContribution',
          calculationType: 'PercentageOfBasic',
          value: 12, // 12% of Basic
          payer: 'Employer',
          isTaxable: false,
          description: '12% matching employer PF contribution',
        },
      ],
    },
    {
      company: companyId,
      name: 'Internship Stipend Plan',
      code: 'INTERN_STIPEND',
      description: 'Direct fixed monthly stipend for interns without PF or statutory deduction burden.',
      employmentType: 'Intern',
      isDefault: false,
      status: 'Active',
      createdBy: userId,
      components: [
        {
          name: 'Monthly Stipend',
          key: 'stipend',
          type: 'Earning',
          calculationType: 'Fixed',
          value: 15000,
          payer: 'Employee',
          isTaxable: false,
          description: 'All-inclusive monthly learning stipend',
        },
      ],
    },
    {
      company: companyId,
      name: 'Contractor & Consultant Package',
      code: 'CONSULTANT_TDS',
      description: 'Professional retainership fee structure with standard 10% TDS deduction under Sec 194J.',
      employmentType: 'Contract',
      isDefault: false,
      status: 'Active',
      createdBy: userId,
      components: [
        {
          name: 'Consultancy Retainer Fee',
          key: 'consultancy_fee',
          type: 'Earning',
          calculationType: 'PercentageOfCTC',
          value: 100,
          payer: 'Employee',
          isTaxable: true,
          description: '100% of agreed monthly retainer',
        },
        {
          name: 'TDS (Sec 194J - 10%)',
          key: 'tds_deduction',
          type: 'Deduction',
          calculationType: 'PercentageOfBasic', // Treated as % of gross fee
          value: 10,
          payer: 'Employee',
          isTaxable: false,
          description: '10% Tax Deducted at Source',
        },
      ],
    },
  ];

  await SalaryStructure.insertMany(defaults);
};

// @desc    Get all salary structures for tenant company
// @route   GET /api/payroll/structures
// @access  Private (Admin / HR / Payroll view)
exports.getSalaryStructures = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    // Auto-seed standard templates if none exist
    await seedDefaultSalaryStructures(companyId, req.user._id);

    const filter = { company: companyId };
    if (req.query.employmentType && req.query.employmentType !== 'All') {
      filter.employmentType = req.query.employmentType;
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const structures = await SalaryStructure.find(filter)
      .sort({ isDefault: -1, createdAt: -1 })
      .populate('createdBy', 'name email');

    // Aggregate active employee counts assigned to each structure
    const counts = await UserSalary.aggregate([
      { $match: { company: companyId, salaryStructure: { $exists: true, $ne: null } } },
      { $group: { _id: '$salaryStructure', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    counts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });

    const enriched = structures.map((s) => ({
      ...s.toObject(),
      assignedEmployeesCount: countMap[s._id.toString()] || 0,
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error in getSalaryStructures:', error);
    res.status(500).json({ message: 'Failed to fetch salary structures', error: error.message });
  }
};

// @desc    Get single salary structure by ID
// @route   GET /api/payroll/structures/:id
// @access  Private
exports.getSalaryStructureById = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const structure = await SalaryStructure.findOne({ _id: req.params.id, company: companyId })
      .populate('createdBy', 'name email');

    if (!structure) {
      return res.status(404).json({ message: 'Salary structure not found' });
    }

    const assignedCount = await UserSalary.countDocuments({ salaryStructure: structure._id });

    res.json({
      ...structure.toObject(),
      assignedEmployeesCount: assignedCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch salary structure', error: error.message });
  }
};

// @desc    Create a new salary structure with dynamic components
// @route   POST /api/payroll/structures
// @access  Private (Admin / HR edit)
exports.createSalaryStructure = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const { name, code, description, employmentType, isDefault, status, components } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Plan name is required' });
    }

    // Clean & validate components
    const cleanedComponents = Array.isArray(components)
      ? components.map((c) => ({
          name: c.name?.trim() || 'Untitled Component',
          key: (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_'),
          type: ['Earning', 'Deduction', 'EmployerContribution'].includes(c.type) ? c.type : 'Earning',
          calculationType: ['PercentageOfBasic', 'PercentageOfCTC', 'Fixed'].includes(c.calculationType)
            ? c.calculationType
            : 'Fixed',
          value: parseFloat(c.value) || 0,
          payer: c.payer === 'Employer' ? 'Employer' : 'Employee',
          isTaxable: c.isTaxable !== false,
          description: c.description || '',
        }))
      : [];

    if (cleanedComponents.length === 0) {
      return res.status(400).json({ message: 'Please add at least one salary component or field' });
    }

    // If marked default, unset existing default
    if (isDefault) {
      await SalaryStructure.updateMany({ company: companyId }, { $set: { isDefault: false } });
    }

    const structure = await SalaryStructure.create({
      company: companyId,
      name: name.trim(),
      code: (code || name.replace(/[^a-zA-Z0-9]/g, '_')).toUpperCase(),
      description: description || '',
      employmentType: employmentType || 'Full-Time',
      isDefault: Boolean(isDefault),
      status: status || 'Active',
      components: cleanedComponents,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'Salary structure plan created successfully',
      structure,
    });
  } catch (error) {
    console.error('Error creating salary structure:', error);
    res.status(500).json({ message: 'Failed to create salary structure', error: error.message });
  }
};

// @desc    Update an existing salary structure
// @route   PUT /api/payroll/structures/:id
// @access  Private (Admin / HR edit)
exports.updateSalaryStructure = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const structure = await SalaryStructure.findOne({ _id: req.params.id, company: companyId });

    if (!structure) {
      return res.status(404).json({ message: 'Salary structure not found' });
    }

    const { name, code, description, employmentType, isDefault, status, components } = req.body;

    if (name) structure.name = name.trim();
    if (code) structure.code = code.trim().toUpperCase();
    if (description !== undefined) structure.description = description;
    if (employmentType) structure.employmentType = employmentType;
    if (status) structure.status = status;

    if (isDefault !== undefined && Boolean(isDefault) !== structure.isDefault) {
      if (isDefault) {
        await SalaryStructure.updateMany({ company: companyId }, { $set: { isDefault: false } });
        structure.isDefault = true;
      } else {
        structure.isDefault = false;
      }
    }

    if (Array.isArray(components)) {
      structure.components = components.map((c) => ({
        name: c.name?.trim() || 'Untitled Component',
        key: (c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_'),
        type: ['Earning', 'Deduction', 'EmployerContribution'].includes(c.type) ? c.type : 'Earning',
        calculationType: ['PercentageOfBasic', 'PercentageOfCTC', 'Fixed'].includes(c.calculationType)
          ? c.calculationType
          : 'Fixed',
        value: parseFloat(c.value) || 0,
        payer: c.payer === 'Employer' ? 'Employer' : 'Employee',
        isTaxable: c.isTaxable !== false,
        description: c.description || '',
      }));
    }

    await structure.save();

    res.json({
      success: true,
      message: 'Salary structure updated successfully',
      structure,
    });
  } catch (error) {
    console.error('Error updating salary structure:', error);
    res.status(500).json({ message: 'Failed to update salary structure', error: error.message });
  }
};

// @desc    Delete a salary structure
// @route   DELETE /api/payroll/structures/:id
// @access  Private (Admin / HR delete)
exports.deleteSalaryStructure = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    const structure = await SalaryStructure.findOne({ _id: req.params.id, company: companyId });

    if (!structure) {
      return res.status(404).json({ message: 'Salary structure not found' });
    }

    // Safety check: is it in use by employees?
    const inUseCount = await UserSalary.countDocuments({ salaryStructure: structure._id });
    if (inUseCount > 0) {
      return res.status(400).json({
        message: `Cannot delete plan "${structure.name}" because it is currently assigned to ${inUseCount} employee(s). Please reassign them first.`,
      });
    }

    await structure.deleteOne();

    res.json({
      success: true,
      message: 'Salary structure plan deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete salary structure', error: error.message });
  }
};

// @desc    Set structure as default plan
// @route   PATCH /api/payroll/structures/:id/default
// @access  Private
exports.setDefaultStructure = async (req, res) => {
  try {
    const companyId = await getCompanyId(req);
    await SalaryStructure.updateMany({ company: companyId }, { $set: { isDefault: false } });
    const structure = await SalaryStructure.findOneAndUpdate(
      { _id: req.params.id, company: companyId },
      { $set: { isDefault: true } },
      { new: true }
    );

    if (!structure) {
      return res.status(404).json({ message: 'Salary structure not found' });
    }

    res.json({
      success: true,
      message: `"${structure.name}" is now set as the default plan.`,
      structure,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set default structure', error: error.message });
  }
};

// @desc    Calculate live breakdown preview given CTC and dynamic components
// @route   POST /api/payroll/structures/calculate-preview
// @access  Private
exports.calculateSalaryPreview = (req, res) => {
  try {
    const { monthlyGross = 0, annualCTC = 0, components = [] } = req.body;

    const baseMonthly = monthlyGross > 0 ? monthlyGross : annualCTC > 0 ? annualCTC / 12 : 0;

    let basicAmount = 0;
    // Step 1: Find Basic Salary if any
    const basicComp = components.find(
      (c) =>
        c.type === 'Earning' &&
        (c.name.toLowerCase().includes('basic') || c.key === 'basic')
    );
    if (basicComp) {
      if (basicComp.calculationType === 'PercentageOfCTC') {
        basicAmount = (baseMonthly * (parseFloat(basicComp.value) || 0)) / 100;
      } else {
        basicAmount = parseFloat(basicComp.value) || 0;
      }
    } else {
      // Default to 50% of monthly if not explicitly declared
      basicAmount = baseMonthly * 0.5;
    }

    const calculatedComponents = components.map((c) => {
      let amount = 0;
      const val = parseFloat(c.value) || 0;

      if (c.calculationType === 'PercentageOfCTC') {
        amount = (baseMonthly * val) / 100;
      } else if (c.calculationType === 'PercentageOfBasic') {
        amount = (basicAmount * val) / 100;
      } else {
        // Fixed
        amount = val;
      }

      return {
        ...c,
        calculatedAmount: Math.round(amount * 100) / 100,
      };
    });

    const totalEarnings = calculatedComponents
      .filter((c) => c.type === 'Earning')
      .reduce((sum, c) => sum + c.calculatedAmount, 0);

    const totalEmployeeDeductions = calculatedComponents
      .filter((c) => c.type === 'Deduction' && c.payer !== 'Employer')
      .reduce((sum, c) => sum + c.calculatedAmount, 0);

    const totalEmployerContributions = calculatedComponents
      .filter((c) => c.type === 'EmployerContribution' || (c.type === 'Deduction' && c.payer === 'Employer'))
      .reduce((sum, c) => sum + c.calculatedAmount, 0);

    const netTakeHome = totalEarnings - totalEmployeeDeductions;
    const totalCostToCompanyMonthly = totalEarnings + totalEmployerContributions;

    res.json({
      success: true,
      monthlyGross: baseMonthly,
      basicAmount,
      totalEarnings,
      totalEmployeeDeductions,
      totalEmployerContributions,
      netTakeHome,
      totalCostToCompanyMonthly,
      totalCostToCompanyAnnual: totalCostToCompanyMonthly * 12,
      components: calculatedComponents,
    });
  } catch (error) {
    res.status(500).json({ message: 'Calculation failed', error: error.message });
  }
};
