const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Role = require('../models/Role');
const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const TimeSession = require('../models/TimeSession');
const Attendance = require('../models/Attendance');
const AttendancePolicy = require('../models/AttendancePolicy');
const LeaveRequest = require('../models/LeaveRequest');
const LeavePolicy = require('../models/LeavePolicy');
const UserLeaveBalance = require('../models/UserLeaveBalance');
const SalarySlip = require('../models/SalarySlip');
const SalaryStructure = require('../models/SalaryStructure');
const UserSalary = require('../models/UserSalary');
const DocumentFieldConfig = require('../models/DocumentFieldConfig');
const EmployeeDocument = require('../models/EmployeeDocument');
const StickyNote = require('../models/StickyNote');
const Announcement = require('../models/Announcement');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const ClientInvoice = require('../models/ClientInvoice');
const ClientPayment = require('../models/ClientPayment');
const CompanyTicket = require('../models/CompanyTicket');
const Ticket = require('../models/Ticket');
const Holiday = require('../models/Holiday');
const OfferLetter = require('../models/OfferLetter');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('../utils/auditLogger');

// Helper to determine target company ID
const getTargetCompanyId = async (req) => {
  if (req.user.role === 'Super Admin') {
    if (req.query.companyId || req.body?.companyId) {
      return req.query.companyId || req.body?.companyId;
    }
    if (req.companyId || req.user.company?._id || req.user.company) {
      return req.companyId || req.user.company?._id || req.user.company;
    }
    const firstCompany = await Company.findOne({ status: 'Active' });
    return firstCompany?._id || null;
  }
  return req.companyId || req.user.company?._id || req.user.company;
};

// @desc    Get live company data stats & backup overview
// @route   GET /api/backup/stats
// @access  Private (Admin / Super Admin)
exports.getBackupStats = async (req, res) => {
  try {
    const companyId = await getTargetCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'No company identified for backup' });
    }

    const company = await Company.findById(companyId).select('name email phone industry status createdAt autoBackup');
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Run parallel count queries for all collections belonging to this company
    const [
      usersCount,
      rolesCount,
      projectsCount,
      sprintsCount,
      tasksCount,
      timeSessionsCount,
      attendanceCount,
      leavesCount,
      payrollCount,
      documentsCount,
      docFieldsCount,
      stickyNotesCount,
      announcementsCount,
      customersCount,
      leadsCount,
      dealsCount,
      invoicesCount,
      paymentsCount,
      ticketsCount,
      holidaysCount,
      offerLettersCount,
      recentBackupLog,
      recentRestoreLog,
    ] = await Promise.all([
      User.countDocuments({ company: companyId }),
      Role.countDocuments({ company: companyId }),
      Project.countDocuments({ company: companyId }),
      Sprint.countDocuments({ company: companyId }),
      Task.countDocuments({ company: companyId }),
      TimeSession.countDocuments({ company: companyId }),
      Attendance.countDocuments({ company: companyId }),
      LeaveRequest.countDocuments({ company: companyId }),
      SalarySlip.countDocuments({ company: companyId }),
      EmployeeDocument.countDocuments({ company: companyId }),
      DocumentFieldConfig.countDocuments({ company: companyId }),
      StickyNote.countDocuments({ company: companyId }),
      Announcement.countDocuments({ company: companyId }),
      Customer.countDocuments({ company: companyId }),
      Lead.countDocuments({ company: companyId }),
      Deal.countDocuments({ company: companyId }),
      ClientInvoice.countDocuments({ company: companyId }),
      ClientPayment.countDocuments({ company: companyId }),
      CompanyTicket.countDocuments({ company: companyId }),
      Holiday.countDocuments({ company: companyId }),
      OfferLetter.countDocuments({ company: companyId }),
      AuditLog.findOne({ company: companyId, action: 'EXPORT_BACKUP', status: 'SUCCESS' })
        .sort({ createdAt: -1 })
        .select('createdAt userName'),
      AuditLog.findOne({ company: companyId, action: 'RESTORE_BACKUP', status: 'SUCCESS' })
        .sort({ createdAt: -1 })
        .select('createdAt userName details'),
    ]);

    const totalRecords =
      usersCount +
      rolesCount +
      projectsCount +
      sprintsCount +
      tasksCount +
      timeSessionsCount +
      attendanceCount +
      leavesCount +
      payrollCount +
      documentsCount +
      docFieldsCount +
      stickyNotesCount +
      announcementsCount +
      customersCount +
      leadsCount +
      dealsCount +
      invoicesCount +
      paymentsCount +
      ticketsCount +
      holidaysCount +
      offerLettersCount;

    const lastBackupTimestamp =
      company.autoBackup?.lastBackupAt || recentBackupLog?.createdAt || null;

    res.json({
      company,
      counts: {
        users: usersCount,
        roles: rolesCount,
        projects: projectsCount,
        sprints: sprintsCount,
        tasks: tasksCount,
        timeSessions: timeSessionsCount,
        attendance: attendanceCount,
        leaves: leavesCount,
        payroll: payrollCount,
        documents: documentsCount,
        docFields: docFieldsCount,
        stickyNotes: stickyNotesCount,
        announcements: announcementsCount,
        customers: customersCount,
        leads: leadsCount,
        deals: dealsCount,
        invoices: invoicesCount,
        payments: paymentsCount,
        tickets: ticketsCount,
        holidays: holidaysCount,
        offerLetters: offerLettersCount,
        total: totalRecords,
      },
      lastBackupDate: lastBackupTimestamp,
      lastBackupAdmin: recentBackupLog?.userName || 'Company Administrator',
      lastBackup: recentBackupLog,
      lastRestore: recentRestoreLog,
      autoBackup: company.autoBackup || {
        enabled: true,
        frequency: 'weekly',
        lastAutoBackupAt: null,
        lastBackupAt: null,
      },
    });
  } catch (error) {
    console.error('Error fetching backup stats:', error);
    res.status(500).json({ message: 'Failed to fetch backup statistics', error: error.message });
  }
};

