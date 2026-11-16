const Project = require('../models/Project');
const User = require('../models/User');
const ClientQuery = require('../models/ClientQuery');
const ClientInvoice = require('../models/ClientInvoice');
const { sendRealTimeNotification } = require('../utils/socketService');
const { logAudit } = require('../utils/auditLogger');

// Helper to get company ID from authenticated user
const getUserCompanyId = (user) => {
  if (!user) return null;
  return user.company?._id || user.company;
};

// Calculate financial metrics for a single project
const calculateProjectFinancials = (project) => {
  const milestones = project.billingMilestones || [];
  let totalMilestonesCost = 0;
  let totalPaid = 0;

  milestones.forEach((m) => {
    totalMilestonesCost += Number(m.amount) || 0;
    if (m.status === 'Paid') {
      totalPaid += Number(m.paidAmount) || Number(m.amount) || 0;
    } else if (m.status === 'Partially Paid') {
      totalPaid += Number(m.paidAmount) || 0;
    }
  });

  // Project budget can be explicitly set or calculated from milestones
  const totalCost = Number(project.budget) > 0 ? Number(project.budget) : totalMilestonesCost;
  const totalPending = Math.max(0, totalCost - totalPaid);
  const paidPercentage = totalCost > 0 ? Math.min(100, Math.round((totalPaid / totalCost) * 100)) : 0;

  return {
    totalCost,
    totalPaid,
    totalPending,
    paidPercentage,
    currency: project.currency || 'INR',
  };
};

// ============================================================
// 1. CLIENT FACING APIS (User with role 'Client')
// ============================================================

// @desc    Get complete client portal dashboard summary
// @route   GET /api/client-portal/dashboard
// @access  Private (Client / Admin)
const getClientDashboard = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    // Query projects assigned to this client (by ObjectId or email)
    const projectQuery = {
      company: companyId,
      $or: [{ client: req.user._id }, { clientEmail: req.user.email?.toLowerCase() }],
    };

    const projects = await Project.find(projectQuery)
      .populate('projectManager', 'name email phone role profilePicture')
      .sort({ createdAt: -1 });

    let overallTotalCost = 0;
    let overallTotalPaid = 0;
    let activeProjectsCount = 0;
    let totalProgressSum = 0;
    const allInvoices = [];

    const enrichedProjects = projects.map((p) => {
      const financials = calculateProjectFinancials(p);
      overallTotalCost += financials.totalCost;
      overallTotalPaid += financials.totalPaid;
      totalProgressSum += Number(p.progress) || 0;

      if (p.status !== 'Completed') {
        activeProjectsCount += 1;
      }

      // Collect invoices/milestones
      (p.billingMilestones || []).forEach((m) => {
        allInvoices.push({
          _id: m._id,
          projectId: p._id,
          projectName: p.name,
          invoiceNumber: m.invoiceNumber || `INV-${p.name.slice(0, 3).toUpperCase()}-${m.milestoneNumber}`,
          title: m.title,
          description: m.description,
          amount: m.amount,
          currency: p.currency || 'INR',
          dueDate: m.dueDate,
          status: m.status,
          paidAmount: m.paidAmount,
          paidAt: m.paidAt,
          paymentMethod: m.paymentMethod,
          paymentReference: m.paymentReference,
          notes: m.notes,
        });
      });

      return {
        ...p.toObject(),
        financials,
      };
    });

    const overallTotalPending = Math.max(0, overallTotalCost - overallTotalPaid);
    const overallPaidPercentage =
      overallTotalCost > 0 ? Math.min(100, Math.round((overallTotalPaid / overallTotalCost) * 100)) : 0;
    const avgProgress = projects.length > 0 ? Math.round(totalProgressSum / projects.length) : 0;

    // Sort invoices by due date or paid date
    allInvoices.sort((a, b) => new Date(b.dueDate || b.paidAt || 0) - new Date(a.dueDate || a.paidAt || 0));

    // Also include formal tax invoices issued for this client or their assigned projects
    const projectIds = projects.map((p) => p._id);
    const formalInvoices = await ClientInvoice.find({
      company: companyId,
      $or: [
        { client: req.user._id },
        { clientEmail: req.user.email?.toLowerCase().trim() },
        { project: { $in: projectIds } },
      ],
      status: { $ne: 'Cancelled' },
    }).sort({ invoiceDate: -1 });

    formalInvoices.forEach((fi) => {
      const alreadyIncluded = allInvoices.some((m) => m.invoiceNumber === fi.invoiceNumber);
      if (!alreadyIncluded) {
        allInvoices.push({
          _id: fi._id,
          projectId: fi.project,
          projectName: fi.projectName || 'General Billing',
          invoiceNumber: fi.invoiceNumber,
          title: fi.invoiceType || 'Tax Invoice',
          description: fi.items?.map((it) => it.description).join(', ') || 'Professional Services',
          amount: fi.totalAmount,
          currency: fi.currency || 'INR',
          dueDate: fi.dueDate,
          status: fi.status,
          paidAmount: fi.paidAmount,
          notes: fi.notes,
          isTaxInvoice: true,
        });
      }
    });

    // Fetch recent client queries
    const recentQueries = await ClientQuery.find({
      company: companyId,
      client: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      client: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        companyName: req.user.company?.name || 'Company Workspace',
      },
      summary: {
        totalProjects: projects.length,
        activeProjects: activeProjectsCount,
        totalCost: overallTotalCost,
        totalPaid: overallTotalPaid,
        totalPending: overallTotalPending,
        paidPercentage: overallPaidPercentage,
        averageProgress: avgProgress,
        totalInvoices: allInvoices.length,
      },
      projects: enrichedProjects,
      invoices: allInvoices,
      recentQueries,
    });
  } catch (error) {
    console.error('Error in getClientDashboard:', error);
    res.status(500).json({ message: 'Failed to fetch client dashboard', error: error.message });
  }
};

