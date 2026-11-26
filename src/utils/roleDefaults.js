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
  'settings',
  'crm',
  'sprints',
  'integrations',
  'documents',
  'agreements',
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
      projects: { view: true, create: false, edit: false, delete: false },
      tasks: { view: true, create: false, edit: false, delete: false },
      attendance: { view: true, create: false, edit: true, delete: false },
      payroll: { view: true, create: true, edit: true, delete: false },
      performance: { view: true, create: false, edit: false, delete: false },
      announcements: { view: true, create: true, edit: true, delete: true },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: false, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false },
      documents: { view: true, create: true, edit: true, delete: false },
      agreements: { view: true, create: true, edit: true, delete: false }
    }
  },
  'Team Head': {
    displayName: 'Team Head / Project Lead',
    description: 'Leads project execution, task assignments, and reviews team performance.',
    isSystemRole: false,
    permissions: {
      users: { view: true, create: false, edit: false, delete: false },
      projects: { view: true, create: true, edit: true, delete: false },
      tasks: { view: true, create: true, edit: true, delete: false },
      attendance: { view: true, create: false, edit: false, delete: false },
      payroll: { view: false, create: false, edit: false, delete: false },
      performance: { view: true, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: true, edit: true, delete: false },
      settings: { view: false, create: false, edit: false, delete: false },
      documents: { view: true, create: false, edit: false, delete: false },
      agreements: { view: true, create: true, edit: false, delete: false }
    }
  },
  'User': {
    displayName: 'Employee / Staff Member',
    description: 'Standard staff member handling assigned daily tasks, punching attendance, and communications.',
    isSystemRole: false,
    permissions: {
      users: { view: false, create: false, edit: false, delete: false },
      projects: { view: true, create: false, edit: false, delete: false },
      tasks: { view: true, create: true, edit: true, delete: false },
      attendance: { view: true, create: true, edit: false, delete: false },
      payroll: { view: false, create: false, edit: false, delete: false },
      performance: { view: false, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: true, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false },
      documents: { view: true, create: true, edit: false, delete: false },
      agreements: { view: true, create: false, edit: false, delete: false }
    }
  },
  'Accountant': {
    displayName: 'Accountant / Finance Officer',
    description: 'Manages salary structures, deductions (PF/ESIC/PT), payslips and payroll reports.',
    isSystemRole: false,
    permissions: {
      users: { view: true, create: false, edit: false, delete: false },
      projects: { view: true, create: false, edit: false, delete: false },
      tasks: { view: true, create: false, edit: false, delete: false },
      attendance: { view: true, create: false, edit: false, delete: false },
      payroll: { view: true, create: true, edit: true, delete: false },
      performance: { view: false, create: false, edit: false, delete: false },
      announcements: { view: true, create: false, edit: false, delete: false },
      chat: { view: true, create: true, edit: false, delete: false },
      reports: { view: true, create: false, edit: false, delete: false },
      settings: { view: false, create: false, edit: false, delete: false },
      documents: { view: true, create: false, edit: false, delete: false },
      agreements: { view: true, create: true, edit: false, delete: false }
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

const ALL_SUBMENUS = [
  // 1. Work & Projects
  {
    id: 'work_projects',
    name: 'Projects',
    path: '/admin/projects',
    category: 'Work & Projects',
    description: 'View and track company client projects',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'work_client_portal',
    name: 'Client Portal & Billings',
    path: '/admin/client-portal',
    category: 'Finance & Billing',
    description: 'Manage client deliverables, milestone tracking and billing status',
    defaultRoles: ['Admin', 'Accountant']
  },
  {
    id: 'work_sprints',
    name: 'Sprints & Timeline',
    path: '/admin/sprints',
    category: 'Work & Projects',
    description: 'Agile sprints, daily target timelines, and milestones',
    defaultRoles: ['Admin', 'Team Head']
  },
  {
    id: 'work_tasks',
    name: 'Daily Tasks',
    path: '/admin/tasks',
    category: 'Work & Projects',
    description: 'Task board, delegation, and live stopwatch tracking',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User']
  },
  {
    id: 'work_task_reports',
    name: 'Task Reports',
    path: '/admin/reports',
    category: 'Work & Projects',
    description: 'Daily timesheets and task completion reports',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head']
  },
  {
    id: 'work_reports_center',
    name: 'Reports & Export Hub',
    path: '/admin/reports-center',
    category: 'Reports & Analytics',
    description: 'Download attendance, salary, project and user audit reports',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'Accountant']
  },
  {
    id: 'work_time_tracker',
    name: 'Time Tracker & Logs',
    path: '/time-tracker',
    category: 'Time & Productivity',
    description: 'Live task timer sessions and working hours stopwatch',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'work_performance',
    name: 'Performance Analysis',
    path: '/admin/performance',
    category: 'Reports & Analytics',
    description: 'Team efficiency ratings and productivity KPI metrics',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head']
  },

  // 2. CRM & Sales
  {
    id: 'crm_overview',
    name: 'CRM Overview',
    path: '/admin/crm',
    category: 'CRM & Sales',
    description: 'High-level sales analytics and deal pipeline metrics',
    defaultRoles: ['Admin']
  },
  {
    id: 'crm_leads',
    name: 'Leads & Inquiries',
    path: '/admin/crm/leads',
    category: 'CRM & Sales',
    description: 'Inbound sales leads and enquiry status tracking',
    defaultRoles: ['Admin']
  },
  {
    id: 'crm_deals',
    name: 'Deals & Pipeline',
    path: '/admin/crm/deals',
    category: 'CRM & Sales',
    description: 'Active deal stages, win/loss conversion pipeline',
    defaultRoles: ['Admin']
  },
  {
    id: 'crm_customers',
    name: 'Customer Accounts',
    path: '/admin/crm/customers',
    category: 'CRM & Sales',
    description: 'Customer contact directory and relationship history',
    defaultRoles: ['Admin']
  },

  // 3. E-Agreements Hub
  {
    id: 'e_agreements_dashboard',
    name: 'Agreements Overview',
    path: '/admin/e-agreements',
    category: 'E-Agreements',
    description: 'Agreement metrics, recent documents, and rapid generation hub',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'Accountant']
  },
  {
    id: 'e_agreements_templates',
    name: 'Templates & Designer',
    path: '/admin/e-agreements/templates',
    category: 'E-Agreements',
    description: 'Design multi-page agreement templates with dynamic variables',
    defaultRoles: ['Admin', 'HR Manager']
  },
  {
    id: 'e_agreements_generated',
    name: 'All Generated Agreements',
    path: '/admin/e-agreements/list',
    category: 'E-Agreements',
    description: 'Track signed documents, verification status, and PDF downloads',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'Accountant']
  },
  {
    id: 'e_agreements_settings',
    name: 'Gateway API Settings',
    path: '/admin/e-agreements/settings',
    category: 'E-Agreements',
    description: 'Configure E-Agreement sandbox/production credentials & API keys',
    defaultRoles: ['Admin']
  },

  // 3. Human Resources
  {
    id: 'hr_users',
    name: 'Users & Staff',
    path: '/admin/users',
    category: 'Human Resources',
    description: 'Employee directory, designations, and permissions',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head']
  },
  {
    id: 'hr_offer_letters',
    name: 'Offer Letters',
    path: '/admin/offer-letters',
    category: 'Human Resources',
    description: 'Generate, sign, and issue customized staff offer letters',
    defaultRoles: ['Admin', 'HR Manager']
  },
  {
    id: 'hr_documents',
    name: 'Document Management',
    path: '/admin/documents',
    category: 'Human Resources',
    description: 'Review and verify employee Aadhaar/PAN KYC uploads',
    defaultRoles: ['Admin', 'HR Manager', 'Accountant']
  },
  {
    id: 'hr_attendance',
    name: 'Daily Attendance & Edit',
    path: '/admin/attendance',
    category: 'Attendance & Leaves',
    description: 'Daily office punch logs, audit edits, and manual regularizations',
    defaultRoles: ['Admin', 'HR Manager']
  },
  {
    id: 'hr_attendance_settings',
    name: 'Attendance Policy',
    path: '/admin/attendance-settings',
    category: 'Attendance & Leaves',
    description: 'Configure geofence coordinates, grace periods, and shift timings',
    defaultRoles: ['Admin', 'HR Manager']
  },
  {
    id: 'hr_leaves',
    name: 'Leaves & Holidays',
    path: '/admin/leaves',
    category: 'Attendance & Leaves',
    description: 'Review and approve staff leave applications and holiday lists',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head']
  },
  {
    id: 'hr_announcements',
    name: 'Announcements',
    path: '/admin/announcements',
    category: 'Human Resources',
    description: 'Broadcast company-wide announcements and notifications',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },

  // 4. Payroll & Finance
  {
    id: 'payroll_salary_process',
    name: 'Salary Process & Status',
    path: '/salary-process',
    category: 'Payroll Management',
    description: 'Monthly payroll calculation, overtime, and slip distribution',
    defaultRoles: ['Admin', 'HR Manager', 'Accountant']
  },
  {
    id: 'payroll_billing',
    name: 'Client Invoicing & Billing',
    path: '/accountant/billing',
    category: 'Finance & Billing',
    description: 'Issue invoices, record payment receipts, and customer ledgers',
    defaultRoles: ['Admin', 'Accountant']
  },
  {
    id: 'payroll_salary_management',
    name: 'Salary Management',
    path: '/admin/salary-management',
    category: 'Payroll Management',
    description: 'Configure employee salary structures and basic wage rules',
    defaultRoles: ['Admin', 'HR Manager', 'Accountant']
  },
  {
    id: 'payroll_settings',
    name: 'Payroll Settings',
    path: '/admin/payroll-settings',
    category: 'Payroll Management',
    description: 'Statutory EPF, ESI, and Professional Tax formulas',
    defaultRoles: ['Admin', 'HR Manager', 'Accountant']
  },

  // 5. Collaboration
  {
    id: 'collab_chat',
    name: 'Team Chat',
    path: '/admin/chat',
    category: 'Collaboration',
    description: 'Direct team messaging and department group channels',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'collab_meeting',
    name: 'Team Meeting',
    path: '/team-meeting',
    category: 'Collaboration',
    description: 'Peer-to-peer WebRTC video standup and meeting rooms',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User']
  },

  // 6. My Self-Service
  {
    id: 'self_punch',
    name: 'Punch In / Out',
    path: '/punch-in',
    category: 'My Self-Service',
    description: 'Personal GPS geofenced mobile and web attendance punch',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_attendance',
    name: 'My Attendance',
    path: '/my-attendance',
    category: 'My Self-Service',
    description: 'Personal attendance calendar, punch history, and work hours',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_leaves',
    name: 'My Leaves & Apply',
    path: '/my-leaves',
    category: 'My Self-Service',
    description: 'Check leave quota balance and apply for time off',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_salary_slips',
    name: 'My Salary Slips',
    path: '/my-salary-slips',
    category: 'My Self-Service',
    description: 'Download computerized PDF payslips with earnings/deductions',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_documents',
    name: 'My Documents & KYC',
    path: '/my-documents',
    category: 'My Self-Service',
    description: 'Upload identification proofs and academic verification documents',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_sticky_notes',
    name: 'Sticky Notes & Reminders',
    path: '/sticky-notes',
    category: 'My Self-Service',
    description: 'Personal color-coded scratchpad and reminder notifications',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_time_tracker',
    name: 'Work Timer & Tracker',
    path: '/time-tracker',
    category: 'My Self-Service',
    description: 'Personal stopwatch for tracking task activity and breaks',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_user_manual',
    name: 'User Manual & Guide',
    path: '/user-manual',
    category: 'My Self-Service',
    description: 'Operating manuals, shortcuts, and troubleshooting guides',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'self_profile',
    name: 'My Profile',
    path: '/admin/profile',
    category: 'My Self-Service',
    description: 'Manage personal profile, avatar, and contact details',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },

  // 7. System Admin
  {
    id: 'admin_roles',
    name: 'Roles & Permissions',
    path: '/admin/roles',
    category: 'System Admin',
    description: 'Configure RBAC permission matrices and custom roles',
    defaultRoles: ['Admin']
  },
  {
    id: 'admin_billing',
    name: 'Billing & Invoices',
    path: '/admin/billing',
    category: 'System Admin',
    description: 'Manage subscription plan, employee seats, and SaaS invoices',
    defaultRoles: ['Admin']
  },
  {
    id: 'admin_settings_org',
    name: 'Office Settings',
    path: '/admin/settings?tab=org',
    category: 'System Admin',
    description: 'Company registration, logos, official address, and stamps',
    defaultRoles: ['Admin']
  },
  {
    id: 'admin_settings_email',
    name: 'Company SMTP & Mail',
    path: '/admin/settings?tab=email',
    category: 'System Admin',
    description: 'Configure corporate outgoing SMTP email servers',
    defaultRoles: ['Admin']
  },
  {
    id: 'admin_backup',
    name: 'Data Backup & Restore',
    path: '/admin/backup',
    category: 'System Admin',
    description: 'Download JSON database backups and restore snapshots',
    defaultRoles: ['Admin']
  },

  // 8. Configurations & Integrations
  {
    id: 'config_website_feeds',
    name: 'Website Feeds & Overview',
    path: '/admin/integrations',
    category: 'Configurations',
    description: 'Website integrations, webhook feeds, and external APIs',
    defaultRoles: ['Admin']
  },
  {
    id: 'config_contacts',
    name: 'Contact Enquiries',
    path: '/admin/integrations?tab=contacts',
    category: 'Configurations',
    description: 'View public contact form inquiries from marketing websites',
    defaultRoles: ['Admin']
  },
  {
    id: 'config_appointments',
    name: 'Appointments',
    path: '/admin/integrations?tab=appointments',
    category: 'Configurations',
    description: 'External consultation and demo booking appointments',
    defaultRoles: ['Admin']
  },
  {
    id: 'config_careers',
    name: 'Career Applications',
    path: '/admin/integrations?tab=careers',
    category: 'Configurations',
    description: 'Incoming job applicant resumes and hiring pipeline',
    defaultRoles: ['Admin', 'HR Manager']
  },
  {
    id: 'config_api_endpoints',
    name: 'API Endpoints Setup',
    path: '/admin/integrations?tab=config',
    category: 'Configurations',
    description: 'Webhook secrets, API keys, and third-party webhook URLs',
    defaultRoles: ['Admin']
  },
  {
    id: 'config_integration_docs',
    name: 'Integration Docs',
    path: '/admin/integrations?tab=docs',
    category: 'Configurations',
    description: 'API integration guides and payload documentation',
    defaultRoles: ['Admin']
  },

  // 9. Help & Support
  {
    id: 'support_company',
    name: 'Company Support',
    path: '/company-support',
    category: 'Help & Support',
    description: 'Internal ticket desk for HR, payroll, and asset inquiries',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'support_software',
    name: 'Softwares Support',
    path: '/software-support',
    category: 'Help & Support',
    description: 'Report ERP bugs or technical glitches to development support',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  },
  {
    id: 'support_system',
    name: 'System Support',
    path: '/support-tickets',
    category: 'Help & Support',
    description: 'Platform infrastructure and server status tickets',
    defaultRoles: ['Admin', 'HR Manager', 'Team Head', 'User', 'Accountant']
  }
];

