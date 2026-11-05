const CompanyTicket = require('../models/CompanyTicket');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const {
  emitTicketMessage,
  emitTicketStatusUpdate,
  sendRealTimeNotification,
} = require('../utils/socketService');

// Helper to get user's company ID
const getUserCompanyId = (user) => {
  if (!user) return null;
  return user.company?._id || user.company;
};

// @desc    Raise a new internal company ticket
// @route   POST /api/company-tickets
// @access  Private (All authenticated company users)
const createCompanyTicket = async (req, res) => {
  try {
    const { subject, category, priority, description, assignedTo, attachments } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }

    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'User must belong to a company to raise internal tickets' });
    }

    // Generate sequential ticket number for this company
    const count = await CompanyTicket.countDocuments({ company: companyId });
    const ticketNumber = `INT-${10001 + count}`;

    // Get company name
    const companyName = req.user.company?.name || 'Company Workspace';

    // Resolve Assignee / Solver
    let assignedUser = null;
    if (assignedTo) {
      assignedUser = await User.findOne({ _id: assignedTo, company: companyId }).select(
        '_id name email role department designation'
      );
    }

    // If no assignee specified, try finding user's teamHead or an Admin
    if (!assignedUser && req.user.teamHead) {
      assignedUser = await User.findOne({ _id: req.user.teamHead, company: companyId }).select(
        '_id name email role department designation'
      );
    }

    if (!assignedUser) {
      // Find company admin as fallback
      assignedUser = await User.findOne({ company: companyId, role: { $in: ['Admin', 'Manager'] } }).select(
        '_id name email role department designation'
      );
    }

    const initialMessage = {
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderAvatar: req.user.profilePicture || '',
      message: description.trim(),
      attachments: attachments || [],
      isInternalNote: false,
    };

    const initialActivity = {
      action: 'CREATED',
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: assignedUser
        ? `Ticket created and assigned to ${assignedUser.name} (${assignedUser.role || assignedUser.designation || 'Staff'})`
        : 'Ticket created',
      timestamp: new Date(),
    };

    const ticket = new CompanyTicket({
      ticketNumber,
      company: companyId,
      companyName,
      creator: req.user._id,
      creatorName: req.user.name,
      creatorEmail: req.user.email,
      creatorRole: req.user.role,
      creatorDepartment: req.user.department || 'General',
      creatorDesignation: req.user.designation || 'Staff',
      assignedTo: assignedUser ? assignedUser._id : null,
      assignedToName: assignedUser ? assignedUser.name : 'Unassigned',
      assignedToEmail: assignedUser ? assignedUser.email : '',
      assignedToRole: assignedUser ? assignedUser.role : '',
      assignedToDepartment: assignedUser ? assignedUser.department || '' : '',
      assignedToDesignation: assignedUser ? assignedUser.designation || '' : '',
      subject: subject.trim(),
      category: category || 'Hardware Issue',
      priority: priority || 'Medium',
      status: 'Open',
      description: description.trim(),
      attachments: attachments || [],
      messages: [initialMessage],
      activityLog: [initialActivity],
      lastMessageAt: new Date(),
    });

    const savedTicket = await ticket.save();

    // Notify assigned solver if present and not the creator
    if (assignedUser && assignedUser._id.toString() !== req.user._id.toString()) {
      sendRealTimeNotification(assignedUser._id, {
        title: 'New Internal Ticket Assigned',
        message: `${req.user.name} reported: "${subject}" (${category || 'Hardware/Issue'})`,
        type: 'ticket',
        link: '/company-support',
      });
    }

    // Audit Log
    logAudit({
      req,
      action: 'TICKET_RAISED',
      category: 'SUPPORT',
      status: 'SUCCESS',
      details: {
        ticketNumber,
        subject,
        priority,
        category,
        assignedTo: assignedUser ? assignedUser.name : 'Unassigned',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Internal company ticket raised successfully.',
      ticket: savedTicket,
    });
  } catch (error) {
    console.error('Error creating company ticket:', error);
    res.status(500).json({ message: 'Failed to create internal ticket', error: error.message });
  }
};

