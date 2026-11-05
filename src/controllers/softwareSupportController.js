const crypto = require('crypto');
const axios = require('axios');
const SoftwareApp = require('../models/SoftwareApp');
const SoftwareTicket = require('../models/SoftwareTicket');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const {
  emitTicketMessage,
  emitTicketStatusUpdate,
  sendRealTimeNotification,
} = require('../utils/socketService');

// Helper to get company ID from authenticated user
const getUserCompanyId = (user) => {
  if (!user) return null;
  return user.company?._id || user.company;
};

// ============================================================
// 1. THIRD-PARTY API AUTHENTICATION MIDDLEWARE
// ============================================================
const verifySoftwareApiKey = async (req, res, next) => {
  try {
    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.query.api_key ||
      req.body.api_key;

    const softwareId =
      req.headers['x-software-id'] ||
      req.query.software_id ||
      req.body.software_id;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Missing API key. Please pass x-api-key header or api_key parameter.',
      });
    }

    const query = { apiKey, status: { $ne: 'Deprecated' } };
    if (softwareId) {
      query.softwareId = softwareId.toUpperCase().trim();
    }

    const softwareApp = await SoftwareApp.findOne(query);

    if (!softwareApp) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key or inactive Software ID. Authentication failed.',
      });
    }

    req.softwareApp = softwareApp;
    req.companyId = softwareApp.company;
    next();
  } catch (err) {
    console.error('Error verifying software API key:', err);
    res.status(500).json({ success: false, message: 'Internal server authentication error' });
  }
};

// ============================================================
// 2. THIRD-PARTY EXTERNAL REST APIS (GET & POST)
// ============================================================

// @desc    External API: Health check and verify software credentials
// @route   GET /api/software-support/v1/ping
// @access  Public (Authenticated with x-api-key)
const pingSoftwareApi = async (req, res) => {
  res.json({
    success: true,
    message: 'Software Support API is online and authenticated.',
    software: {
      software_id: req.softwareApp.softwareId,
      name: req.softwareApp.name,
      category: req.softwareApp.category,
      platform: req.softwareApp.platform,
      status: req.softwareApp.status,
    },
    timestamp: new Date().toISOString(),
  });
};

