const Project = require('../models/Project');
const User = require('../models/User');

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private (All authenticated staff in the company)
const getProjects = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'Super Admin') {
      let companyId = req.companyId || req.user.company?._id || req.user.company;
      if (!companyId && req.user.createdBy) {
        const creator = await User.findById(req.user.createdBy);
        if (creator?.company) {
          companyId = creator.company._id || creator.company;
        }
      }
      if (!companyId) {
        // Fallback: search if user has any task with company
        const Task = require('../models/Task');
        const sampleTask = await Task.findOne({ assignedTo: req.user._id, company: { $exists: true, $ne: null } });
        if (sampleTask && sampleTask.company) {
          companyId = sampleTask.company;
        }
      }
      if (!companyId) return res.json([]);
      filter.company = companyId;
    } else if (req.query.company) {
      filter.company = req.query.company;
    }
    const projects = await Project.find(filter).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    if (req.user.role !== 'Super Admin') {
      const companyId = req.companyId || req.user.company?._id || req.user.company;
      if (project.company && companyId && project.company.toString() !== companyId.toString()) {
        return res.status(403).json({ message: 'Access Denied: Project belongs to another company' });
      }
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a project
// @route   POST /api/projects
// @access  Private/Admin
const createProject = async (req, res) => {
  try {
    const { name, description, status, startDate, endDate, companyId } = req.body;
    
    let logo = '';
    if (req.file) {
      logo = `/uploads/project-logos/${req.file.filename}`;
    }

    const targetCompanyId = req.companyId || req.user.company?._id || req.user.company || companyId;

    const project = new Project({
      name,
      description,
      status,
      startDate,
      endDate,
      logo,
      company: targetCompanyId
    });

    const createdProject = await project.save();
    res.status(201).json(createdProject);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a project
// @route   PUT /api/projects/:id
// @access  Private/Admin
const updateProject = async (req, res) => {
  try {
    const { name, description, status, startDate, endDate } = req.body;

    const project = await Project.findById(req.params.id);

    if (project) {
      project.name = name || project.name;
      project.description = description !== undefined ? description : project.description;
      project.status = status || project.status;
      project.startDate = startDate !== undefined ? startDate : project.startDate;
      project.endDate = endDate !== undefined ? endDate : project.endDate;

      if (req.file) {
        project.logo = `/uploads/project-logos/${req.file.filename}`;
      }

      const updatedProject = await project.save();
      res.json(updatedProject);
    } else {
      res.status(404).json({ message: 'Project not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a project
// @route   DELETE /api/projects/:id
// @access  Private/Admin
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (project) {
      await project.deleteOne();
      res.json({ message: 'Project removed' });
    } else {
      res.status(404).json({ message: 'Project not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject
};
