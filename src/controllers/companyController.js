const Company = require('../models/Company');

// @desc    Get all companies
// @route   GET /api/companies
// @access  Public
const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Public
const getCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.status(200).json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a company
// @route   POST /api/companies
// @access  Public
const createCompany = async (req, res) => {
  const { name, industry, location, employeeCount } = req.body;

  if (!name || !industry || !location || !employeeCount) {
    return res.status(400).json({ message: 'Please include all fields' });
  }

  try {
    const company = await Company.create({
      name,
      industry,
      location,
      employeeCount,
    });
    res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a company
// @route   PUT /api/companies/:id
// @access  Public
const updateCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedCompany);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a company
// @route   DELETE /api/companies/:id
// @access  Public
const deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    await company.deleteOne();
    res.status(200).json({ id: req.params.id, message: 'Company deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
};