// @desc    Get all projects for client
// @route   GET /api/client-portal/projects
// @access  Private (Client)
const getClientProjects = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const projects = await Project.find({
      company: companyId,
      $or: [{ client: req.user._id }, { clientEmail: req.user.email?.toLowerCase() }],
    })
      .populate('projectManager', 'name email phone role profilePicture')
      .sort({ createdAt: -1 });

    const enriched = projects.map((p) => ({
      ...p.toObject(),
      financials: calculateProjectFinancials(p),
    }));

    res.json({ success: true, projects: enriched });
  } catch (error) {
    console.error('Error fetching client projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects', error: error.message });
  }
};

// @desc    Get all invoices / payment milestones for client
// @route   GET /api/client-portal/invoices
// @access  Private (Client)
const getClientInvoices = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const projects = await Project.find({
      company: companyId,
      $or: [{ client: req.user._id }, { clientEmail: req.user.email?.toLowerCase() }],
    });

    const projectIds = projects.map((p) => p._id);
    const allInvoices = [];
    projects.forEach((p) => {
      (p.billingMilestones || []).forEach((m) => {
        allInvoices.push({
          _id: m._id,
          projectId: p._id,
          projectName: p.name,
          clientCompany: p.clientCompany,
          invoiceNumber: m.invoiceNumber || `INV-${p.name.slice(0, 3).toUpperCase()}-${m.milestoneNumber}`,
          title: m.title,
          description: m.description,
          amount: m.amount,
          currency: p.currency || 'INR',
          dueDate: m.dueDate,
          status: m.status,
          paidAmount: m.paidAmount,
          paidAt: m.paidAt,
          paymentMethod: m.paymentMethod,
          paymentReference: m.paymentReference,
          notes: m.notes,
        });
      });
    });

    // Also pull formal tax invoices for assigned projects
    const formalInvoices = await ClientInvoice.find({
      company: companyId,
      $or: [
        { client: req.user._id },
        { clientEmail: req.user.email?.toLowerCase().trim() },
        { project: { $in: projectIds } },
      ],
      status: { $ne: 'Cancelled' },
    }).sort({ invoiceDate: -1 });

    formalInvoices.forEach((fi) => {
      const exists = allInvoices.some((m) => m.invoiceNumber === fi.invoiceNumber);
      if (!exists) {
        allInvoices.push({
          _id: fi._id,
          projectId: fi.project,
          projectName: fi.projectName || 'General Project',
          invoiceNumber: fi.invoiceNumber,
          title: fi.invoiceType || 'Tax Invoice',
          description: fi.items?.map((it) => it.description).join(', ') || 'Services',
          amount: fi.totalAmount,
          currency: fi.currency || 'INR',
          dueDate: fi.dueDate,
          status: fi.status,
          paidAmount: fi.paidAmount,
          paidAt: fi.paidAmount > 0 ? fi.updatedAt : null,
          notes: fi.notes,
          isTaxInvoice: true,
        });
      }
    });

    allInvoices.sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0));

    res.json({ success: true, invoices: allInvoices });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

