const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const {
  emitTicketMessage,
  emitTicketStatusUpdate,
  sendRealTimeNotification,
} = require('../utils/socketService');

// Helper to notify all Super Admins
const notifySuperAdmins = async (notification) => {
  try {
    const superAdmins = await User.find({ role: 'Super Admin' }).select('_id');
    superAdmins.forEach((sa) => {
      sendRealTimeNotification(sa._id, notification);
    });
  } catch (err) {
    console.error('Failed to notify super admins:', err.message);
  }
};

// @desc    Raise a new support ticket
// @route   POST /api/tickets
// @access  Private (All authenticated users)
const createTicket = async (req, res) => {
  try {
    const { subject, category, priority, description, attachments } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }

    const ticketCount = await Ticket.countDocuments();
    const ticketNumber = `TICK-${10001 + ticketCount}`;

    const userCompany = req.user.company;
    const companyName = userCompany?.name || (typeof userCompany === 'string' ? userCompany : 'Company Workspace');

    const ticket = new Ticket({
      ticketNumber,
      subject: subject.trim(),
      category: category || 'Technical Bug / Error',
      priority: priority || 'Medium',
      status: 'Open',
      description: description.trim(),
      attachments: attachments || [],
      user: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      company: userCompany?._id || userCompany || null,
      companyName,
      messages: [
        {
          sender: req.user._id,
          senderName: req.user.name,
          senderRole: req.user.role,
          isSuperAdmin: req.user.role === 'Super Admin',
          message: description.trim(),
          attachments: attachments || [],
          createdAt: new Date(),
        },
      ],
      lastMessageAt: new Date(),
    });

    const savedTicket = await ticket.save();

    // Notify Super Admins
    notifySuperAdmins({
      title: 'New Support Ticket Raised',
      message: `[${ticketNumber}] ${subject} from ${companyName} (${req.user.name})`,
      type: 'Ticket',
      ticketId: savedTicket._id,
      createdAt: new Date(),
    });

    // Record audit log
    await logAudit({
      req,
      action: 'TICKET_RAISED',
      category: 'SUPPORT',
      status: 'SUCCESS',
      details: {
        ticketNumber,
        subject,
        priority,
        category,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket raised successfully. Super Admin has been notified.',
      ticket: savedTicket,
    });
  } catch (error) {
    console.error('Error in createTicket:', error);
    res.status(500).json({ message: 'Failed to create ticket', error: error.message });
  }
};

// @desc    Get tickets with filters and pagination
// @route   GET /api/tickets
// @access  Private (Super Admin gets all, Company users get their own/company tickets)
const getTickets = async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      company,
      search,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    // Access control: non-Super Admins can only view tickets from their company or created by them
    if (req.user.role !== 'Super Admin') {
      const userCompanyId = req.user.company?._id || req.user.company;
      if (userCompanyId) {
        query.$or = [{ company: userCompanyId }, { user: req.user._id }];
      } else {
        query.user = req.user._id;
      }
    } else if (company && company !== 'ALL') {
      // Super admin filtered by company
      query.company = company;
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
      const searchCriteria = [
        { ticketNumber: { $regex: s, $options: 'i' } },
        { subject: { $regex: s, $options: 'i' } },
        { userName: { $regex: s, $options: 'i' } },
        { userEmail: { $regex: s, $options: 'i' } },
        { companyName: { $regex: s, $options: 'i' } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchCriteria }];
        delete query.$or;
      } else {
        query.$or = searchCriteria;
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Ticket.countDocuments(query),
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    console.error('Error in getTickets:', error);
    res.status(500).json({ message: 'Failed to retrieve tickets', error: error.message });
  }
};

// @desc    Get single ticket details with full chat thread
// @route   GET /api/tickets/:id
// @access  Private (Super Admin OR Ticket Creator / Same Company)
const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Authorization verification
    const isSuperAdmin = req.user.role === 'Super Admin';
    const isCreator = ticket.user.toString() === req.user._id.toString();
    const userCompId = (req.user.company?._id || req.user.company)?.toString();
    const ticketCompId = ticket.company?.toString();
    const isSameCompany = userCompId && ticketCompId && userCompId === ticketCompId;

    if (!isSuperAdmin && !isCreator && !isSameCompany) {
      return res.status(403).json({ message: 'Not authorized to view this ticket' });
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error('Error in getTicketById:', error);
    res.status(500).json({ message: 'Failed to retrieve ticket', error: error.message });
  }
};