// @desc    External API: Inbound Ticket Creation (POST)
// @route   POST /api/software-support/v1/tickets
// @access  Public (Authenticated with x-api-key)
const createExternalTicket = async (req, res) => {
  try {
    const {
      external_ticket_id,
      externalTicketId,
      client_name,
      clientName,
      client_email,
      clientEmail,
      client_phone,
      clientPhone,
      client_org,
      clientOrg,
      subject,
      description,
      category,
      priority,
      app_version,
      appVersion,
      environment,
      device_info,
      deviceInfo,
      metadata,
      attachments,
    } = req.body;

    const name = (client_name || clientName || '').trim();
    const email = (client_email || clientEmail || '').trim().toLowerCase();
    const title = (subject || '').trim();
    const problem = (description || '').trim();

    if (!name || !email || !title || !problem) {
      return res.status(400).json({
        success: false,
        message: 'client_name, client_email, subject, and description are required fields.',
      });
    }

    // Generate unique sequential ticket number for this software company
    const count = await SoftwareTicket.countDocuments({ company: req.companyId });
    const ticketNumber = `STK-${10001 + count}`;

    const assignedLeadId = req.softwareApp.assignedLead;
    let assignedUser = null;
    if (assignedLeadId) {
      assignedUser = await User.findById(assignedLeadId).select('name email role');
    }

    const initialMessage = {
      senderType: 'client',
      senderName: name,
      senderEmail: email,
      message: problem,
      attachments: attachments || [],
      isInternalNote: false,
      createdAt: new Date(),
    };

    const initialActivity = {
      action: 'INGESTED_VIA_API',
      performedByName: `API [${req.softwareApp.name}]`,
      details: `Ticket received from external software ${req.softwareApp.softwareId} for user ${email}`,
      timestamp: new Date(),
    };

    const newTicket = new SoftwareTicket({
      ticketNumber,
      company: req.companyId,
      software: req.softwareApp._id,
      softwareId: req.softwareApp.softwareId,
      softwareName: req.softwareApp.name,
      externalTicketId: external_ticket_id || externalTicketId || '',
      clientName: name,
      clientEmail: email,
      clientPhone: client_phone || clientPhone || '',
      clientOrg: client_org || clientOrg || '',
      subject: title,
      description: problem,
      category: category || 'Bug / Error',
      priority: priority || 'Medium',
      status: 'Open',
      appVersion: app_version || appVersion || 'v1.0.0',
      environment: environment || 'Production',
      deviceInfo: device_info || deviceInfo || '',
      metadata: metadata || {},
      attachments: attachments || [],
      assignedTo: assignedUser ? assignedUser._id : null,
      assignedToName: assignedUser ? assignedUser.name : 'Unassigned',
      assignedToEmail: assignedUser ? assignedUser.email : '',
      assignedToRole: assignedUser ? assignedUser.role : '',
      messages: [initialMessage],
      activityLog: [initialActivity],
      lastMessageAt: new Date(),
    });

    const savedTicket = await newTicket.save();

    // Increment software app tickets count
    await SoftwareApp.findByIdAndUpdate(req.softwareApp._id, { $inc: { ticketsCount: 1 } });

    // Notify assigned lead or company admins via real-time socket notification
    if (assignedUser) {
      sendRealTimeNotification(assignedUser._id, {
        title: `New Ticket from ${req.softwareApp.name}`,
        message: `${name} reported: "${title}" (${priority || 'Medium'})`,
        type: 'ticket',
        link: '/software-support',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Support ticket logged successfully.',
      data: {
        ticket_id: savedTicket.ticketNumber,
        external_ticket_id: savedTicket.externalTicketId,
        software_id: req.softwareApp.softwareId,
        status: savedTicket.status,
        priority: savedTicket.priority,
        subject: savedTicket.subject,
        client_email: savedTicket.clientEmail,
        created_at: savedTicket.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating external software ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to log ticket', error: error.message });
  }
};

// @desc    External API: Fetch Tickets list (GET)
// @route   GET /api/software-support/v1/tickets
// @access  Public (Authenticated with x-api-key)
const getExternalTickets = async (req, res) => {
  try {
    const { client_email, external_ticket_id, status, page = 1, limit = 20 } = req.query;

    const query = {
      company: req.companyId,
      software: req.softwareApp._id,
    };

    if (client_email) {
      query.clientEmail = client_email.trim().toLowerCase();
    }

    if (external_ticket_id) {
      query.externalTicketId = external_ticket_id.trim();
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      SoftwareTicket.find(query)
        .select('-activityLog -messages.isInternalNote')
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SoftwareTicket.countDocuments(query),
    ]);

    // Sanitize messages so internal notes are never exposed
    const sanitizedTickets = tickets.map((t) => {
      const publicMessages = (t.messages || [])
        .filter((m) => !m.isInternalNote)
        .map((m) => ({
          sender_type: m.senderType,
          sender_name: m.senderName,
          message: m.message,
          attachments: m.attachments,
          created_at: m.createdAt,
        }));

      return {
        ticket_id: t.ticketNumber,
        external_ticket_id: t.externalTicketId,
        software_id: t.softwareId,
        software_name: t.softwareName,
        client_name: t.clientName,
        client_email: t.clientEmail,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        app_version: t.appVersion,
        resolution_notes: t.resolutionNotes,
        resolved_at: t.resolvedAt,
        messages: publicMessages,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
      };
    });

    res.json({
      success: true,
      data: sanitizedTickets,
      meta: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching external tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets', error: error.message });
  }
};

// @desc    External API: Get Single Ticket Status & Discussion (GET)
// @route   GET /api/software-support/v1/tickets/:ticketId
// @access  Public (Authenticated with x-api-key)
const getExternalTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await SoftwareTicket.findOne({
      company: req.companyId,
      software: req.softwareApp._id,
      $or: [{ ticketNumber: ticketId }, { externalTicketId: ticketId }],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: `Ticket with ID "${ticketId}" not found for software ${req.softwareApp.softwareId}.`,
      });
    }

    const publicMessages = (ticket.messages || [])
      .filter((m) => !m.isInternalNote)
      .map((m) => ({
        sender_type: m.senderType,
        sender_name: m.senderName,
        message: m.message,
        attachments: m.attachments,
        created_at: m.createdAt,
      }));

    res.json({
      success: true,
      data: {
        ticket_id: ticket.ticketNumber,
        external_ticket_id: ticket.externalTicketId,
        software_id: ticket.softwareId,
        software_name: ticket.softwareName,
        client_name: ticket.clientName,
        client_email: ticket.clientEmail,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        app_version: ticket.appVersion,
        environment: ticket.environment,
        assigned_agent: ticket.assignedToName || 'Under Review',
        resolution_notes: ticket.resolutionNotes,
        resolved_at: ticket.resolvedAt,
        messages: publicMessages,
        created_at: ticket.createdAt,
        updated_at: ticket.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching external ticket by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket detail', error: error.message });
  }
};

// @desc    External API: Add reply from client (POST)
// @route   POST /api/software-support/v1/tickets/:ticketId/replies
// @access  Public (Authenticated with x-api-key)
const addExternalTicketReply = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { sender_name, senderName, message, attachments } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const ticket = await SoftwareTicket.findOne({
      company: req.companyId,
      software: req.softwareApp._id,
      $or: [{ ticketNumber: ticketId }, { externalTicketId: ticketId }],
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const name = sender_name || senderName || ticket.clientName;

    const newMessage = {
      senderType: 'client',
      senderName: name,
      senderEmail: ticket.clientEmail,
      message: message.trim(),
      attachments: attachments || [],
      isInternalNote: false,
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    // Auto update status if waiting on client
    if (ticket.status === 'Waiting on Client') {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    // Emit live socket event to ticket room
    emitTicketMessage(ticket._id, newMessage);

    // Notify assigned engineer
    if (ticket.assignedTo) {
      sendRealTimeNotification(ticket.assignedTo, {
        title: `Client reply on ${ticket.ticketNumber}`,
        message: `${name}: ${message.trim().substring(0, 60)}`,
        type: 'ticket',
        link: '/software-support',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Reply posted successfully.',
      data: {
        ticket_id: ticket.ticketNumber,
        sender_name: name,
        message: message.trim(),
        created_at: newMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Error adding external reply:', error);
    res.status(500).json({ success: false, message: 'Failed to add reply', error: error.message });
  }
};

// ============================================================
// 3. INTERNAL DASHBOARD MANAGEMENT APIS (Company Staff / Admin)
// ============================================================

// @desc    List all registered softwares for user's company
// @route   GET /api/software-support/apps
// @access  Private
const getSoftwareApps = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const apps = await SoftwareApp.find({ company: companyId })
      .populate('assignedLead', 'name email role department')
      .sort({ createdAt: -1 });

    // Attach active tickets count for each app
    const appIds = apps.map((a) => a._id);
    const activeCounts = await SoftwareTicket.aggregate([
      {
        $match: {
          software: { $in: appIds },
          status: { $in: ['Open', 'In Progress', 'Waiting on Client'] },
        },
      },
      {
        $group: {
          _id: '$software',
          count: { $sum: 1 },
        },
      },
    ]);

    const activeMap = {};
    activeCounts.forEach((ac) => {
      activeMap[ac._id.toString()] = ac.count;
    });

    const appsWithCounts = apps.map((app) => ({
      ...app.toObject(),
      activeTickets: activeMap[app._id.toString()] || 0,
    }));

    res.json({ success: true, apps: appsWithCounts });
  } catch (error) {
    console.error('Error fetching software apps:', error);
    res.status(500).json({ message: 'Failed to fetch softwares', error: error.message });
  }
};

// @desc    Register a new software product
// @route   POST /api/software-support/apps
// @access  Private (Admin / Manager)
const createSoftwareApp = async (req, res) => {
  try {
    const { name, softwareId, description, category, platform, assignedLead, webhookUrl } = req.body;
    const companyId = getUserCompanyId(req.user);

    if (!name || !softwareId) {
      return res.status(400).json({ message: 'Software Name and Software ID are required' });
    }

    const formattedId = softwareId.toUpperCase().trim();

    // Check duplicate
    const existing = await SoftwareApp.findOne({ company: companyId, softwareId: formattedId });
    if (existing) {
      return res.status(400).json({ message: `Software ID "${formattedId}" is already registered in your company.` });
    }

    let leadUser = null;
    if (assignedLead) {
      leadUser = await User.findOne({ _id: assignedLead, company: companyId }).select('name');
    }

    const app = new SoftwareApp({
      company: companyId,
      softwareId: formattedId,
      name: name.trim(),
      description: description ? description.trim() : '',
      category: category || 'Web Application',
      platform: platform ? platform.trim() : 'Web & Cloud',
      assignedLead: leadUser ? leadUser._id : null,
      assignedLeadName: leadUser ? leadUser.name : '',
      webhookUrl: webhookUrl ? webhookUrl.trim() : '',
    });

    await app.save();

    res.status(201).json({
      success: true,
      message: `Software "${app.name}" registered successfully.`,
      app,
    });
  } catch (error) {
    console.error('Error creating software app:', error);
    res.status(500).json({ message: 'Failed to register software', error: error.message });
  }
};

// @desc    Update registered software product
// @route   PUT /api/software-support/apps/:id
// @access  Private
const updateSoftwareApp = async (req, res) => {
  try {
    const { name, description, category, platform, assignedLead, webhookUrl, status } = req.body;
    const companyId = getUserCompanyId(req.user);

    const app = await SoftwareApp.findOne({ _id: req.params.id, company: companyId });
    if (!app) {
      return res.status(404).json({ message: 'Software app not found' });
    }

    if (name) app.name = name.trim();
    if (description !== undefined) app.description = description.trim();
    if (category) app.category = category;
    if (platform) app.platform = platform.trim();
    if (webhookUrl !== undefined) app.webhookUrl = webhookUrl.trim();
    if (status) app.status = status;

    if (assignedLead !== undefined) {
      if (assignedLead) {
        const leadUser = await User.findOne({ _id: assignedLead, company: companyId }).select('name');
        app.assignedLead = leadUser ? leadUser._id : null;
        app.assignedLeadName = leadUser ? leadUser.name : '';
      } else {
        app.assignedLead = null;
        app.assignedLeadName = '';
      }
    }

    await app.save();
    res.json({ success: true, message: 'Software updated successfully', app });
  } catch (error) {
    console.error('Error updating software app:', error);
    res.status(500).json({ message: 'Failed to update software', error: error.message });
  }
};

// @desc    Regenerate software API key
// @route   POST /api/software-support/apps/:id/regenerate-key
// @access  Private
const regenerateSoftwareApiKey = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const app = await SoftwareApp.findOne({ _id: req.params.id, company: companyId });
    if (!app) {
      return res.status(404).json({ message: 'Software app not found' });
    }

    app.apiKey = 'swk_' + crypto.randomBytes(16).toString('hex');
    await app.save();

    res.json({
      success: true,
      message: 'API Key regenerated successfully. Update this key in your external software.',
      apiKey: app.apiKey,
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({ message: 'Failed to regenerate API key', error: error.message });
  }
};

// @desc    Delete or archive software app
// @route   DELETE /api/software-support/apps/:id
// @access  Private
const deleteSoftwareApp = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const app = await SoftwareApp.findOne({ _id: req.params.id, company: companyId });
    if (!app) {
      return res.status(404).json({ message: 'Software app not found' });
    }

    const ticketsCount = await SoftwareTicket.countDocuments({ software: app._id });
    if (ticketsCount > 0) {
      // Soft-deprecate rather than orphan tickets
      app.status = 'Deprecated';
      await app.save();
      return res.json({
        success: true,
        message: `Software has ${ticketsCount} tickets. Status changed to "Deprecated".`,
      });
    }

    await SoftwareApp.findByIdAndDelete(app._id);
    res.json({ success: true, message: 'Software deleted successfully' });
  } catch (error) {
    console.error('Error deleting software app:', error);
    res.status(500).json({ message: 'Failed to delete software', error: error.message });
  }
};

// @desc    List software support tickets in company dashboard
// @route   GET /api/software-support/tickets
// @access  Private
const getSoftwareTickets = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const { softwareId, status, priority, category, search, page = 1, limit = 30 } = req.query;

    const query = { company: companyId };

    if (softwareId && softwareId !== 'ALL') {
      query.softwareId = softwareId.toUpperCase().trim();
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (priority && priority !== 'ALL') {
      query.priority = priority;
    }

    if (category && category !== 'ALL') {
      query.category = category;
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { ticketNumber: { $regex: s, $options: 'i' } },
        { externalTicketId: { $regex: s, $options: 'i' } },
        { subject: { $regex: s, $options: 'i' } },
        { clientName: { $regex: s, $options: 'i' } },
        { clientEmail: { $regex: s, $options: 'i' } },
        { softwareName: { $regex: s, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tickets, total] = await Promise.all([
      SoftwareTicket.find(query)
        .populate('assignedTo', 'name email role department')
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SoftwareTicket.countDocuments(query),
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error fetching software tickets:', error);
    res.status(500).json({ message: 'Failed to fetch tickets', error: error.message });
  }
};

// @desc    Get single software ticket by ID
// @route   GET /api/software-support/tickets/:id
// @access  Private
const getSoftwareTicketById = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const ticket = await SoftwareTicket.findOne({ _id: req.params.id, company: companyId })
      .populate('software', 'name softwareId category platform apiKey webhookUrl')
      .populate('assignedTo', 'name email role department');

    if (!ticket) {
      return res.status(404).json({ message: 'Software ticket not found' });
    }

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Error fetching software ticket detail:', error);
    res.status(500).json({ message: 'Failed to fetch ticket detail', error: error.message });
  }
};

// @desc    Update ticket status and resolution notes
// @route   PUT /api/software-support/tickets/:id/status
// @access  Private
const updateSoftwareTicketStatus = async (req, res) => {
  try {
    const { status, priority, resolutionNotes } = req.body;
    const companyId = getUserCompanyId(req.user);

    const ticket = await SoftwareTicket.findOne({ _id: req.params.id, company: companyId }).populate('software');
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const oldStatus = ticket.status;
    let activityDetail = '';

    if (status && status !== ticket.status) {
      ticket.status = status;
      activityDetail += `Status changed from ${oldStatus} to ${status}. `;

      if (status === 'Resolved') {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = req.user._id;
        ticket.resolvedByName = req.user.name;
        if (resolutionNotes) {
          ticket.resolutionNotes = resolutionNotes.trim();
          activityDetail += `Resolution notes added.`;
        }
      } else if (status === 'Closed') {
        ticket.closedAt = new Date();
        ticket.closedBy = req.user._id;
        ticket.closedByName = req.user.name;
      }
    }

    if (priority && priority !== ticket.priority) {
      ticket.priority = priority;
      activityDetail += `Priority set to ${priority}.`;
    }

    if (activityDetail) {
      ticket.activityLog.push({
        action: 'STATUS_UPDATED',
        performedBy: req.user._id,
        performedByName: req.user.name,
        details: activityDetail.trim(),
        timestamp: new Date(),
      });
    }

    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Broadcast live update
    emitTicketStatusUpdate(ticket._id, {
      ticketId: ticket._id,
      status: ticket.status,
      priority: ticket.priority,
      resolutionNotes: ticket.resolutionNotes,
      updatedBy: req.user.name,
    });

    // Optional outbound webhook notification to external app
    if (ticket.software?.webhookUrl) {
      try {
        axios
          .post(ticket.software.webhookUrl, {
            event: 'ticket.status_updated',
            ticket_id: ticket.ticketNumber,
            external_ticket_id: ticket.externalTicketId,
            status: ticket.status,
            resolution_notes: ticket.resolutionNotes,
            resolved_at: ticket.resolvedAt,
          })
          .catch((err) => console.log('Outbound webhook failed silently:', err.message));
      } catch (e) {
        // ignore webhook delivery failure
      }
    }

    res.json({ success: true, message: 'Ticket status updated', ticket });
  } catch (error) {
    console.error('Error updating software ticket status:', error);
    res.status(500).json({ message: 'Failed to update ticket status', error: error.message });
  }
};

// @desc    Assign ticket to internal support engineer/developer
// @route   PUT /api/software-support/tickets/:id/assign
// @access  Private
const assignSoftwareTicket = async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const companyId = getUserCompanyId(req.user);

    const ticket = await SoftwareTicket.findOne({ _id: req.params.id, company: companyId });
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const assignedUser = await User.findOne({ _id: assignedTo, company: companyId }).select('name email role');
    if (!assignedUser) {
      return res.status(404).json({ message: 'Assigned user not found in company' });
    }

    ticket.assignedTo = assignedUser._id;
    ticket.assignedToName = assignedUser.name;
    ticket.assignedToEmail = assignedUser.email;
    ticket.assignedToRole = assignedUser.role;

    ticket.activityLog.push({
      action: 'ASSIGNED',
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Assigned to ${assignedUser.name} (${assignedUser.role})`,
      timestamp: new Date(),
    });

    ticket.lastMessageAt = new Date();
    await ticket.save();

    sendRealTimeNotification(assignedUser._id, {
      title: `Assigned Ticket: ${ticket.ticketNumber}`,
      message: `${req.user.name} assigned ticket "${ticket.subject}" from ${ticket.softwareName} to you.`,
      type: 'ticket',
      link: '/software-support',
    });

    res.json({ success: true, message: `Ticket assigned to ${assignedUser.name}`, ticket });
  } catch (error) {
    console.error('Error assigning software ticket:', error);
    res.status(500).json({ message: 'Failed to assign ticket', error: error.message });
  }
};

// @desc    Add agent reply to software ticket
// @route   POST /api/software-support/tickets/:id/messages
// @access  Private
const addSoftwareTicketAgentMessage = async (req, res) => {
  try {
    const { message, attachments, isInternalNote = false } = req.body;
    const companyId = getUserCompanyId(req.user);

    if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message or attachment required' });
    }

    const ticket = await SoftwareTicket.findOne({ _id: req.params.id, company: companyId }).populate('software');
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const newMessage = {
      senderType: 'agent',
      senderName: req.user.name,
      senderEmail: req.user.email,
      senderId: req.user._id,
      message: message ? message.trim() : '',
      attachments: attachments || [],
      isInternalNote: Boolean(isInternalNote),
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    if (!isInternalNote && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    // Emit live message
    emitTicketMessage(ticket._id, newMessage);

    // If external app configured webhook and message is public, trigger notification
    if (!isInternalNote && ticket.software?.webhookUrl) {
      try {
        axios
          .post(ticket.software.webhookUrl, {
            event: 'ticket.reply_added',
            ticket_id: ticket.ticketNumber,
            external_ticket_id: ticket.externalTicketId,
            reply: {
              sender: req.user.name,
              message: message ? message.trim() : '',
              created_at: newMessage.createdAt,
            },
          })
          .catch((err) => console.log('Outbound reply webhook silent error:', err.message));
      } catch (e) {
        // ignore
      }
    }

    res.status(201).json({ success: true, message: 'Reply sent successfully', newMessage, ticket });
  } catch (error) {
    console.error('Error adding agent message:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

// @desc    Get aggregated software support statistics
// @route   GET /api/software-support/stats
// @access  Private
const getSoftwareSupportStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const baseQuery = { company: companyId };

    const [
      totalSoftwares,
      totalTickets,
      openTickets,
      inProgressTickets,
      waitingTickets,
      resolvedTickets,
      urgentTickets,
    ] = await Promise.all([
      SoftwareApp.countDocuments({ ...baseQuery, status: { $ne: 'Deprecated' } }),
      SoftwareTicket.countDocuments(baseQuery),
      SoftwareTicket.countDocuments({ ...baseQuery, status: 'Open' }),
      SoftwareTicket.countDocuments({ ...baseQuery, status: 'In Progress' }),
      SoftwareTicket.countDocuments({ ...baseQuery, status: 'Waiting on Client' }),
      SoftwareTicket.countDocuments({ ...baseQuery, status: { $in: ['Resolved', 'Closed'] } }),
      SoftwareTicket.countDocuments({
        ...baseQuery,
        priority: 'Urgent',
        status: { $in: ['Open', 'In Progress'] },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        totalSoftwares,
        totalTickets,
        openTickets,
        inProgressTickets,
        waitingTickets,
        resolvedTickets,
        urgentTickets,
        activeTickets: openTickets + inProgressTickets + waitingTickets,
      },
    });
  } catch (error) {
    console.error('Error fetching software stats:', error);
    res.status(500).json({ message: 'Failed to fetch statistics', error: error.message });
  }
};

module.exports = {
  // Middleware
  verifySoftwareApiKey,

  // External APIs
  pingSoftwareApi,
  createExternalTicket,
  getExternalTickets,
  getExternalTicketById,
  addExternalTicketReply,

  // Internal Dashboard APIs
  getSoftwareApps,
  createSoftwareApp,
  updateSoftwareApp,
  regenerateSoftwareApiKey,
  deleteSoftwareApp,
  getSoftwareTickets,
  getSoftwareTicketById,
  updateSoftwareTicketStatus,
  assignSoftwareTicket,
  addSoftwareTicketAgentMessage,
  getSoftwareSupportStats,
};