// @desc    Client submits a query / question regarding a project
// @route   POST /api/client-portal/queries
// @access  Private (Client)
const submitClientQuery = async (req, res) => {
  try {
    const { projectId, subject, message, category } = req.body;
    const companyId = getUserCompanyId(req.user);

    if (!projectId || !subject || !message) {
      return res.status(400).json({ message: 'Project, subject, and message are required' });
    }

    const project = await Project.findOne({
      _id: projectId,
      company: companyId,
      $or: [{ client: req.user._id }, { clientEmail: req.user.email?.toLowerCase() }],
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found or unauthorized' });
    }

    const clientQuery = new ClientQuery({
      company: companyId,
      project: project._id,
      projectName: project.name,
      client: req.user._id,
      clientName: req.user.name,
      clientEmail: req.user.email,
      subject: subject.trim(),
      message: message.trim(),
      category: category || 'Progress Update',
      status: 'Open',
    });

    await clientQuery.save();

    // Notify Project Manager or Admins
    if (project.projectManager) {
      sendRealTimeNotification(project.projectManager, {
        title: `Client Query: ${project.name}`,
        message: `${req.user.name}: "${subject}"`,
        type: 'query',
        link: '/admin/client-portal',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Your query has been sent to the project management team.',
      query: clientQuery,
    });
  } catch (error) {
    console.error('Error submitting client query:', error);
    res.status(500).json({ message: 'Failed to submit query', error: error.message });
  }
};

// @desc    Get client's own query history
// @route   GET /api/client-portal/queries
// @access  Private (Client)
const getClientQueries = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const queries = await ClientQuery.find({
      company: companyId,
      client: req.user._id,
    }).sort({ createdAt: -1 });

    res.json({ success: true, queries });
  } catch (error) {
    console.error('Error fetching client queries:', error);
    res.status(500).json({ message: 'Failed to fetch queries', error: error.message });
  }
};

// ============================================================
// 2. ADMIN & PROJECT MANAGER APIS
// ============================================================

// @desc    Admin: Overview of all client projects, billings & revenue
// @route   GET /api/client-portal/admin/overview
// @access  Private (Admin / Project Manager)
const getAdminClientPortalOverview = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const [projects, clientUsers, openQueriesCount] = await Promise.all([
      Project.find({ company: companyId })
        .populate('client', 'name email phone company')
        .populate('projectManager', 'name email role')
        .sort({ createdAt: -1 }),
      User.find({ company: companyId, role: 'Client' })
        .select('name email phone designation createdAt')
        .sort({ name: 1 }),
      ClientQuery.countDocuments({ company: companyId, status: 'Open' }),
    ]);

    let overallBudget = 0;
    let overallPaid = 0;
    let projectsWithClientsCount = 0;

    const enrichedProjects = projects.map((p) => {
      const fin = calculateProjectFinancials(p);
      overallBudget += fin.totalCost;
      overallPaid += fin.totalPaid;
      if (p.client || p.clientEmail) {
        projectsWithClientsCount += 1;
      }
      return {
        ...p.toObject(),
        financials: fin,
      };
    });

    const overallPending = Math.max(0, overallBudget - overallPaid);
    const collectionRate =
      overallBudget > 0 ? Math.min(100, Math.round((overallPaid / overallBudget) * 100)) : 0;

    // Enrich client accounts with all their assigned projects
    const enrichedClients = clientUsers.map((client) => {
      const assignedProjects = projects
        .filter(
          (p) =>
            (p.client && (p.client._id?.toString() === client._id.toString() || p.client.toString() === client._id.toString())) ||
            (p.clientEmail && p.clientEmail.toLowerCase() === client.email?.toLowerCase())
        )
        .map((p) => ({
          _id: p._id,
          name: p.name,
          status: p.status,
          progress: p.progress,
          budget: p.budget,
          currency: p.currency || 'INR',
        }));

      return {
        ...client.toObject(),
        assignedProjects,
        projectsCount: assignedProjects.length,
      };
    });

    res.json({
      success: true,
      summary: {
        totalProjects: projects.length,
        projectsWithClients: projectsWithClientsCount,
        totalClients: clientUsers.length,
        overallBudget,
        overallPaid,
        overallPending,
        collectionRate,
        openQueries: openQueriesCount,
      },
      projects: enrichedProjects,
      clients: enrichedClients,
    });
  } catch (error) {
    console.error('Error in getAdminClientPortalOverview:', error);
    res.status(500).json({ message: 'Failed to fetch overview', error: error.message });
  }
};

