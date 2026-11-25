const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const User = require('../models/User');
const Task = require('../models/Task');
const Project = require('../models/Project');
const TimeSession = require('../models/TimeSession');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const EmployeeDocument = require('../models/EmployeeDocument');
const StickyNote = require('../models/StickyNote');
const SalarySlip = require('../models/SalarySlip');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Customer = require('../models/Customer');
const CompanyTicket = require('../models/CompanyTicket');
const SoftwareTicket = require('../models/SoftwareTicket');

const DEMO_COMPANY_CODE = 'DEMO-CORP';
const DEMO_DEFAULT_PASSWORD = 'demo123';

const DEMO_ACCOUNTS_META = [
  {
    role: 'Admin',
    name: 'Alex Morgan (Demo Admin)',
    email: 'demo.admin@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Managing Director & Enterprise Admin',
    department: 'Management',
    badge: 'Full Control',
    color: 'indigo',
    description: 'Full administrative access across all office branches, staff, analytics, projects & global settings.',
    features: ['Multi-Branch Operations', 'Company Settings & Billing', 'Staff Directory & Roles', 'Executive Analytics']
  },
  {
    role: 'HR Manager',
    name: 'Sarah Jenkins (Demo HR)',
    email: 'demo.hr@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Head of Human Resources',
    department: 'Human Resources',
    badge: 'People Ops',
    color: 'emerald',
    description: 'Manages employee records, geofenced attendance rules, leave approvals, and automated salary slip dispatch.',
    features: ['Attendance Approvals & Rules', 'Leave Management', 'Automated Payslips', 'Staff Announcements']
  },
  {
    role: 'Team Head',
    name: 'David Chen (Demo Lead)',
    email: 'demo.lead@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Senior Engineering Team Lead',
    department: 'Engineering',
    badge: 'Agile & Sprints',
    color: 'blue',
    description: 'Oversees development sprints, delegates daily tasks, tracks project deliverables & team hours.',
    features: ['Sprint Management', 'Task Delegation', 'Member Timeline Tracking', 'Project Deliverables']
  },
  {
    role: 'User',
    name: 'Rohan Verma (Demo Employee)',
    email: 'demo.user@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Full Stack Software Engineer',
    department: 'Engineering',
    badge: 'Daily Workflow',
    color: 'violet',
    description: 'Logs daily work via live stopwatch timers, geofenced mobile punches, document uploads & leave requests.',
    features: ['Geofenced Mobile Punch', 'Live Stopwatch Task Timer', 'Leave & Document Requests', 'Download Salary Slips']
  },
  {
    role: 'Accountant',
    name: 'Priya Nair (Demo Accountant)',
    email: 'demo.accountant@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Chief Financial Controller & Accountant',
    department: 'Finance',
    badge: 'Payroll & Ledger',
    color: 'amber',
    description: 'Manages payroll structures, EPF / ESI statutory deductions, client invoicing & financial accounting ledger.',
    features: ['Salary Structure Setup', 'Statutory Tax & EPF/ESI', 'Client Billing & Invoices', 'Financial Ledger']
  },
  {
    role: 'Client',
    name: 'Elena Rostova (Demo Client)',
    email: 'demo.client@globalinfotech.com',
    password: DEMO_DEFAULT_PASSWORD,
    designation: 'Enterprise Client Representative',
    department: 'External',
    badge: 'Client Portal',
    color: 'rose',
    description: 'Monitors ongoing project deliverables, milestone status, invoices, and submits client feedback tickets.',
    features: ['Project Milestone Tracking', 'Live Invoice Status', 'Deliverable Previews', 'Support Queries']
  }
];

/**
 * Ensures that the Demo Sandbox Company, 6 Demo Accounts, and Baseline Sample Data exist.
 */