// @desc    Update ticket status and resolution notes
// @route   PUT /api/tickets/:id/status
// @access  Private (Super Admin or creator closing ticket)
const updateTicketStatus = async (req, res) => {
  try {
    const { status, priority, resolutionNotes } = req.body;
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isSuperAdmin = req.user.role === 'Super Admin';
    const isCreator = ticket.user.toString() === req.user._id.toString();

    if (!isSuperAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only Super Admin can update ticket status' });
    }

    if (status) {
      ticket.status = status;
      if (status === 'Resolved') {
        ticket.resolvedAt = new Date();
      } else if (status === 'Closed') {
        ticket.closedAt = new Date();
      }
    }

    if (priority && isSuperAdmin) {
      ticket.priority = priority;
    }

    if (resolutionNotes !== undefined) {
      ticket.resolutionNotes = resolutionNotes;
    }

    const updatedTicket = await ticket.save();

    // Emit live status update to anyone currently viewing this ticket
    emitTicketStatusUpdate(ticket._id, {
      ticketId: ticket._id,
      status: ticket.status,
      priority: ticket.priority,
      resolutionNotes: ticket.resolutionNotes,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
    });

    // Send real-time notification to the ticket creator
    sendRealTimeNotification(ticket.user, {
      title: `Ticket Status: ${ticket.status}`,
      message: `Your ticket [${ticket.ticketNumber}] status was updated to "${ticket.status}" by Super Admin.`,
      type: 'Ticket',
      ticketId: ticket._id,
      createdAt: new Date(),
    });

    // Record audit log
    await logAudit({
      req,
      action: 'TICKET_STATUS_UPDATED',
      category: 'SUPPORT',
      status: 'SUCCESS',
      details: {
        ticketNumber: ticket.ticketNumber,
        newStatus: ticket.status,
        resolutionNotes,
      },
    });

    res.json({
      success: true,
      message: `Ticket status successfully updated to ${ticket.status}`,
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Error in updateTicketStatus:', error);
    res.status(500).json({ message: 'Failed to update ticket status', error: error.message });
  }
};

// @desc    Add a live message / communication reply to ticket thread
// @route   POST /api/tickets/:id/messages
// @access  Private (Super Admin OR Ticket Creator / Same Company)
const addTicketMessage = async (req, res) => {
  try {
    const { message, attachments } = req.body;

    if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message text or attachment is required' });
    }

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const isSuperAdmin = req.user.role === 'Super Admin';
    const isCreator = ticket.user.toString() === req.user._id.toString();
    const userCompId = (req.user.company?._id || req.user.company)?.toString();
    const ticketCompId = ticket.company?.toString();
    const isSameCompany = userCompId && ticketCompId && userCompId === ticketCompId;

    if (!isSuperAdmin && !isCreator && !isSameCompany) {
      return res.status(403).json({ message: 'Not authorized to send messages on this ticket' });
    }

    const textContent =
      (message || '').trim() ||
      (attachments?.[0]?.fileType === 'video' ? 'Shared a video attachment' : 'Shared an image attachment');

    const newMessage = {
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      isSuperAdmin,
      message: textContent,
      attachments: attachments || [],
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    // If ticket was resolved/closed and user messages again, auto-reopen to In Progress
    if ((ticket.status === 'Resolved' || ticket.status === 'Closed') && !isSuperAdmin) {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    // Real-time broadcast to ticket room
    emitTicketMessage(ticket._id, newMessage);

    // Send notification to the other party
    if (isSuperAdmin) {
      // Super admin replied -> notify user
      sendRealTimeNotification(ticket.user, {
        title: `Reply on Ticket ${ticket.ticketNumber}`,
        message: `Super Admin: ${message.slice(0, 100)}`,
        type: 'Ticket',
        ticketId: ticket._id,
        createdAt: new Date(),
      });
    } else {
      // User replied -> notify super admins
      notifySuperAdmins({
        title: `Reply on Ticket ${ticket.ticketNumber}`,
        message: `${req.user.name} (${ticket.companyName}): ${message.slice(0, 100)}`,
        type: 'Ticket',
        ticketId: ticket._id,
        createdAt: new Date(),
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message delivered',
      newMessage,
      ticket,
    });
  } catch (error) {
    console.error('Error in addTicketMessage:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

// @desc    Get ticket overview statistics
// @route   GET /api/tickets/stats
// @access  Private (All authenticated users - scoped)
const getTicketStats = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'Super Admin';
    const query = {};

    if (!isSuperAdmin) {
      const userCompanyId = req.user.company?._id || req.user.company;
      if (userCompanyId) {
        query.$or = [{ company: userCompanyId }, { user: req.user._id }];
      } else {
        query.user = req.user._id;
      }
    }

    const [total, open, inProgress, resolved, closed, urgent] = await Promise.all([
      Ticket.countDocuments(query),
      Ticket.countDocuments({ ...query, status: 'Open' }),
      Ticket.countDocuments({ ...query, status: 'In Progress' }),
      Ticket.countDocuments({ ...query, status: 'Resolved' }),
      Ticket.countDocuments({ ...query, status: 'Closed' }),
      Ticket.countDocuments({ ...query, priority: 'Urgent', status: { $ne: 'Closed' } }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        open,
        inProgress,
        resolved,
        closed,
        urgent,
      },
    });
  } catch (error) {
    console.error('Error in getTicketStats:', error);
    res.status(500).json({ message: 'Failed to retrieve ticket stats', error: error.message });
  }
};

// @desc    Upload media (image up to 1MB, video up to 2MB) for ticket or chat
// @route   POST /api/tickets/upload-media
// @access  Private (All authenticated users)
const uploadTicketMediaFile = async (req, res) => {
  try {
    const rawFiles = req.files
      ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat())
      : req.file
      ? [req.file]
      : [];

    if (!rawFiles || rawFiles.length === 0) {
      return res.status(400).json({ message: 'No media file was uploaded' });
    }

    const files = rawFiles.map((f) => {
      const isVideo = f.mimetype.startsWith('video/');
      return {
        url: `/uploads/tickets/${f.filename}`,
        fileType: isVideo ? 'video' : 'image',
        originalName: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Media uploaded successfully',
      file: files[0],
      files,
    });
  } catch (error) {
    console.error('Error in uploadTicketMediaFile:', error);
    res.status(500).json({ message: 'Failed to upload ticket media', error: error.message });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  updateTicketStatus,
  addTicketMessage,
  getTicketStats,
  uploadTicketMediaFile,
};