// @desc    Generate & download full company data backup (JSON)
// @route   GET /api/backup/export
// @access  Private (Admin / Super Admin)
exports.exportCompanyBackup = async (req, res) => {
  try {
    const companyId = await getTargetCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'No company identified for backup' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Fetch all records for this company across all collections
    const [
      users,
      roles,
      projects,
      sprints,
      tasks,
      timeSessions,
      attendance,
      attendancePolicies,
      leaveRequests,
      leavePolicies,
      userLeaveBalances,
      salarySlips,
      salaryStructures,
      userSalaries,
      documentFieldConfigs,
      employeeDocuments,
      stickyNotes,
      announcements,
      customers,
      leads,
      deals,
      clientInvoices,
      clientPayments,
      companyTickets,
      tickets,
      holidays,
      offerLetters,
    ] = await Promise.all([
      User.find({ company: companyId }).lean(),
      Role.find({ company: companyId }).lean(),
      Project.find({ company: companyId }).lean(),
      Sprint.find({ company: companyId }).lean(),
      Task.find({ company: companyId }).lean(),
      TimeSession.find({ company: companyId }).lean(),
      Attendance.find({ company: companyId }).lean(),
      AttendancePolicy.find({ company: companyId }).lean(),
      LeaveRequest.find({ company: companyId }).lean(),
      LeavePolicy.find({ company: companyId }).lean(),
      UserLeaveBalance.find({ company: companyId }).lean(),
      SalarySlip.find({ company: companyId }).lean(),
      SalaryStructure.find({ company: companyId }).lean(),
      UserSalary.find({ company: companyId }).lean(),
      DocumentFieldConfig.find({ company: companyId }).lean(),
      EmployeeDocument.find({ company: companyId }).lean(),
      StickyNote.find({ company: companyId }).lean(),
      Announcement.find({ company: companyId }).lean(),
      Customer.find({ company: companyId }).lean(),
      Lead.find({ company: companyId }).lean(),
      Deal.find({ company: companyId }).lean(),
      ClientInvoice.find({ company: companyId }).lean(),
      ClientPayment.find({ company: companyId }).lean(),
      CompanyTicket.find({ company: companyId }).lean(),
      Ticket.find({ company: companyId }).lean(),
      Holiday.find({ company: companyId }).lean(),
      OfferLetter.find({ company: companyId }).lean(),
    ]);

    const backupPackage = {
      exportVersion: '2.0',
      exportTimestamp: new Date().toISOString(),
      system: 'Company ERP Management Suite',
      exportedBy: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
      company: {
        _id: company._id,
        name: company.name,
        email: company.email,
        phone: company.phone,
        address: company.address,
        industry: company.industry,
        subscriptionPlan: company.subscriptionPlan,
        status: company.status,
        logo: company.logo,
        letterheadSettings: company.letterheadSettings,
        smtpSettings: company.smtpSettings,
      },
      counts: {
        users: users.length,
        roles: roles.length,
        projects: projects.length,
        sprints: sprints.length,
        tasks: tasks.length,
        timeSessions: timeSessions.length,
        attendance: attendance.length,
        attendancePolicies: attendancePolicies.length,
        leaveRequests: leaveRequests.length,
        leavePolicies: leavePolicies.length,
        userLeaveBalances: userLeaveBalances.length,
        salarySlips: salarySlips.length,
        salaryStructures: salaryStructures.length,
        userSalaries: userSalaries.length,
        documentFieldConfigs: documentFieldConfigs.length,
        employeeDocuments: employeeDocuments.length,
        stickyNotes: stickyNotes.length,
        announcements: announcements.length,
        customers: customers.length,
        leads: leads.length,
        deals: deals.length,
        clientInvoices: clientInvoices.length,
        clientPayments: clientPayments.length,
        companyTickets: companyTickets.length,
        tickets: tickets.length,
        holidays: holidays.length,
        offerLetters: offerLetters.length,
        total:
          users.length +
          projects.length +
          tasks.length +
          attendance.length +
          salarySlips.length +
          employeeDocuments.length +
          stickyNotes.length,
      },
      data: {
        users,
        roles,
        projects,
        sprints,
        tasks,
        timeSessions,
        attendance,
        attendancePolicies,
        leaveRequests,
        leavePolicies,
        userLeaveBalances,
        salarySlips,
        salaryStructures,
        userSalaries,
        documentFieldConfigs,
        employeeDocuments,
        stickyNotes,
        announcements,
        customers,
        leads,
        deals,
        clientInvoices,
        clientPayments,
        companyTickets,
        tickets,
        holidays,
        offerLetters,
      },
    };

    const isAuto = req.query.isAuto === 'true' || req.body?.isAuto === true;

    // Update company autoBackup state
    company.autoBackup = company.autoBackup || {};
    company.autoBackup.lastBackupAt = new Date();
    if (isAuto) {
      company.autoBackup.lastAutoBackupAt = new Date();
    }
    await company.save();

    // Log the backup creation in AuditLog
    await logAudit({
      req,
      action: isAuto ? 'AUTO_BACKUP_DOWNLOAD' : 'EXPORT_BACKUP',
      category: 'BACKUP',
      status: 'SUCCESS',
      details: `${isAuto ? 'Automatic scheduled' : 'Manual'} company data backup containing ${backupPackage.counts.total} items downloaded for ${company.name}`,
    });

    const safeSlug = (company.name || 'company').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${safeSlug}_backup_${dateStamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(JSON.stringify(backupPackage, null, 2));
  } catch (error) {
    console.error('Error generating backup:', error);
    res.status(500).json({ message: 'Failed to generate backup', error: error.message });
  }
};

// @desc    Inspect an uploaded backup file before restoring
// @route   POST /api/backup/inspect
// @access  Private (Admin / Super Admin)
exports.inspectBackup = async (req, res) => {
  try {
    const { backupContent } = req.body;
    if (!backupContent) {
      return res.status(400).json({ message: 'No backup content provided' });
    }

    let parsed = null;
    try {
      parsed = typeof backupContent === 'string' ? JSON.parse(backupContent) : backupContent;
    } catch (parseErr) {
      return res.status(400).json({ message: 'Invalid JSON file. Please provide a valid backup JSON file.' });
    }

    if (!parsed || !parsed.data || typeof parsed.data !== 'object') {
      return res.status(400).json({
        message: 'Unsupported backup format. File must contain valid ERP backup structure.',
      });
    }

    const currentCompanyId = await getTargetCompanyId(req);
    const currentCompany = await Company.findById(currentCompanyId).select('name');

    const backupCompany = parsed.company || {};
    const data = parsed.data || {};

    const counts = {
      users: Array.isArray(data.users) ? data.users.length : 0,
      roles: Array.isArray(data.roles) ? data.roles.length : 0,
      projects: Array.isArray(data.projects) ? data.projects.length : 0,
      sprints: Array.isArray(data.sprints) ? data.sprints.length : 0,
      tasks: Array.isArray(data.tasks) ? data.tasks.length : 0,
      timeSessions: Array.isArray(data.timeSessions) ? data.timeSessions.length : 0,
      attendance: Array.isArray(data.attendance) ? data.attendance.length : 0,
      leaveRequests: Array.isArray(data.leaveRequests) ? data.leaveRequests.length : 0,
      salarySlips: Array.isArray(data.salarySlips) ? data.salarySlips.length : 0,
      employeeDocuments: Array.isArray(data.employeeDocuments) ? data.employeeDocuments.length : 0,
      documentFieldConfigs: Array.isArray(data.documentFieldConfigs) ? data.documentFieldConfigs.length : 0,
      stickyNotes: Array.isArray(data.stickyNotes) ? data.stickyNotes.length : 0,
      announcements: Array.isArray(data.announcements) ? data.announcements.length : 0,
      customers: Array.isArray(data.customers) ? data.customers.length : 0,
      leads: Array.isArray(data.leads) ? data.leads.length : 0,
      deals: Array.isArray(data.deals) ? data.deals.length : 0,
      clientInvoices: Array.isArray(data.clientInvoices) ? data.clientInvoices.length : 0,
      clientPayments: Array.isArray(data.clientPayments) ? data.clientPayments.length : 0,
      tickets: Array.isArray(data.tickets) ? data.tickets.length : 0,
      holidays: Array.isArray(data.holidays) ? data.holidays.length : 0,
      offerLetters: Array.isArray(data.offerLetters) ? data.offerLetters.length : 0,
    };

    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

    const isSameCompany =
      backupCompany._id && currentCompanyId && backupCompany._id.toString() === currentCompanyId.toString();

    const warnings = [];
    if (!isSameCompany && backupCompany.name && currentCompany?.name && backupCompany.name !== currentCompany.name) {
      warnings.push(
        `Backup was created for "${backupCompany.name}". It will be safely imported into your current company "${currentCompany.name}".`
      );
    }
    if (counts.users === 0) {
      warnings.push('Warning: No user/employee accounts found in this backup.');
    }

    res.json({
      valid: true,
      exportVersion: parsed.exportVersion || '1.0',
      exportTimestamp: parsed.exportTimestamp || null,
      exportedBy: parsed.exportedBy || null,
      backupCompany: {
        _id: backupCompany._id,
        name: backupCompany.name || 'Unnamed Company',
        email: backupCompany.email || '',
      },
      currentCompany: {
        _id: currentCompany?._id,
        name: currentCompany?.name,
      },
      isSameCompany,
      counts,
      totalRecords,
      warnings,
    });
  } catch (error) {
    console.error('Error inspecting backup:', error);
    res.status(500).json({ message: 'Failed to inspect backup', error: error.message });
  }
};

// @desc    Restore company data from uploaded backup
// @route   POST /api/backup/restore
// @access  Private (Admin / Super Admin only)
exports.restoreCompanyBackup = async (req, res) => {
  try {
    const { backupContent, mode = 'merge', confirmText = '' } = req.body;
    if (!backupContent) {
      return res.status(400).json({ message: 'Backup content is required' });
    }

    let parsed = null;
    try {
      parsed = typeof backupContent === 'string' ? JSON.parse(backupContent) : backupContent;
    } catch (parseErr) {
      return res.status(400).json({ message: 'Invalid JSON file. Please provide valid backup content.' });
    }

    const targetCompanyId = await getTargetCompanyId(req);
    if (!targetCompanyId) {
      return res.status(400).json({ message: 'Target company not found' });
    }

    const company = await Company.findById(targetCompanyId);
    if (!company) {
      return res.status(404).json({ message: 'Target company not found' });
    }

    // Safety confirmation for replace mode
    if (mode === 'replace' && confirmText !== 'RESTORE') {
      return res.status(400).json({
        message: 'Security validation failed: Please type RESTORE to confirm full data replacement.',
      });
    }

    const data = parsed.data || {};
    const restoredSummary = {};

    // =========================================================================
    // STEP 1: USER RESTORATION & ID MAPPING
    // Map backup user IDs to target company user IDs to maintain relational integrity
    // =========================================================================
    const userIdMap = {}; // oldUserId -> newOrExistingUserId
    const backupUsers = Array.isArray(data.users) ? data.users : [];

    for (const bUser of backupUsers) {
      if (!bUser.email) continue;
      const oldId = bUser._id ? bUser._id.toString() : null;

      // Check if user with this email already exists
      let existingUser = await User.findOne({ email: bUser.email.toLowerCase().trim() });
      if (existingUser) {
        // User exists: link to this user
        if (oldId) userIdMap[oldId] = existingUser._id;

        // If user belongs to this company, update profile details if requested
        if (existingUser.company?.toString() === targetCompanyId.toString() && existingUser._id.toString() !== req.user._id.toString()) {
          existingUser.name = bUser.name || existingUser.name;
          existingUser.designation = bUser.designation || existingUser.designation;
          existingUser.department = bUser.department || existingUser.department;
          existingUser.status = bUser.status || existingUser.status;
          await existingUser.save();
        }
      } else {
        // Create new user under target company
        const newUser = await User.create({
          name: bUser.name || 'Restored User',
          email: bUser.email.toLowerCase().trim(),
          password: bUser.password || '$2a$10$X8/WwK6f8.G11k5oB0wApeX2kLzTqZ.RkJG3kFjU7y/eBq61uN27G', // Default temporary hash if empty
          role: bUser.role || 'User',
          designation: bUser.designation || 'Staff',
          department: bUser.department || 'General',
          status: bUser.status || 'Active',
          company: targetCompanyId,
          createdBy: req.user._id,
        });

        if (oldId) userIdMap[oldId] = newUser._id;
      }
    }
    restoredSummary.users = backupUsers.length;

    // Helper: remap user ID or fallback to current admin
    const mapUser = (uid) => {
      if (!uid) return req.user._id;
      const str = uid._id ? uid._id.toString() : uid.toString();
      return userIdMap[str] || req.user._id;
    };

    // =========================================================================
    // STEP 2: IF REPLACE MODE -> CLEAR OPERATIONAL DATA FOR THIS COMPANY
    // =========================================================================
    if (mode === 'replace') {
      await Promise.all([
        Project.deleteMany({ company: targetCompanyId }),
        Sprint.deleteMany({ company: targetCompanyId }),
        Task.deleteMany({ company: targetCompanyId }),
        TimeSession.deleteMany({ company: targetCompanyId }),
        Attendance.deleteMany({ company: targetCompanyId }),
        LeaveRequest.deleteMany({ company: targetCompanyId }),
        SalarySlip.deleteMany({ company: targetCompanyId }),
        EmployeeDocument.deleteMany({ company: targetCompanyId }),
        DocumentFieldConfig.deleteMany({ company: targetCompanyId }),
        StickyNote.deleteMany({ company: targetCompanyId }),
        Announcement.deleteMany({ company: targetCompanyId }),
        Customer.deleteMany({ company: targetCompanyId }),
        Lead.deleteMany({ company: targetCompanyId }),
        Deal.deleteMany({ company: targetCompanyId }),
        ClientInvoice.deleteMany({ company: targetCompanyId }),
        ClientPayment.deleteMany({ company: targetCompanyId }),
        Holiday.deleteMany({ company: targetCompanyId }),
      ]);
    }

    // =========================================================================
    // STEP 3: RESTORE PROJECTS & SPRINTS & TASKS
    // =========================================================================
    const projectIdMap = {};
    if (Array.isArray(data.projects) && data.projects.length > 0) {
      for (const p of data.projects) {
        const oldPId = p._id ? p._id.toString() : null;
        const newProj = await Project.create({
          company: targetCompanyId,
          name: p.name || 'Untitled Project',
          description: p.description || '',
          status: p.status || 'In Progress',
          priority: p.priority || 'Medium',
          deadline: p.deadline || null,
          startDate: p.startDate || null,
          budget: p.budget || 0,
          members: Array.isArray(p.members) ? p.members.map(mapUser) : [],
          createdBy: mapUser(p.createdBy),
        });
        if (oldPId) projectIdMap[oldPId] = newProj._id;
      }
      restoredSummary.projects = data.projects.length;
    }

    // Restore Sprints
    const sprintIdMap = {};
    if (Array.isArray(data.sprints) && data.sprints.length > 0) {
      for (const s of data.sprints) {
        const oldSId = s._id ? s._id.toString() : null;
        const newSprint = await Sprint.create({
          company: targetCompanyId,
          name: s.name || 'Sprint',
          goal: s.goal || '',
          startDate: s.startDate || null,
          endDate: s.endDate || null,
          status: s.status || 'Planned',
          project: s.project ? projectIdMap[s.project.toString()] || null : null,
          createdBy: mapUser(s.createdBy),
        });
        if (oldSId) sprintIdMap[oldSId] = newSprint._id;
      }
      restoredSummary.sprints = data.sprints.length;
    }

    // Restore Tasks
    if (Array.isArray(data.tasks) && data.tasks.length > 0) {
      const taskDocs = data.tasks.map((t) => ({
        company: targetCompanyId,
        title: t.title || 'Task',
        description: t.description || '',
        status: t.status || 'To Do',
        priority: t.priority || 'Medium',
        dueDate: t.dueDate || null,
        assignedTo: t.assignedTo ? mapUser(t.assignedTo) : null,
        project: t.project ? projectIdMap[t.project.toString()] || null : null,
        sprint: t.sprint ? sprintIdMap[t.sprint.toString()] || null : null,
        checklists: Array.isArray(t.checklists) ? t.checklists : [],
        tags: Array.isArray(t.tags) ? t.tags : [],
        createdBy: mapUser(t.createdBy),
      }));
      await Task.insertMany(taskDocs);
      restoredSummary.tasks = taskDocs.length;
    }

    // =========================================================================
    // STEP 4: RESTORE WORK TIME SESSIONS & TRACKER
    // =========================================================================
    if (Array.isArray(data.timeSessions) && data.timeSessions.length > 0) {
      const sessionDocs = data.timeSessions.map((s) => ({
        company: targetCompanyId,
        user: mapUser(s.user),
        title: s.title || '',
        targetTimelineMinutes: s.targetTimelineMinutes || null,
        status: s.status || 'ended',
        startTime: s.startTime || new Date(),
        endTime: s.endTime || null,
        totalWorkSeconds: s.totalWorkSeconds || 0,
        totalPauseSeconds: s.totalPauseSeconds || 0,
        pauseLogs: Array.isArray(s.pauseLogs) ? s.pauseLogs : [],
        notes: s.notes || '',
      }));
      await TimeSession.insertMany(sessionDocs);
      restoredSummary.timeSessions = sessionDocs.length;
    }

    // =========================================================================
    // STEP 5: RESTORE ATTENDANCE
    // =========================================================================
    if (Array.isArray(data.attendance) && data.attendance.length > 0) {
      const attDocs = data.attendance.map((a) => ({
        company: targetCompanyId,
        user: mapUser(a.user),
        date: a.date ? new Date(a.date) : new Date(),
        status: a.status || 'Present',
        punchInTime: a.punchInTime ? new Date(a.punchInTime) : null,
        punchOutTime: a.punchOutTime ? new Date(a.punchOutTime) : null,
        workingHours: a.workingHours || 0,
        isLate: Boolean(a.isLate),
        isHalfDay: Boolean(a.isHalfDay),
        notes: a.notes || '',
      }));
      await Attendance.insertMany(attDocs);
      restoredSummary.attendance = attDocs.length;
    }

    // =========================================================================
    // STEP 6: RESTORE LEAVES & HOLIDAYS
    // =========================================================================
    if (Array.isArray(data.leaveRequests) && data.leaveRequests.length > 0) {
      const leaveDocs = data.leaveRequests.map((l) => ({
        company: targetCompanyId,
        user: mapUser(l.user),
        leaveType: l.leaveType || 'Casual',
        startDate: l.startDate ? new Date(l.startDate) : new Date(),
        endDate: l.endDate ? new Date(l.endDate) : new Date(),
        days: l.days || 1,
        reason: l.reason || '',
        status: l.status || 'Approved',
        appliedAt: l.appliedAt || new Date(),
        approvedBy: l.approvedBy ? mapUser(l.approvedBy) : null,
      }));
      await LeaveRequest.insertMany(leaveDocs);
      restoredSummary.leaveRequests = leaveDocs.length;
    }

    if (Array.isArray(data.holidays) && data.holidays.length > 0) {
      const holidayDocs = data.holidays.map((h) => ({
        company: targetCompanyId,
        name: h.name || 'Holiday',
        date: h.date ? new Date(h.date) : new Date(),
        type: h.type || 'Public',
      }));
      await Holiday.insertMany(holidayDocs);
      restoredSummary.holidays = holidayDocs.length;
    }

    // =========================================================================
    // STEP 7: RESTORE PAYROLL & SALARY SLIPS
    // =========================================================================
    if (Array.isArray(data.salarySlips) && data.salarySlips.length > 0) {
      const slipDocs = data.salarySlips.map((sl) => ({
        company: targetCompanyId,
        user: mapUser(sl.user),
        month: sl.month || 1,
        year: sl.year || new Date().getFullYear(),
        disbursementStatus: sl.disbursementStatus || 'Paid',
        basicSalary: sl.basicSalary || 0,
        allowances: sl.allowances || 0,
        deductions: sl.deductions || 0,
        netSalary: sl.netSalary || 0,
        paidDate: sl.paidDate || null,
        paymentMethod: sl.paymentMethod || 'Bank Transfer',
        notes: sl.notes || '',
      }));
      await SalarySlip.insertMany(slipDocs);
      restoredSummary.salarySlips = slipDocs.length;
    }

    // =========================================================================
    // STEP 8: RESTORE DYNAMIC DOCUMENTS & FIELD CONFIGS
    // =========================================================================
    const fieldConfigIdMap = {};
    if (Array.isArray(data.documentFieldConfigs) && data.documentFieldConfigs.length > 0) {
      for (const df of data.documentFieldConfigs) {
        const oldId = df._id ? df._id.toString() : null;
        const newField = await DocumentFieldConfig.create({
          company: targetCompanyId,
          fieldName: df.fieldName || 'Document',
          fieldKey: df.fieldKey || df.fieldName?.toLowerCase().replace(/\s+/g, '_'),
          category: df.category || 'Identity',
          description: df.description || '',
          isRequired: Boolean(df.isRequired),
          isActive: df.isActive !== false,
          enableTextValue: Boolean(df.enableTextValue),
          textValidationType: df.textValidationType || 'any',
          textPlaceholder: df.textPlaceholder || '',
          textValidationRegex: df.textValidationRegex || '',
          enableFileUpload: df.enableFileUpload !== false,
          allowedFileTypes: Array.isArray(df.allowedFileTypes) ? df.allowedFileTypes : ['pdf', 'jpg', 'png'],
          maxFileSizeMB: df.maxFileSizeMB || 5,
          order: df.order || 0,
          createdBy: mapUser(df.createdBy),
        });
        if (oldId) fieldConfigIdMap[oldId] = newField._id;
      }
      restoredSummary.documentFieldConfigs = data.documentFieldConfigs.length;
    }

    if (Array.isArray(data.employeeDocuments) && data.employeeDocuments.length > 0) {
      const empDocs = data.employeeDocuments.map((ed) => ({
        company: targetCompanyId,
        user: mapUser(ed.user),
        fieldConfig: ed.fieldConfig ? fieldConfigIdMap[ed.fieldConfig.toString()] || null : null,
        fieldKey: ed.fieldKey || '',
        fieldName: ed.fieldName || 'Document',
        textValue: ed.textValue || '',
        fileUrl: ed.fileUrl || '',
        originalFileName: ed.originalFileName || '',
        fileSize: ed.fileSize || 0,
        mimeType: ed.mimeType || '',
        status: ed.status || 'Approved',
        verificationNotes: ed.verificationNotes || '',
        verifiedBy: ed.verifiedBy ? mapUser(ed.verifiedBy) : null,
        verifiedAt: ed.verifiedAt || null,
        submittedAt: ed.submittedAt || new Date(),
      }));
      await EmployeeDocument.insertMany(empDocs);
      restoredSummary.employeeDocuments = empDocs.length;
    }

    // =========================================================================
    // STEP 9: RESTORE 3D STICKY NOTES
    // =========================================================================
    if (Array.isArray(data.stickyNotes) && data.stickyNotes.length > 0) {
      const noteDocs = data.stickyNotes.map((sn) => ({
        company: targetCompanyId,
        user: mapUser(sn.user),
        title: sn.title || '',
        content: sn.content || '',
        color: sn.color || 'yellow',
        fontStyle: sn.fontStyle || 'caveat',
        textColor: sn.textColor || '',
        isPinned: Boolean(sn.isPinned),
        isCompleted: Boolean(sn.isCompleted),
        priority: sn.priority || 'Medium',
        tags: Array.isArray(sn.tags) ? sn.tags : [],
        reminderAt: sn.reminderAt || null,
        position: sn.position || { x: null, y: null, zIndex: 1, rotation: 0 },
      }));
      await StickyNote.insertMany(noteDocs);
      restoredSummary.stickyNotes = noteDocs.length;
    }

    // =========================================================================
    // STEP 10: RESTORE ANNOUNCEMENTS & CRM
    // =========================================================================
    if (Array.isArray(data.announcements) && data.announcements.length > 0) {
      const annDocs = data.announcements.map((an) => ({
        company: targetCompanyId,
        title: an.title || 'Announcement',
        message: an.message || '',
        priority: an.priority || 'Normal',
        createdBy: mapUser(an.createdBy),
      }));
      await Announcement.insertMany(annDocs);
      restoredSummary.announcements = annDocs.length;
    }

    if (Array.isArray(data.customers) && data.customers.length > 0) {
      const custDocs = data.customers.map((c) => ({
        company: targetCompanyId,
        name: c.name || 'Customer',
        email: c.email || '',
        phone: c.phone || '',
        companyName: c.companyName || '',
        status: c.status || 'Active',
      }));
      await Customer.insertMany(custDocs);
      restoredSummary.customers = custDocs.length;
    }

    if (Array.isArray(data.leads) && data.leads.length > 0) {
      const leadDocs = data.leads.map((l) => ({
        company: targetCompanyId,
        name: l.name || 'Lead',
        email: l.email || '',
        phone: l.phone || '',
        source: l.source || 'Website',
        status: l.status || 'New',
        assignedTo: l.assignedTo ? mapUser(l.assignedTo) : null,
      }));
      await Lead.insertMany(leadDocs);
      restoredSummary.leads = leadDocs.length;
    }

    // Record Restore in Audit Log
    await logAudit({
      req,
      action: 'RESTORE_BACKUP',
      category: 'BACKUP',
      status: 'SUCCESS',
      details: `Restored company backup in ${mode.toUpperCase()} mode. Processed: Users (${restoredSummary.users || 0}), Projects (${restoredSummary.projects || 0}), Tasks (${restoredSummary.tasks || 0}), Attendance (${restoredSummary.attendance || 0}), Documents (${restoredSummary.employeeDocuments || 0})`,
    });

    res.json({
      message: 'Company data backup successfully restored!',
      mode,
      company: {
        _id: company._id,
        name: company.name,
      },
      restoredSummary,
    });
  } catch (error) {
    console.error('Error restoring company backup:', error);
    res.status(500).json({ message: 'Failed to restore company backup', error: error.message });
  }
};

// @desc    Get backup & restore history audit logs
// @route   GET /api/backup/history
// @access  Private (Admin / Super Admin)
exports.getBackupHistory = async (req, res) => {
  try {
    const companyId = await getTargetCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'No company identified' });
    }

    const logs = await AuditLog.find({
      company: companyId,
      action: { $in: ['EXPORT_BACKUP', 'RESTORE_BACKUP', 'AUTO_BACKUP_DOWNLOAD'] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('action status userName userEmail details createdAt');

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch backup history', error: error.message });
  }
};

// @desc    Update auto-backup configuration
// @route   PATCH /api/backup/auto-config
// @access  Private (Admin / Super Admin)
exports.updateAutoBackupConfig = async (req, res) => {
  try {
    const companyId = await getTargetCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'No company identified' });
    }

    const { enabled, frequency } = req.body;
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    company.autoBackup = company.autoBackup || {};
    if (enabled !== undefined) company.autoBackup.enabled = Boolean(enabled);
    if (frequency && ['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) {
      company.autoBackup.frequency = frequency;
    }

    await company.save();

    await logAudit({
      req,
      action: 'UPDATE_AUTO_BACKUP_CONFIG',
      category: 'BACKUP',
      status: 'SUCCESS',
      details: `Updated auto-backup settings: Enabled=${company.autoBackup.enabled}, Frequency=${company.autoBackup.frequency}`,
    });

    res.json({
      message: 'Auto-backup settings updated successfully',
      autoBackup: company.autoBackup,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update auto-backup settings', error: error.message });
  }
};

// @desc    Record auto-backup download event
// @route   POST /api/backup/record-auto
// @access  Private (Admin / Super Admin)
exports.recordAutoBackup = async (req, res) => {
  try {
    const companyId = await getTargetCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'No company identified' });
    }

    const company = await Company.findById(companyId);
    if (company) {
      company.autoBackup = company.autoBackup || {};
      company.autoBackup.lastAutoBackupAt = new Date();
      company.autoBackup.lastBackupAt = new Date();
      await company.save();
    }

    await logAudit({
      req,
      action: 'AUTO_BACKUP_DOWNLOAD',
      category: 'BACKUP',
      status: 'SUCCESS',
      details: `Weekly automatic local device backup downloaded for ${company?.name || 'Company'}`,
    });

    res.json({ message: 'Auto backup logged', autoBackup: company?.autoBackup });
  } catch (error) {
    res.status(500).json({ message: 'Failed to record auto-backup', error: error.message });
  }
};
