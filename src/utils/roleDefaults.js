const Role = require('../models/Role');

const ALL_MODULES = [
  'users',
  'projects',
  'tasks',
  'attendance',
  'payroll',
  'performance',
  'announcements',
  'chat',
  'reports',
  'settings'
];

const FULL_ACCESS = {
  view: true,
  create: true,
  edit: true,
  delete: true
};

const NO_ACCESS = {
  view: false,
  create: false,
  edit: false,
  delete: false
};

const DEFAULT_ROLES = {
  'Admin': {
    displayName: 'Office Administrator',
    description: 'Full administrative control over this company office and staff.',
    isSystemRole: true,
    permissions: ALL_MODULES.reduce((acc, mod) => {
      acc[mod] = { ...FULL_ACCESS };
      return acc;
    }, {})
  },
  'HR Manager': {
    displayName: 'Human Resources Manager',
    description: 'Manages employee records, attendance, payroll configs, announcements and staff reports.',
    isSystemRole: false,
    permissions: {
      users: { view: true, create: true, edit: true, delete: false },
      projects: { view: false, create: false, edit: false, delete: false },
      tasks: { view: true, create: false, edit: false, delete: false },
      attendance: { view: true, create: false, edit: true, delete: false },
      payroll: { view: true, create: true, edit: true, delete: false },
      performance: { view: true, create: false, edit: false, delete: false },
      announcements: { view: true, create: true, edit: true, delete: true },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: false, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false }
    }
  },
  'Team Head': {
    displayName: 'Team Head / Project Lead',
    description: 'Leads project execution, task assignments, and reviews team performance.',
    isSystemRole: false,
    permissions: {
      users: { view: true, create: false, edit: false, delete: false },
      projects: { view: true, create: false, edit: false, delete: false },
      tasks: { view: true, create: true, edit: true, delete: false },
      attendance: { view: true, create: false, edit: false, delete: false },
      payroll: { view: false, create: false, edit: false, delete: false },
      performance: { view: true, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: true, edit: true, delete: false },
      settings: { view: false, create: false, edit: false, delete: false }
    }
  },
  'User': {
    displayName: 'Employee / Staff Member',
    description: 'Standard staff member handling assigned daily tasks, punching attendance, and communications.',
    isSystemRole: false,
    permissions: {
      users: { view: false, create: false, edit: false, delete: false },
      projects: { view: false, create: false, edit: false, delete: false },
      tasks: { view: true, create: true, edit: true, delete: false },
      attendance: { view: true, create: true, edit: false, delete: false },
      payroll: { view: false, create: false, edit: false, delete: false },
      performance: { view: false, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: true, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false }
    }
  },
  'Accountant': {
    displayName: 'Accountant / Finance Officer',
    description: 'Manages salary structures, deductions (PF/ESIC/PT), payslips and payroll reports.',
    isSystemRole: false,
    permissions: {
      users: { view: true, create: false, edit: false, delete: false },
      projects: { view: false, create: false, edit: false, delete: false },
      tasks: { view: true, create: false, edit: false, delete: false },
      attendance: { view: true, create: false, edit: false, delete: false },
      payroll: { view: true, create: true, edit: true, delete: false },
      performance: { view: false, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: false, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false }
    }
  }
};

/**
 * Resolves alias role names to standard template keys
 */
const getRoleTemplateKey = (roleName) => {
  if (!roleName) return 'User';
  const r = roleName.trim().toLowerCase();
  if (r === 'admin' || r === 'cto' || r === 'super admin') return 'Admin';
  if (r === 'hr' || r === 'hr manager' || r.includes('human resources')) return 'HR Manager';
  if (r === 'team head' || r === 'team lead' || r.includes('project lead') || r.includes('team lead')) return 'Team Head';
  if (r === 'accountant' || r.includes('finance')) return 'Accountant';
  if (r === 'user' || r === 'employee' || r === 'staff') return 'User';
  return roleName;
};

/**
 * Ensures a company has its base roles initialized
 */
const ensureCompanyRoles = async (companyId) => {
  if (!companyId) return [];

  const existingRoles = await Role.find({ company: companyId });
  const existingMap = new Map(existingRoles.map(r => [r.name, r]));

  const rolesToCreate = [];
  for (const [roleName, config] of Object.entries(DEFAULT_ROLES)) {
    const existing = existingMap.get(roleName);
    if (!existing) {
      rolesToCreate.push({
        name: roleName,
        displayName: config.displayName,
        description: config.description,
        company: companyId,
        isSystemRole: config.isSystemRole,
        permissions: config.permissions
      });
    } else if (!existing.permissions || Object.keys(existing.permissions).length === 0) {
      existing.permissions = config.permissions;
      existing.displayName = existing.displayName || config.displayName;
      existing.description = existing.description || config.description;
      existing.markModified('permissions');
      await existing.save();
    }
  }

  if (rolesToCreate.length > 0) {
    try {
      await Role.insertMany(rolesToCreate);
    } catch (err) {
      console.warn('Auto-seed roles warning:', err.message);
    }
  }

  return await Role.find({ company: companyId }).sort({ createdAt: 1 });
};

/**
 * Returns a merged permissions object for a user
 */
const getUserPermissions = async (user) => {
  if (!user) return {};

  // Super Admin and Company Admin always have 100% full access to all modules
  if (user.role === 'Super Admin' || user.role === 'Admin' || user.role === 'CTO') {
    return ALL_MODULES.reduce((acc, mod) => {
      acc[mod] = { ...FULL_ACCESS };
      return acc;
    }, {});
  }

  const companyId = user.company?._id || user.company;

  // 1. If user has explicit roleRef populated or referenced
  if (user.roleRef && user.roleRef.permissions) {
    return user.roleRef.permissions;
  }

  // 2. Look up by user.role or normalized alias in company's Role records
  if (companyId) {
    const templateKey = getRoleTemplateKey(user.role);
    const roleDoc = await Role.findOne({ 
      company: companyId, 
      $or: [
        { name: user.role },
        { name: templateKey },
        { name: { $regex: new RegExp(`^${user.role}$`, 'i') } }
      ]
    });
    if (roleDoc && roleDoc.permissions) {
      return roleDoc.permissions;
    }
  }

  // 3. Fallback to default definition if available
  const templateKey = getRoleTemplateKey(user.role);
  if (DEFAULT_ROLES[templateKey]) {
    return DEFAULT_ROLES[templateKey].permissions;
  }

  // 4. Default safe fallback
  return ALL_MODULES.reduce((acc, mod) => {
    acc[mod] = { ...NO_ACCESS };
    return acc;
  }, {});
};

module.exports = {
  ALL_MODULES,
  FULL_ACCESS,
  NO_ACCESS,
  DEFAULT_ROLES,
  getRoleTemplateKey,
  ensureCompanyRoles,
  getUserPermissions
};
