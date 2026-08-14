const Project = require('../models/Project');

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private/Admin
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a project
// @route   POST /api/projects
// @access  Private/Admin
const createProject = async (req, res) => {
  try {
    const { name, description, status, startDate, endDate } = req.body;
    
    let logo = '';
    if (req.file) {
      logo = `/uploads/project-logos/${req.file.filename}`;
    }

    const project = new Project({
      name,
      description,
      status,
      startDate,
      endDate,
      logo
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
  createProject,
  updateProject,
  deleteProject
};