// @desc    Get company tickets with filters, view mode, and search
// @route   GET /api/company-tickets
// @access  Private (All company users)
const getCompanyTickets = async (req, res) => {
  try {
    const {
      view = 'all', // 'all', 'my', 'assigned'
      status,
      priority,
      category,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const query = { company: companyId };

    // View filter
    if (view === 'my') {
      query.creator = req.user._id;
    } else if (view === 'assigned') {
      query.assignedTo = req.user._id;
    }

    // Status filter
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // Priority filter
    if (priority && priority !== 'ALL') {
      query.priority = priority;
    }

    // Category filter
    if (category && category !== 'ALL') {
      query.category = category;
    }

    // Search query
    if (search && search.trim()) {
      const s = search.trim();
      const searchConditions = [
        { ticketNumber: { $regex: s, $options: 'i' } },
        { subject: { $regex: s, $options: 'i' } },
        { creatorName: { $regex: s, $options: 'i' } },
        { assignedToName: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
      query.$or = searchConditions;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tickets, total] = await Promise.all([
      CompanyTicket.find(query)
        .populate('creator', 'name email role department designation profilePicture')
        .populate('assignedTo', 'name email role department designation profilePicture')
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      CompanyTicket.countDocuments(query),
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Error fetching company tickets:', error);
    res.status(500).json({ message: 'Failed to fetch company tickets', error: error.message });
  }
};

// @desc    Get company ticket stats summary
// @route   GET /api/company-tickets/stats
// @access  Private
const getCompanyTicketStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId && req.user.role !== 'Super Admin') {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const baseQuery = { company: companyId };

    const [
      total,
      open,
      inProgress,
      waiting,
      resolved,
      closed,
      assignedToMe,
      myRaised,
    ] = await Promise.all([
      CompanyTicket.countDocuments(baseQuery),
      CompanyTicket.countDocuments({ ...baseQuery, status: 'Open' }),
      CompanyTicket.countDocuments({ ...baseQuery, status: 'In Progress' }),
      CompanyTicket.countDocuments({ ...baseQuery, status: 'Waiting on User' }),
      CompanyTicket.countDocuments({ ...baseQuery, status: 'Resolved' }),
      CompanyTicket.countDocuments({ ...baseQuery, status: 'Closed' }),
      CompanyTicket.countDocuments({
        ...baseQuery,
        assignedTo: req.user._id,
        status: { $in: ['Open', 'In Progress', 'Waiting on User'] },
      }),
      CompanyTicket.countDocuments({
        ...baseQuery,
        creator: req.user._id,
        status: { $in: ['Open', 'In Progress', 'Waiting on User'] },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        open,
        inProgress,
        waiting,
        resolved,
        closed,
        activePending: open + inProgress + waiting,
        assignedToMe,
        myRaised,
      },
    });
  } catch (error) {
    console.error('Error fetching company ticket stats:', error);
    res.status(500).json({ message: 'Failed to fetch ticket stats', error: error.message });
  }
};

// @desc    Get active company members available as solving persons / assignees
// @route   GET /api/company-tickets/solvers
// @access  Private
const getCompanySolvers = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const solvers = await User.find({
      company: companyId,
      status: 'Active',
    })
      .select('_id name email role department designation teamHead profilePicture')
      .sort({ name: 1 });

    res.json({
      success: true,
      solvers,
    });
  } catch (error) {
    console.error('Error fetching company solvers:', error);
    res.status(500).json({ message: 'Failed to fetch company members', error: error.message });
  }
};

// @desc    Get single company ticket by ID with full messages and activity
// @route   GET /api/company-tickets/:id
// @access  Private
const getCompanyTicketById = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const ticket = await CompanyTicket.findOne({
      _id: req.params.id,
      company: companyId,
    })
      .populate('creator', 'name email role department designation profilePicture')
      .populate('assignedTo', 'name email role department designation profilePicture');

    if (!ticket) {
      return res.status(404).json({ message: 'Internal ticket not found' });
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error) {
    console.error('Error fetching ticket by ID:', error);
    res.status(500).json({ message: 'Failed to fetch ticket', error: error.message });
  }
};

// @desc    Update ticket status, priority, or resolution
// @route   PUT /api/company-tickets/:id/status
// @access  Private
const updateCompanyTicketStatus = async (req, res) => {
  try {
    const { status, priority, resolutionNotes } = req.body;
    const companyId = getUserCompanyId(req.user);

    const ticket = await CompanyTicket.findOne({ _id: req.params.id, company: companyId });
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
          activityDetail += `Resolution: ${resolutionNotes.trim()}`;
        }
      } else if (status === 'Closed') {
        ticket.closedAt = new Date();
        ticket.closedBy = req.user._id;
        ticket.closedByName = req.user.name;
      }
    }

    if (priority && priority !== ticket.priority) {
      const oldPriority = ticket.priority;
      ticket.priority = priority;
      activityDetail += `Priority changed from ${oldPriority} to ${priority}.`;
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

    // Broadcast live status update via socket room
    emitTicketStatusUpdate(ticket._id, {
      ticketId: ticket._id,
      status: ticket.status,
      priority: ticket.priority,
      resolutionNotes: ticket.resolutionNotes,
      updatedBy: req.user.name,
    });

    // Notify counterpart
    const targetUserId =
      req.user._id.toString() === ticket.creator.toString() ? ticket.assignedTo : ticket.creator;
    if (targetUserId) {
      sendRealTimeNotification(targetUserId, {
        title: `Ticket ${ticket.ticketNumber} Updated`,
        message: `${req.user.name} marked status as "${ticket.status}"`,
        type: 'ticket',
        link: '/company-support',
      });
    }

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      ticket,
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Failed to update ticket status', error: error.message });
  }
};

