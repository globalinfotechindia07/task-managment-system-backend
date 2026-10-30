const Role = require('../models/Role');
const User = require('../models/User');
const { ensureCompanyRoles, ALL_MODULES, getUserPermissions, DEFAULT_ROLES, getRoleTemplateKey } = require('../utils/roleDefaults');

// @desc    Get all roles and permissions for company
// @route   GET /api/roles
// @access  Private (Admin, Super Admin, or Staff for lookup)
const getRoles = async (req, res) => {
  try {
    const companyId = req.user.role === 'Super Admin' 
      ? (req.query.companyId || req.companyId)
      : (req.companyId || req.user.company?._id || req.user.company);

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required to fetch roles' });
    }

    // Ensure base roles exist for this company
    await ensureCompanyRoles(companyId);

    const roles = await Role.find({ company: companyId }).sort({ isSystemRole: -1, createdAt: 1 });

    // Aggregate user counts per role
    const users = await User.find({ company: companyId }).select('role');
    const roleCounts = {};
    users.forEach(u => {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    });

    const enrichedRoles = roles.map(r => ({
      ...r.toObject(),
      userCount: roleCounts[r.name] || 0
    }));

    res.json(enrichedRoles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: error.message || 'Server error fetching roles' });
  }
};

// @desc    Create a new custom role / position
// @route   POST /api/roles
// @access  Private (Admin, CTO, Super Admin)
const createRole = async (req, res) => {
  try {
    const { name, displayName, description, permissions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Role / Position name is required' });
    }

    const companyId = req.user.role === 'Super Admin'
      ? req.body.companyId
      : (req.companyId || req.user.company?._id || req.user.company);

    if (!companyId) {
      return res.status(400).json({ message: 'Company context required to create a role' });
    }

    const cleanName = name.trim();

    // Check if role name already exists in this company
    const existing = await Role.findOne({ 
      company: companyId, 
      name: { $regex: new RegExp(`^${cleanName}$`, 'i') } 
    });

    if (existing) {
      return res.status(400).json({ message: `Role '${cleanName}' already exists in your organization` });
    }

    // Build permissions object ensuring all modules are present, plus any custom modules
    const cleanPermissions = {};
    const allModulesList = Array.from(new Set([...ALL_MODULES, ...Object.keys(permissions || {})]));
    allModulesList.forEach(mod => {
      cleanPermissions[mod] = {
        view: Boolean(permissions?.[mod]?.view),
        create: Boolean(permissions?.[mod]?.create),
        edit: Boolean(permissions?.[mod]?.edit),
        delete: Boolean(permissions?.[mod]?.delete)
      };
    });

    const newRole = await Role.create({
      name: cleanName,
      displayName: displayName?.trim() || cleanName,
      description: description?.trim() || '',
      company: companyId,
      isSystemRole: false,
      permissions: cleanPermissions,
      createdBy: req.user._id
    });

    res.status(201).json({
      message: `Role '${newRole.displayName}' created successfully`,
      role: newRole
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ message: error.message || 'Failed to create role' });
  }
};

// @desc    Update role permissions / details
// @route   PUT /api/roles/:id
// @access  Private (Admin, CTO, Super Admin)
const updateRole = async (req, res) => {
  try {
    const { displayName, description, permissions } = req.body;
    const roleId = req.params.id;

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    // Check company boundary
    if (req.user.role !== 'Super Admin') {
      const userCompanyId = (req.companyId || req.user.company?._id || req.user.company || '').toString();
      if (role.company?.toString() !== userCompanyId) {
        return res.status(403).json({ message: 'Unauthorized to modify roles of another company' });
      }
    }

    // Prevent changing Admin role to locked out state
    if (role.name === 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Admin role maintains full system permissions' });
    }

    if (displayName) role.displayName = displayName.trim();
    if (description !== undefined) role.description = description.trim();

    if (permissions) {
      if (!role.permissions) role.permissions = {};
      const allModulesList = Array.from(new Set([...ALL_MODULES, ...Object.keys(role.permissions || {}), ...Object.keys(permissions || {})]));
      allModulesList.forEach(mod => {
        if (permissions[mod]) {
          role.permissions[mod] = {
            view: Boolean(permissions[mod].view),
            create: Boolean(permissions[mod].create),
            edit: Boolean(permissions[mod].edit),
            delete: Boolean(permissions[mod].delete)
          };
        }
      });
      role.markModified('permissions');
    }

    await role.save();

    res.json({
      message: `Permissions updated for '${role.displayName || role.name}'`,
      role
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: error.message || 'Failed to update role' });
  }
};

// @desc    Delete a custom role
// @route   DELETE /api/roles/:id
// @access  Private (Admin, CTO, Super Admin)
const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    // Protection: Cannot delete system roles or default core roles
    if (role.isSystemRole || ['Admin', 'Super Admin'].includes(role.name)) {
      return res.status(403).json({ message: `System role '${role.name}' cannot be deleted` });
    }

    // Boundary check
    if (req.user.role !== 'Super Admin') {
      const userCompanyId = (req.companyId || req.user.company?._id || req.user.company || '').toString();
      if (role.company?.toString() !== userCompanyId) {
        return res.status(403).json({ message: 'Unauthorized to delete this role' });
      }
    }

    // Check if any users are currently assigned to this role
    const usersCount = await User.countDocuments({ company: role.company, role: role.name });
    if (usersCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete role '${role.name}'. It is currently assigned to ${usersCount} user(s). Please reassign them first.` 
      });
    }

    await role.deleteOne();

    res.json({ message: `Role '${role.name}' deleted successfully` });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ message: error.message || 'Failed to delete role' });
  }
};

// @desc    Get current user permissions
// @route   GET /api/roles/my-permissions
// @access  Private
const getMyPermissions = async (req, res) => {
  try {
    const permissions = await getUserPermissions(req.user);
    res.json({
      role: req.user.role,
      permissions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get system role templates
// @route   GET /api/roles/templates
// @access  Private
const getRoleTemplates = async (req, res) => {
  try {
    res.json(DEFAULT_ROLES);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset role permissions to template defaults
// @route   POST /api/roles/:id/reset-defaults
// @access  Private (Admin, CTO, Super Admin)
const resetRoleToDefaults = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const templateKey = getRoleTemplateKey(role.name);
    const template = DEFAULT_ROLES[templateKey];

    if (!template) {
      return res.status(400).json({ message: `No standard default template found for role '${role.name}'` });
    }

    role.permissions = template.permissions;
    role.displayName = role.displayName || template.displayName;
    role.description = role.description || template.description;
    role.markModified('permissions');
    await role.save();

    res.json({
      message: `Role '${role.displayName || role.name}' reset to default permissions`,
      role
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getMyPermissions,
  getRoleTemplates,
  resetRoleToDefaults
};