const ensureDemoAccountsExist = async () => {
  try {
    // 1. Ensure or create Demo Company
    let demoCompany = await Company.findOne({
      $or: [{ companyCode: DEMO_COMPANY_CODE }, { isDemo: true }]
    });

    if (!demoCompany) {
      demoCompany = await Company.create({
        name: 'Global InfoTech Demo Sandbox',
        companyCode: DEMO_COMPANY_CODE,
        industry: 'Software & Technology Services',
        location: 'Tech City, India',
        address: 'Suite 404, Demo Sandbox Tech Park, Silicon Corridor',
        contactEmail: 'demo.admin@globalinfotech.com',
        phone: '+91 98765 43210',
        employeeSize: '50-100',
        isDemo: true,
        status: 'Active',
        subscriptionPlan: {
          planName: 'Enterprise Unlimited',
          status: 'Active',
          maxEmployees: 250,
          billingInterval: 'annual',
          price: 0,
          features: [
            'Geofenced Attendance',
            'Task & Sprint Timelines',
            'Dynamic Payroll & Statutory Slips',
            'Live Stopwatch Time Tracking',
            'Employee Document Vault',
            'CRM & Lead Management',
            'Client Billing & Invoicing',
            'Reports Center & Audit Logs'
          ]
        }
      });
      console.log(`[Demo Sandbox] Created demo company: ${demoCompany.name} (${demoCompany.companyCode})`);
    } else {
      if (!demoCompany.isDemo || demoCompany.companyCode !== DEMO_COMPANY_CODE) {
        demoCompany.isDemo = true;
        demoCompany.companyCode = DEMO_COMPANY_CODE;
        await demoCompany.save();
      }
    }

    // 2. Ensure each Demo User exists and has the correct baseline credentials
    const createdUsers = {};
    for (const acc of DEMO_ACCOUNTS_META) {
      let user = await User.findOne({ email: acc.email });
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(acc.password, salt);

      if (!user) {
        user = await User.create({
          name: acc.name,
          email: acc.email,
          password: acc.password, // Pre-save hook will hash it
          role: acc.role,
          designation: acc.designation,
          department: acc.department,
          company: demoCompany._id,
          isDemo: true,
          status: 'Active',
          requiresPasswordChange: false,
        });
        console.log(`[Demo Sandbox] Created demo account: ${acc.email} (${acc.role})`);
      } else {
        // Ensure user belongs to demo company, is flagged demo, password matches demo123, requiresPasswordChange is false
        let needsUpdate = false;
        if (!user.isDemo) {
          user.isDemo = true;
          needsUpdate = true;
        }
        if (user.requiresPasswordChange) {
          user.requiresPasswordChange = false;
          needsUpdate = true;
        }
        if (user.status !== 'Active') {
          user.status = 'Active';
          needsUpdate = true;
        }
        if (String(user.company) !== String(demoCompany._id)) {
          user.company = demoCompany._id;
          needsUpdate = true;
        }
        if (user.role !== acc.role) {
          user.role = acc.role;
          needsUpdate = true;
        }

        // Always ensure password is demo123
        const isMatch = await user.matchPassword(acc.password);
        if (!isMatch) {
          user.password = acc.password; // pre-save will hash
          needsUpdate = true;
        }

        if (needsUpdate) {
          await user.save();
          console.log(`[Demo Sandbox] Synchronized demo account: ${acc.email}`);
        }
      }
      createdUsers[acc.role] = user;
    }

    // Set Team Head linkage
    if (createdUsers['User'] && createdUsers['Team Head']) {
      if (String(createdUsers['User'].teamHead) !== String(createdUsers['Team Head']._id)) {
        createdUsers['User'].teamHead = createdUsers['Team Head']._id;
        await createdUsers['User'].save();
      }
    }

    // 3. Ensure baseline sample project and tasks exist for demo testing
    await ensureDemoBaselineData(demoCompany, createdUsers);

    return { demoCompany, createdUsers };
  } catch (err) {
    console.error('[Demo Sandbox Error] ensureDemoAccountsExist failed:', err.message);
  }
};

/**
 * Ensures baseline sample project and tasks exist so new demo testers always see rich data.
 */
const ensureDemoBaselineData = async (demoCompany, users) => {
  try {
    const adminUser = users['Admin'];
    const leadUser = users['Team Head'];
    const staffUser = users['User'];
    const clientUser = users['Client'];

    if (!adminUser || !leadUser || !staffUser) return;

    let project = await Project.findOne({ company: demoCompany._id, name: 'Enterprise Cloud ERP & AI 2.0' });
    if (!project) {
      project = await Project.create({
        name: 'Enterprise Cloud ERP & AI 2.0',
        company: demoCompany._id,
        description: 'Next-generation unified ERP platform with automated attendance geofencing, statutory payroll and sprint tracking.',
        status: 'In Progress',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        client: clientUser ? clientUser._id : null,
        clientName: 'Global Enterprise Partners',
        budget: 450000,
        billingType: 'Milestone',
        milestones: [
          {
            milestoneNumber: 1,
            title: 'Architecture & Multi-Branch Schema',
            description: 'Core micro-tenant database schema & geofencing models',
            amount: 150000,
            status: 'Paid',
            paidAmount: 150000,
            paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            paymentMethod: 'Bank Transfer'
          },
          {
            milestoneNumber: 2,
            title: 'Dynamic Payroll & Reports Center',
            description: 'Automated statutory EPF/ESI tax deductions & PDF exports',
            amount: 175000,
            status: 'Pending',
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          }
        ]
      });
      console.log(`[Demo Sandbox] Created baseline project: ${project.name}`);
    }

    // Check if baseline tasks exist
    const baselineTasksCount = await Task.countDocuments({ company: demoCompany._id, isDemoBaseline: true });
    if (baselineTasksCount === 0) {
      const sampleTasks = [
        {
          title: 'Configure Geofenced Perimeter for Bangalore HQ',
          description: 'Set up latitude/longitude geofence radius for automated staff mobile punch-ins.',
          company: demoCompany._id,
          project: project._id,
          assignedTo: staffUser._id,
          assignedBy: leadUser._id,
          status: 'Completed',
          priority: 'High',
          estimatedTimeDuration: 6,
          targetDurationMinutes: 360,
          totalLoggedSeconds: 14400,
          isTimerRequired: true,
          isDemoBaseline: true,
          completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          title: 'Implement Indian Statutory Tax & EPF Calculation Engine',
          description: 'Compute dynamic earnings, PF 12%, ESI 0.75%, Professional Tax and generate clean PDF slips.',
          company: demoCompany._id,
          project: project._id,
          assignedTo: staffUser._id,
          assignedBy: leadUser._id,
          status: 'In Progress',
          priority: 'High',
          estimatedTimeDuration: 8,
          targetDurationMinutes: 480,
          totalLoggedSeconds: 7200,
          isTimerRequired: true,
          isDemoBaseline: true,
          startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        },
        {
          title: 'Review Monthly Attendance & Overtime Audit Report',
          description: 'Filter late arrivals, verify geofenced punch locations, and export department-wide attendance report.',
          company: demoCompany._id,
          project: project._id,
          assignedTo: leadUser._id,
          assignedBy: adminUser._id,
          status: 'Pending',
          priority: 'Normal',
          estimatedTimeDuration: 4,
          targetDurationMinutes: 240,
          isTimerRequired: true,
          isDemoBaseline: true,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
        }
      ];

      for (const t of sampleTasks) {
        await Task.create(t);
      }
      console.log(`[Demo Sandbox] Created ${sampleTasks.length} baseline demo tasks.`);
    }
  } catch (err) {
    console.error('[Demo Sandbox Error] ensureDemoBaselineData failed:', err.message);
  }
};