// @desc    Reassign ticket to a new solver / member in the company
// @route   PUT /api/company-tickets/:id/reassign
// @access  Private
const reassignCompanyTicket = async (req, res) => {
  try {
    const { assignedTo, notes } = req.body;
    const companyId = getUserCompanyId(req.user);

    if (!assignedTo) {
      return res.status(400).json({ message: 'New assigned solver is required' });
    }

    const ticket = await CompanyTicket.findOne({ _id: req.params.id, company: companyId });
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const newAssignee = await User.findOne({ _id: assignedTo, company: companyId }).select(
      '_id name email role department designation'
    );
    if (!newAssignee) {
      return res.status(404).json({ message: 'Selected company member not found' });
    }

    const previousAssigneeName = ticket.assignedToName || 'Unassigned';
    ticket.assignedTo = newAssignee._id;
    ticket.assignedToName = newAssignee.name;
    ticket.assignedToEmail = newAssignee.email;
    ticket.assignedToRole = newAssignee.role;
    ticket.assignedToDepartment = newAssignee.department || '';
    ticket.assignedToDesignation = newAssignee.designation || '';

    ticket.activityLog.push({
      action: 'REASSIGNED',
      performedBy: req.user._id,
      performedByName: req.user.name,
      details: `Reassigned from ${previousAssigneeName} to ${newAssignee.name} (${newAssignee.role || 'Member'}). ${notes ? `Note: ${notes}` : ''}`,
      timestamp: new Date(),
    });

    ticket.lastMessageAt = new Date();
    await ticket.save();

    // Notify new assignee
    if (newAssignee._id.toString() !== req.user._id.toString()) {
      sendRealTimeNotification(newAssignee._id, {
        title: 'Internal Ticket Re-assigned to You',
        message: `${req.user.name} transferred ticket ${ticket.ticketNumber} ("${ticket.subject}") to you.`,
        type: 'ticket',
        link: '/company-support',
      });
    }

    // Notify creator if not reassigner
    if (ticket.creator.toString() !== req.user._id.toString()) {
      sendRealTimeNotification(ticket.creator, {
        title: `Ticket ${ticket.ticketNumber} Reassigned`,
        message: `Your ticket has been assigned to ${newAssignee.name}`,
        type: 'ticket',
        link: '/company-support',
      });
    }

    res.json({
      success: true,
      message: `Ticket successfully assigned to ${newAssignee.name}`,
      ticket,
    });
  } catch (error) {
    console.error('Error reassigning ticket:', error);
    res.status(500).json({ message: 'Failed to reassign ticket', error: error.message });
  }
};

// @desc    Add a message/reply to company ticket discussion
// @route   POST /api/company-tickets/:id/messages
// @access  Private
const addCompanyTicketMessage = async (req, res) => {
  try {
    const { message, attachments, isInternalNote = false } = req.body;
    const companyId = getUserCompanyId(req.user);

    if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message text or attachment is required' });
    }

    const ticket = await CompanyTicket.findOne({ _id: req.params.id, company: companyId });
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const newMessage = {
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      senderAvatar: req.user.profilePicture || '',
      message: message ? message.trim() : '',
      attachments: attachments || [],
      isInternalNote: Boolean(isInternalNote),
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);
    ticket.lastMessageAt = new Date();

    // Auto-update status if creator replies and status was Waiting on User
    if (
      req.user._id.toString() === ticket.creator.toString() &&
      ticket.status === 'Waiting on User'
    ) {
      ticket.status = 'In Progress';
    }

    await ticket.save();

    // Emit live message to ticket room
    emitTicketMessage(ticket._id, newMessage);

    // Notify the other party
    const isCreator = req.user._id.toString() === ticket.creator.toString();
    const notifyTarget = isCreator ? ticket.assignedTo : ticket.creator;

    if (notifyTarget && notifyTarget.toString() !== req.user._id.toString()) {
      sendRealTimeNotification(notifyTarget, {
        title: `New message on ${ticket.ticketNumber}`,
        message: `${req.user.name}: ${message ? message.substring(0, 60) : 'Sent an attachment'}`,
        type: 'ticket',
        link: '/company-support',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      newMessage,
      ticket,
    });
  } catch (error) {
    console.error('Error adding ticket message:', error);
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
};

// @desc    Upload media files for ticket
// @route   POST /api/company-tickets/upload-media
// @access  Private
const uploadTicketMediaFile = (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No media files uploaded' });
    }

    const uploadedFiles = req.files.map((file) => {
      const isVideo = file.mimetype.startsWith('video/');
      return {
        url: `/uploads/tickets/${file.filename}`,
        name: file.originalname,
        fileType: isVideo ? 'video' : 'image',
        size: file.size,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Media uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ message: 'Server error during media upload' });
  }
};

module.exports = {
  createCompanyTicket,
  getCompanyTickets,
  getCompanyTicketStats,
  getCompanySolvers,
  getCompanyTicketById,
  updateCompanyTicketStatus,
  reassignCompanyTicket,
  addCompanyTicketMessage,
  uploadTicketMediaFile,
};