/**
 * Returns a merged permissions object for a user including granular submenus
 */
const getUserPermissions = async (user) => {
  if (!user) return {};

  const isFullAdmin = user.role === 'Super Admin' || user.role === 'Admin' || user.role === 'CTO';

  // Super Admin and Company Admin always have 100% full access to all modules and submenus
  if (isFullAdmin) {
    const fullPermissions = ALL_MODULES.reduce((acc, mod) => {
      acc[mod] = { ...FULL_ACCESS };
      return acc;
    }, {});
    fullPermissions.submenus = ALL_SUBMENUS.reduce((acc, sub) => {
      acc[sub.id] = true;
      return acc;
    }, {});
    return fullPermissions;
  }

  const companyId = user.company?._id || user.company;
  const templateKey = getRoleTemplateKey(user.role);

  let permissions = null;
  let roleSubmenus = null;

  // 1. If user has explicit roleRef populated or referenced
  if (user.roleRef && user.roleRef.permissions) {
    permissions = user.roleRef.permissions;
    if (user.roleRef.permissions.submenus) {
      roleSubmenus = user.roleRef.permissions.submenus;
    }
  }

  // 2. Look up by user.role or normalized alias in company's Role records
  if ((!permissions || !roleSubmenus) && companyId) {
    const roleDoc = await Role.findOne({ 
      company: companyId, 
      $or: [
        { name: user.role },
        { name: templateKey },
        { name: { $regex: new RegExp(`^${user.role}$`, 'i') } }
      ]
    });
    if (roleDoc && roleDoc.permissions) {
      if (!permissions) permissions = roleDoc.permissions;
      if (!roleSubmenus && roleDoc.permissions.submenus) {
        roleSubmenus = roleDoc.permissions.submenus;
      }
    }
  }

  // 3. Fallback to default definition if available
  if (!permissions) {
    if (DEFAULT_ROLES[templateKey]) {
      permissions = DEFAULT_ROLES[templateKey].permissions;
    }
  }

  // 4. Default safe fallback
  if (!permissions) {
    permissions = ALL_MODULES.reduce((acc, mod) => {
      acc[mod] = { ...NO_ACCESS };
      return acc;
    }, {});
  }

  // Deep clone to avoid mutating schema/static references
  const resolved = JSON.parse(JSON.stringify(permissions));

  // Ensure projects view is enabled for all company staff so project dropdowns load smoothly
  if (!resolved.projects) {
    resolved.projects = { view: true, create: false, edit: false, delete: false };
  } else {
    resolved.projects.view = true;
  }

  // 5. Construct granular submenus permissions
  const submenus = {};
  ALL_SUBMENUS.forEach((sub) => {
    if (sub.defaultRoles.includes(templateKey) || sub.defaultRoles.includes(user.role)) {
      submenus[sub.id] = true;
    } else {
      submenus[sub.id] = false;
    }
  });

  // Apply role document custom submenus if present
  if (roleSubmenus && typeof roleSubmenus === 'object') {
    Object.assign(submenus, roleSubmenus);
  }

  // 6. Apply per-user custom overrides (from User.customPermissions.submenus)
  if (user.customPermissions && user.customPermissions.submenus && typeof user.customPermissions.submenus === 'object') {
    Object.entries(user.customPermissions.submenus).forEach(([subId, isAllowed]) => {
      submenus[subId] = Boolean(isAllowed);
    });
  }

  // Attach submenus map to resolved permissions
  resolved.submenus = submenus;

  return resolved;
};

module.exports = {
  ALL_MODULES,
  ALL_SUBMENUS,
  FULL_ACCESS,
  NO_ACCESS,
  DEFAULT_ROLES,
  getRoleTemplateKey,
  ensureCompanyRoles,
  getUserPermissions
};