// @desc    Admin: Update Project Client & Billing settings
// @route   PUT /api/client-portal/admin/projects/:id/billing
// @access  Private (Admin / PM)
const updateProjectBilling = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      budget,
      currency,
      progress,
      liveUrl,
      stagingUrl,
      projectManagerId,
    } = req.body;

    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (clientId) {
      const clientUser = await User.findOne({ _id: clientId, company: companyId });
      if (clientUser) {
        project.client = clientUser._id;
        project.clientName = clientUser.name;
        project.clientEmail = clientUser.email;
        if (clientUser.phone) project.clientPhone = clientUser.phone;
      }
    } else if (clientId === null) {
      project.client = null;
    }

    if (clientName !== undefined) project.clientName = clientName.trim();
    if (clientEmail !== undefined) project.clientEmail = clientEmail.trim().toLowerCase();
    if (clientPhone !== undefined) project.clientPhone = clientPhone.trim();
    if (clientCompany !== undefined) project.clientCompany = clientCompany.trim();

    if (budget !== undefined) project.budget = Number(budget) || 0;
    if (currency) project.currency = currency.toUpperCase().trim();
    if (progress !== undefined) project.progress = Math.min(100, Math.max(0, Number(progress) || 0));
    if (liveUrl !== undefined) project.liveUrl = liveUrl.trim();
    if (stagingUrl !== undefined) project.stagingUrl = stagingUrl.trim();

    if (projectManagerId) {
      const pmUser = await User.findOne({ _id: projectManagerId, company: companyId }).select('name');
      project.projectManager = pmUser ? pmUser._id : null;
      project.projectManagerName = pmUser ? pmUser.name : '';
    }

    await project.save();

    res.json({
      success: true,
      message: 'Project client and billing details updated successfully.',
      project,
      financials: calculateProjectFinancials(project),
    });
  } catch (error) {
    console.error('Error updating project billing:', error);
    res.status(500).json({ message: 'Failed to update billing', error: error.message });
  }
};