/**
 * Auto-delete demo-created data older than 24 hours (1 day).
 * STRICT CONSTRAINT: ONLY cleans data belonging to demo companies/accounts; never touches real tenants!
 */
const cleanStaleDemoData = async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`[Demo Cleanup Job] Starting 24-hour cleanup for demo sandbox data created before: ${oneDayAgo.toISOString()}`);

    // 1. Identify Demo Company IDs
    const demoCompanies = await Company.find({
      $or: [{ isDemo: true }, { companyCode: DEMO_COMPANY_CODE }]
    }).select('_id name');

    if (!demoCompanies || demoCompanies.length === 0) {
      console.log('[Demo Cleanup Job] No demo company found. Skipping cleanup.');
      return;
    }

    const demoCompanyIds = demoCompanies.map((c) => c._id);

    // 2. Delete test tasks created by visitors (preserve baseline sample tasks)
    const taskResult = await Task.deleteMany({
      company: { $in: demoCompanyIds },
      isDemoBaseline: { $ne: true },
      createdAt: { $lt: oneDayAgo }
    });

    // 3. Delete time sessions created > 24 hours ago
    const sessionResult = await TimeSession.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 4. Delete attendance punches created > 24 hours ago
    const attendanceResult = await Attendance.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 5. Delete leave requests created > 24 hours ago
    const leaveResult = await LeaveRequest.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 6. Delete uploaded documents and clean physical files from uploads/
    const staleDocs = await EmployeeDocument.find({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    let filesUnlinked = 0;
    for (const doc of staleDocs) {
      if (doc.fileUrl) {
        try {
          const relativePath = doc.fileUrl.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
          const fullPath = path.join(__dirname, '../../uploads', relativePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            filesUnlinked++;
          }
        } catch (fileErr) {
          console.warn(`[Demo Cleanup Job] Could not unlink file ${doc.fileUrl}:`, fileErr.message);
        }
      }
    }

    const docResult = await EmployeeDocument.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 7. Delete sticky notes created > 24 hours ago
    const stickyResult = await StickyNote.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 8. Delete salary slips created > 24 hours ago
    const salaryResult = await SalarySlip.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 9. Delete notifications, messages, CRM leads & tickets
    const notifResult = await Notification.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const msgResult = await Message.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const leadResult = await Lead.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const dealResult = await Deal.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const customerResult = await Customer.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const ticketResult = await CompanyTicket.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });
    const swTicketResult = await SoftwareTicket.deleteMany({
      company: { $in: demoCompanyIds },
      createdAt: { $lt: oneDayAgo }
    });

    // 10. Delete any ad-hoc user accounts created by visitors inside the demo company
    const extraUsersResult = await User.deleteMany({
      company: { $in: demoCompanyIds },
      isDemo: { $ne: true },
      createdAt: { $lt: oneDayAgo }
    });

    console.log(
      `[Demo Cleanup Job Completed] ` +
        `Tasks purged: ${taskResult.deletedCount}, ` +
        `TimeSessions: ${sessionResult.deletedCount}, ` +
        `Attendance: ${attendanceResult.deletedCount}, ` +
        `Leaves: ${leaveResult.deletedCount}, ` +
        `Documents: ${docResult.deletedCount} (${filesUnlinked} files deleted), ` +
        `StickyNotes: ${stickyResult.deletedCount}, ` +
        `Extra Users: ${extraUsersResult.deletedCount}.`
    );

    // Re-verify that demo accounts and baseline remain pristine
    await ensureDemoAccountsExist();
  } catch (err) {
    console.error('[Demo Cleanup Job Error]:', err.message);
  }
};

module.exports = {
  DEMO_COMPANY_CODE,
  DEMO_DEFAULT_PASSWORD,
  DEMO_ACCOUNTS_META,
  ensureDemoAccountsExist,
  cleanStaleDemoData
};