// @desc    Admin: Add a billing milestone / invoice to project
// @route   POST /api/client-portal/admin/projects/:id/milestones
// @access  Private (Admin / PM)
const addProjectMilestone = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { title, description, amount, dueDate, status, notes } = req.body;

    if (!title || amount === undefined) {
      return res.status(400).json({ message: 'Milestone title and amount are required' });
    }

    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const currentCount = project.billingMilestones.length;
    const milestoneNumber = currentCount + 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${project.name.slice(0, 3).toUpperCase()}-${year}-${String(milestoneNumber).padStart(2, '0')}`;

    const milestone = {
      milestoneNumber,
      title: title.trim(),
      description: description ? description.trim() : '',
      amount: Number(amount) || 0,
      dueDate: dueDate || null,
      status: status || 'Pending',
      paidAmount: status === 'Paid' ? Number(amount) || 0 : 0,
      paidAt: status === 'Paid' ? new Date() : null,
      invoiceNumber,
      invoiceDate: new Date(),
      notes: notes || '',
    };

    project.billingMilestones.push(milestone);

    // If project budget was 0, automatically synchronize budget to sum of milestones
    const sumAmounts = project.billingMilestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
    if (!project.budget || project.budget < sumAmounts) {
      project.budget = sumAmounts;
    }

    await project.save();

    res.status(201).json({
      success: true,
      message: 'Milestone added successfully.',
      milestones: project.billingMilestones,
      financials: calculateProjectFinancials(project),
    });
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.status(500).json({ message: 'Failed to add milestone', error: error.message });
  }
};

// @desc    Admin: Update milestone or record client payment
// @route   PUT /api/client-portal/admin/projects/:id/milestones/:milestoneId
// @access  Private (Admin / PM)
const updateProjectMilestone = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const {
      title,
      description,
      amount,
      dueDate,
      status,
      paidAmount,
      paidAt,
      paymentMethod,
      paymentReference,
      notes,
    } = req.body;

    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const milestone = project.billingMilestones.id(req.params.milestoneId);
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    if (title) milestone.title = title.trim();
    if (description !== undefined) milestone.description = description.trim();
    if (amount !== undefined) milestone.amount = Number(amount) || 0;
    if (dueDate !== undefined) milestone.dueDate = dueDate;
    if (notes !== undefined) milestone.notes = notes;

    // Payment recording
    if (status) {
      milestone.status = status;
      if (status === 'Paid') {
        milestone.paidAmount = paidAmount !== undefined ? Number(paidAmount) : milestone.amount;
        milestone.paidAt = paidAt || new Date();
        if (paymentMethod) milestone.paymentMethod = paymentMethod;
        if (paymentReference) milestone.paymentReference = paymentReference.trim();
      } else if (status === 'Pending') {
        milestone.paidAmount = 0;
        milestone.paidAt = null;
      } else if (status === 'Partially Paid') {
        milestone.paidAmount = Number(paidAmount) || 0;
        milestone.paidAt = paidAt || new Date();
        if (paymentMethod) milestone.paymentMethod = paymentMethod;
        if (paymentReference) milestone.paymentReference = paymentReference.trim();
      }
    }

    await project.save();

    // Notify client if linked
    if (status === 'Paid' && project.client) {
      sendRealTimeNotification(project.client, {
        title: `Payment Receipt: ${milestone.invoiceNumber}`,
        message: `Your payment of ${project.currency || 'INR'} ${milestone.paidAmount} for "${milestone.title}" has been acknowledged.`,
        type: 'billing',
        link: '/client/invoices',
      });
    }

    res.json({
      success: true,
      message: 'Milestone updated successfully.',
      milestone,
      financials: calculateProjectFinancials(project),
    });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ message: 'Failed to update milestone', error: error.message });
  }
};

// @desc    Admin: Delete a milestone
// @route   DELETE /api/client-portal/admin/projects/:id/milestones/:milestoneId
// @access  Private (Admin / PM)
const deleteProjectMilestone = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    project.billingMilestones.pull(req.params.milestoneId);
    await project.save();

    res.json({
      success: true,
      message: 'Milestone removed successfully.',
      financials: calculateProjectFinancials(project),
    });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.status(500).json({ message: 'Failed to delete milestone', error: error.message });
  }
};

// @desc    Admin: Quick create client login account
// @route   POST /api/client-portal/admin/clients
// @access  Private (Admin)
const createClientAccount = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { name, email, password, phone, clientCompany, projectId, projectIds } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Client name, email, and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user exists
    let clientUser = await User.findOne({ email: cleanEmail });
    if (clientUser) {
      return res.status(400).json({ message: `A user with email "${cleanEmail}" already exists.` });
    }

    clientUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: password.trim(),
      role: 'Client',
      company: companyId,
      phone: phone ? phone.trim() : '',
      designation: clientCompany ? `Client (${clientCompany.trim()})` : 'Client',
      status: 'Active',
      requiresPasswordChange: false,
    });

    await clientUser.save();

    // If projectIds (array) or projectId (single) provided, assign projects immediately
    const targetProjectIds = Array.isArray(projectIds)
      ? projectIds.filter(Boolean)
      : projectId
      ? [projectId]
      : [];

    if (targetProjectIds.length > 0) {
      await Project.updateMany(
        { _id: { $in: targetProjectIds }, company: companyId },
        {
          $set: {
            client: clientUser._id,
            clientName: clientUser.name,
            clientEmail: clientUser.email,
            clientPhone: clientUser.phone || '',
            ...(clientCompany ? { clientCompany: clientCompany.trim() } : {}),
          },
        }
      );
    }

    logAudit({
      req,
      action: 'CLIENT_ACCOUNT_CREATED',
      category: 'AUTH',
      status: 'SUCCESS',
      details: { email: cleanEmail, name: clientUser.name },
    });

    res.status(201).json({
      success: true,
      message: `Client account created for ${clientUser.name} (${cleanEmail}). The client can now log in at /login.`,
      client: {
        _id: clientUser._id,
        name: clientUser.name,
        email: clientUser.email,
        phone: clientUser.phone,
        role: clientUser.role,
      },
    });
  } catch (error) {
    console.error('Error creating client account:', error);
    res.status(500).json({ message: 'Failed to create client account', error: error.message });
  }
};

// @desc    Admin: Register client credentials and link directly to a specific project
// @route   POST /api/client-portal/admin/projects/:id/client
// @access  Private (Admin / PM)
const registerProjectClient = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { name, email, password, phone, clientCompany } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Client name and email (Login ID) are required' });
    }

    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let clientUser = await User.findOne({ email: cleanEmail });

    if (clientUser) {
      // If user exists but is NOT a client, reject
      if (clientUser.role !== 'Client') {
        return res.status(400).json({
          message: `The email "${cleanEmail}" is already registered as an internal team member with role "${clientUser.role}". Please provide a dedicated client email address.`,
        });
      }

      // Update client info
      clientUser.name = name.trim();
      if (phone) clientUser.phone = phone.trim();
      if (clientCompany) clientUser.designation = `Client (${clientCompany.trim()})`;

      // If password is provided, update password
      if (password && password.trim()) {
        if (password.trim().length < 6) {
          return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        clientUser.password = password.trim(); // Will be hashed by pre('save')
      }
      await clientUser.save();
    } else {
      if (!password || password.trim().length < 6) {
        return res.status(400).json({ message: 'A password of at least 6 characters is required for new client accounts' });
      }

      clientUser = new User({
        name: name.trim(),
        email: cleanEmail,
        password: password.trim(),
        role: 'Client',
        company: companyId,
        phone: phone ? phone.trim() : '',
        designation: clientCompany ? `Client (${clientCompany.trim()})` : 'Client',
        status: 'Active',
        requiresPasswordChange: false,
      });

      await clientUser.save();
    }

    // Link client to this project
    project.client = clientUser._id;
    project.clientName = clientUser.name;
    project.clientEmail = clientUser.email;
    project.clientPhone = clientUser.phone || '';
    if (clientCompany) project.clientCompany = clientCompany.trim();
    await project.save();

    logAudit({
      req,
      action: 'PROJECT_CLIENT_REGISTERED',
      category: 'AUTH',
      status: 'SUCCESS',
      details: {
        projectId: project._id,
        projectName: project.name,
        clientEmail: clientUser.email,
        clientName: clientUser.name,
      },
    });

    res.status(200).json({
      success: true,
      message: `Client ${clientUser.name} (${cleanEmail}) has been registered and assigned to project "${project.name}". The client can log in at /login.`,
      project: {
        _id: project._id,
        name: project.name,
        client: clientUser._id,
        clientName: clientUser.name,
        clientEmail: clientUser.email,
        clientPhone: clientUser.phone,
        clientCompany: project.clientCompany,
      },
      client: {
        _id: clientUser._id,
        name: clientUser.name,
        email: clientUser.email,
        phone: clientUser.phone,
        role: clientUser.role,
      },
      credentials: {
        email: cleanEmail,
        password: password ? password.trim() : '(Existing password unchanged)',
        loginUrl: '/login',
      },
    });
  } catch (error) {
    console.error('Error registering project client:', error);
    res.status(500).json({ message: 'Failed to register client', error: error.message });
  }
};

// @desc    Admin: Reset password for the client assigned to a project
// @route   PUT /api/client-portal/admin/projects/:id/client-password
// @access  Private (Admin / PM)
const resetProjectClientPassword = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!project.client && !project.clientEmail) {
      return res.status(400).json({ message: 'No client is assigned to this project yet.' });
    }

    let clientUser = null;
    if (project.client) {
      clientUser = await User.findOne({ _id: project.client, company: companyId });
    }
    if (!clientUser && project.clientEmail) {
      clientUser = await User.findOne({ email: project.clientEmail.toLowerCase(), company: companyId });
    }

    if (!clientUser) {
      return res.status(404).json({ message: 'Client account not found' });
    }

    clientUser.password = newPassword.trim();
    await clientUser.save();

    res.json({
      success: true,
      message: `Password for client ${clientUser.name} (${clientUser.email}) has been successfully updated.`,
      credentials: {
        email: clientUser.email,
        newPassword: newPassword.trim(),
        loginUrl: '/login',
      },
    });
  } catch (error) {
    console.error('Error resetting client password:', error);
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};

// @desc    Admin: Unlink client from project
// @route   DELETE /api/client-portal/admin/projects/:id/client
// @access  Private (Admin / PM)
const unlinkProjectClient = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const project = await Project.findOne({ _id: req.params.id, company: companyId });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    project.client = null;
    project.clientName = '';
    project.clientEmail = '';
    project.clientPhone = '';
    project.clientCompany = '';
    await project.save();

    res.json({
      success: true,
      message: `Client unlinked from project "${project.name}" successfully.`,
      project,
    });
  } catch (error) {
    console.error('Error unlinking client:', error);
    res.status(500).json({ message: 'Failed to unlink client', error: error.message });
  }
};

// @desc    Admin: List all client queries
// @route   GET /api/client-portal/admin/queries
// @access  Private (Admin / PM)
const getAdminClientQueries = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { status, projectId } = req.query;

    const query = { company: companyId };
    if (status && status !== 'ALL') query.status = status;
    if (projectId && projectId !== 'ALL') query.project = projectId;

    const queries = await ClientQuery.find(query)
      .populate('project', 'name progress status')
      .populate('client', 'name email phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, queries });
  } catch (error) {
    console.error('Error fetching admin client queries:', error);
    res.status(500).json({ message: 'Failed to fetch client queries', error: error.message });
  }
};

// @desc    Admin: Reply to client query
// @route   PUT /api/client-portal/admin/queries/:id/reply
// @access  Private (Admin / PM)
const replyClientQuery = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { response, status = 'Answered' } = req.body;

    if (!response || !response.trim()) {
      return res.status(400).json({ message: 'Response message is required' });
    }

    const clientQuery = await ClientQuery.findOne({ _id: req.params.id, company: companyId });
    if (!clientQuery) {
      return res.status(404).json({ message: 'Query not found' });
    }

    clientQuery.response = response.trim();
    clientQuery.status = status;
    clientQuery.respondedAt = new Date();
    clientQuery.respondedBy = req.user._id;
    clientQuery.respondedByName = req.user.name;

    await clientQuery.save();

    // Real-time notification to client
    sendRealTimeNotification(clientQuery.client, {
      title: `Response to your query: "${clientQuery.subject}"`,
      message: `${req.user.name} responded: ${response.trim().slice(0, 70)}...`,
      type: 'query',
      link: '/client/portal',
    });

    res.json({
      success: true,
      message: 'Reply sent to client successfully.',
      query: clientQuery,
    });
  } catch (error) {
    console.error('Error replying to client query:', error);
    res.status(500).json({ message: 'Failed to reply to query', error: error.message });
  }
};

// @desc    Admin: Get all company projects with flag if assigned to client
// @route   GET /api/client-portal/admin/clients/:clientId/projects
// @access  Private (Admin / PM)
const getClientAssignedProjects = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { clientId } = req.params;

    const clientUser = await User.findOne({
      _id: clientId,
      company: companyId,
      role: 'Client',
    });

    if (!clientUser) {
      return res.status(404).json({ message: 'Client account not found' });
    }

    const allProjects = await Project.find({ company: companyId })
      .select('name status progress budget currency client clientName clientEmail')
      .sort({ name: 1 });

    const projectsWithAssignment = allProjects.map((p) => {
      const isAssignedToThisClient =
        (p.client && p.client.toString() === clientUser._id.toString()) ||
        (p.clientEmail && p.clientEmail.toLowerCase() === clientUser.email?.toLowerCase());

      const isAssignedToOtherClient =
        !isAssignedToThisClient && (Boolean(p.client) || Boolean(p.clientEmail));

      return {
        _id: p._id,
        name: p.name,
        status: p.status,
        progress: p.progress,
        budget: p.budget,
        currency: p.currency || 'INR',
        isAssignedToThisClient,
        isAssignedToOtherClient,
        currentClientName: p.clientName || '',
      };
    });

    const assignedProjectIds = projectsWithAssignment
      .filter((p) => p.isAssignedToThisClient)
      .map((p) => p._id);

    res.json({
      success: true,
      client: {
        _id: clientUser._id,
        name: clientUser.name,
        email: clientUser.email,
        phone: clientUser.phone,
        designation: clientUser.designation,
      },
      projects: projectsWithAssignment,
      assignedProjectIds,
    });
  } catch (error) {
    console.error('Error fetching client assigned projects:', error);
    res.status(500).json({ message: 'Failed to fetch client projects', error: error.message });
  }
};

// @desc    Admin: Assign or update multiple projects assigned to a client
// @route   PUT /api/client-portal/admin/clients/:clientId/projects
// @access  Private (Admin / PM)
const assignProjectsToClient = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { clientId } = req.params;
    const { projectIds } = req.body;

    if (!Array.isArray(projectIds)) {
      return res.status(400).json({ message: 'projectIds must be an array of project IDs' });
    }

    const clientUser = await User.findOne({
      _id: clientId,
      company: companyId,
      role: 'Client',
    });

    if (!clientUser) {
      return res.status(404).json({ message: 'Client account not found' });
    }

    // 1. Unlink any projects currently assigned to this client that are NOT in projectIds
    await Project.updateMany(
      {
        company: companyId,
        $or: [{ client: clientUser._id }, { clientEmail: clientUser.email?.toLowerCase() }],
        _id: { $nin: projectIds },
      },
      {
        $set: {
          client: null,
          clientName: '',
          clientEmail: '',
          clientPhone: '',
          clientCompany: '',
        },
      }
    );

    // 2. Link all projects in projectIds to this client
    if (projectIds.length > 0) {
      const clientCompanyParsed = clientUser.designation
        ? clientUser.designation.replace('Client (', '').replace(')', '').trim()
        : '';

      await Project.updateMany(
        {
          _id: { $in: projectIds },
          company: companyId,
        },
        {
          $set: {
            client: clientUser._id,
            clientName: clientUser.name,
            clientEmail: clientUser.email,
            clientPhone: clientUser.phone || '',
            ...(clientCompanyParsed ? { clientCompany: clientCompanyParsed } : {}),
          },
        }
      );
    }

    // Fetch updated assigned projects
    const updatedProjects = await Project.find({
      company: companyId,
      $or: [{ client: clientUser._id }, { clientEmail: clientUser.email?.toLowerCase() }],
    }).select('name status progress budget currency');

    logAudit({
      req,
      action: 'CLIENT_PROJECTS_ASSIGNED',
      category: 'PROJECT',
      status: 'SUCCESS',
      details: {
        clientId: clientUser._id,
        clientName: clientUser.name,
        assignedCount: projectIds.length,
        projectIds,
      },
    });

    res.json({
      success: true,
      message: `Successfully assigned ${projectIds.length} project(s) to ${clientUser.name}.`,
      assignedCount: projectIds.length,
      client: {
        _id: clientUser._id,
        name: clientUser.name,
        email: clientUser.email,
        assignedProjects: updatedProjects,
      },
    });
  } catch (error) {
    console.error('Error assigning projects to client:', error);
    res.status(500).json({ message: 'Failed to assign projects', error: error.message });
  }
};

module.exports = {
  // Client methods
  getClientDashboard,
  getClientProjects,
  getClientInvoices,
  submitClientQuery,
  getClientQueries,

  // Admin methods
  getAdminClientPortalOverview,
  updateProjectBilling,
  addProjectMilestone,
  updateProjectMilestone,
  deleteProjectMilestone,
  createClientAccount,
  registerProjectClient,
  resetProjectClientPassword,
  unlinkProjectClient,
  getClientAssignedProjects,
  assignProjectsToClient,
  getAdminClientQueries,
  replyClientQuery,
};

