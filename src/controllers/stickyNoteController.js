const StickyNote = require('../models/StickyNote');
const Notification = require('../models/Notification');
const { sendRealTimeNotification } = require('../utils/socketService');
const { sendEmail } = require('../utils/emailService');

// Color mapping for HTML email post-it card
const COLOR_MAP = {
  yellow: { bg: '#fef9c3', border: '#facc15', text: '#713f12', title: '#854d0e', header: '#eab308' },
  pink: { bg: '#fce7f3', border: '#f472b6', text: '#831843', title: '#9d174d', header: '#ec4899' },
  blue: { bg: '#e0f2fe', border: '#38bdf8', text: '#0c4a6e', title: '#0369a1', header: '#0284c7' },
  green: { bg: '#dcfce7', border: '#4ade80', text: '#14532d', title: '#15803d', header: '#16a34a' },
  purple: { bg: '#f3e8ff', border: '#c084fc', text: '#581c87', title: '#6b21a8', header: '#9333ea' },
  orange: { bg: '#ffedd5', border: '#fb923c', text: '#7c2d12', title: '#9a3412', header: '#ea580c' },
  teal: { bg: '#ccfbf1', border: '#2dd4bf', text: '#134e4a', title: '#0f766e', header: '#0d9488' },
};

// Helper: dispatch reminder for a sticky note (In-app + Company Email)
const dispatchNoteReminder = async (note, user, company) => {
  const companyName = company?.name || 'Company Portal';
  const userName = user?.name || 'Team Member';
  const colors = COLOR_MAP[note.color] || COLOR_MAP.yellow;

  // 1. In-App Notification
  if (note.sendInAppReminder !== false) {
    try {
      const notif = await Notification.create({
        user: user._id,
        company: company?._id || user.company,
        title: `📌 Sticky Note Reminder: ${note.title || 'Note'}`,
        message: note.content.slice(0, 160) + (note.content.length > 160 ? '...' : ''),
        type: 'sticky_note_reminder',
        link: '/sticky-notes',
      });
      sendRealTimeNotification(user._id, notif);
    } catch (notifErr) {
      console.error('Failed to create in-app reminder notification:', notifErr.message);
    }
  }

  // 2. Email Reminder via Company SMTP
  if (note.sendEmailReminder !== false && user?.email) {
    try {
      const noteTitle = note.title ? note.title.trim() : 'Sticky Note Reminder';
      const subject = `📌 Reminder: ${noteTitle} - ${companyName}`;

      const formattedReminderTime = note.reminderAt
        ? new Date(note.reminderAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 32px 16px; min-height: 100%;">
          <div style="max-width: 520px; margin: 0 auto;">
            <!-- Header branding -->
            <div style="text-align: center; margin-bottom: 20px;">
              <h3 style="margin: 0; color: #1e293b; font-size: 18px; font-weight: 700;">${companyName}</h3>
              <p style="margin: 4px 0 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Sticky Note Reminder Alert</p>
            </div>

            <!-- Sticky Note Card -->
            <div style="background: ${colors.bg}; border: 2px solid ${colors.border}; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); padding: 28px 24px 20px; position: relative;">
              <!-- Pin Graphic -->
              <div style="text-align: center; margin-top: -38px; margin-bottom: 12px;">
                <span style="display: inline-block; width: 14px; height: 14px; background: #ef4444; border: 2px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.25);"></span>
              </div>

              ${
                note.title
                  ? `<h2 style="margin: 0 0 12px; color: ${colors.title}; font-size: 20px; font-weight: 800; line-height: 1.3;">${note.title}</h2>`
                  : ''
              }

              <div style="color: ${colors.text}; font-size: 15px; line-height: 1.6; white-space: pre-wrap; font-weight: 500;">${note.content}</div>

              <!-- Metadata footer inside note -->
              <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed ${colors.border}; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: ${colors.title};">
                <div>
                  <strong>Scheduled For:</strong> ${formattedReminderTime}
                </div>
                ${note.priority ? `<span style="font-weight: 700; text-transform: uppercase;">[${note.priority} Priority]</span>` : ''}
              </div>
            </div>

            <!-- Action button -->
            <div style="text-align: center; margin-top: 24px;">
              <p style="margin: 0 0 12px; font-size: 12px; color: #64748b;">Hello ${userName}, this is your automated reminder from your personal sticky notes board.</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/sticky-notes" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 24px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                Open Sticky Notes Board →
              </a>
            </div>
          </div>
        </div>
      `;

      await sendEmail(user.email, subject, emailHtml, { companyId: company?._id || user.company });
    } catch (emailErr) {
      console.error('Failed to send sticky note reminder email:', emailErr.message);
    }
  }
};

// @desc    Get user's sticky notes
// @route   GET /api/sticky-notes
// @access  Private (All Employees)
exports.getStickyNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search, color, tag, isPinned, hasReminder, isCompleted } = req.query;

    const filter = {
      user: userId,
      isArchived: false,
    };

    if (color && color !== 'all') {
      filter.color = color;
    }

    if (tag && tag !== 'all') {
      filter.tags = tag;
    }

    if (isPinned !== undefined && isPinned !== 'all') {
      filter.isPinned = isPinned === 'true';
    }

    if (isCompleted !== undefined && isCompleted !== 'all') {
      filter.isCompleted = isCompleted === 'true';
    }

    if (hasReminder === 'true') {
      filter.reminderAt = { $ne: null };
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } },
      ];
    }

    const notes = await StickyNote.find(filter).sort({
      isPinned: -1,
      order: 1,
      createdAt: -1,
    });

    // Counts for filters
    const allUserNotes = await StickyNote.find({ user: userId, isArchived: false }).select(
      'color isPinned isCompleted reminderAt reminderSent'
    );

    const stats = {
      total: allUserNotes.length,
      pinned: allUserNotes.filter((n) => n.isPinned).length,
      withReminders: allUserNotes.filter((n) => n.reminderAt && !n.isCompleted).length,
      completed: allUserNotes.filter((n) => n.isCompleted).length,
    };

    res.json({ notes, stats });
  } catch (error) {
    console.error('Error fetching sticky notes:', error);
    res.status(500).json({ message: 'Failed to fetch sticky notes', error: error.message });
  }
};

// @desc    Create new sticky note
// @route   POST /api/sticky-notes
// @access  Private (All Employees)
exports.createStickyNote = async (req, res) => {
  try {
    const {
      title,
      content,
      color,
      fontStyle,
      textColor,
      isPinned,
      tags,
      priority,
      reminderAt,
      sendEmailReminder,
      sendInAppReminder,
      position,
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Note content is required' });
    }

    let parsedReminder = null;
    if (reminderAt) {
      const d = new Date(reminderAt);
      if (!isNaN(d.getTime())) {
        parsedReminder = d;
      }
    }

    const note = await StickyNote.create({
      user: req.user._id,
      company: req.companyId || req.user.company?._id || req.user.company,
      title: title ? title.trim() : '',
      content: content.trim(),
      color: color || 'yellow',
      fontStyle: fontStyle || 'caveat',
      textColor: textColor || '',
      isPinned: Boolean(isPinned),
      tags: Array.isArray(tags) ? tags : typeof tags === 'string' && tags ? tags.split(',').map((t) => t.trim()) : [],
      priority: priority || 'Medium',
      reminderAt: parsedReminder,
      reminderSent: false,
      sendEmailReminder: sendEmailReminder !== undefined ? Boolean(sendEmailReminder) : true,
      sendInAppReminder: sendInAppReminder !== undefined ? Boolean(sendInAppReminder) : true,
      position: position && typeof position === 'object' ? {
        x: typeof position.x === 'number' ? Math.round(position.x) : null,
        y: typeof position.y === 'number' ? Math.round(position.y) : null,
        zIndex: typeof position.zIndex === 'number' ? position.zIndex : 1,
        rotation: typeof position.rotation === 'number' ? position.rotation : 0,
      } : { x: null, y: null, zIndex: 1, rotation: 0 },
    });

    res.status(201).json({
      message: 'Sticky note created',
      note,
    });
  } catch (error) {
    console.error('Error creating sticky note:', error);
    res.status(500).json({ message: 'Failed to create sticky note', error: error.message });
  }
};

// @desc    Update sticky note
// @route   PUT /api/sticky-notes/:id
// @access  Private (Owner only)
exports.updateStickyNote = async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    const {
      title,
      content,
      color,
      fontStyle,
      textColor,
      isPinned,
      isCompleted,
      tags,
      priority,
      reminderAt,
      sendEmailReminder,
      sendInAppReminder,
      position,
    } = req.body;

    if (title !== undefined) note.title = title.trim();
    if (content !== undefined) note.content = content.trim();
    if (color !== undefined) note.color = color;
    if (fontStyle !== undefined) note.fontStyle = fontStyle;
    if (textColor !== undefined) note.textColor = textColor;
    if (isPinned !== undefined) note.isPinned = Boolean(isPinned);
    if (isCompleted !== undefined) note.isCompleted = Boolean(isCompleted);
    if (priority !== undefined) note.priority = priority;
    if (tags !== undefined) {
      note.tags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t) => t.trim()) : [];
    }
    if (sendEmailReminder !== undefined) note.sendEmailReminder = Boolean(sendEmailReminder);
    if (sendInAppReminder !== undefined) note.sendInAppReminder = Boolean(sendInAppReminder);
    if (position && typeof position === 'object') {
      note.position = {
        x: typeof position.x === 'number' ? Math.round(position.x) : note.position?.x ?? null,
        y: typeof position.y === 'number' ? Math.round(position.y) : note.position?.y ?? null,
        zIndex: typeof position.zIndex === 'number' ? position.zIndex : note.position?.zIndex ?? 1,
        rotation: typeof position.rotation === 'number' ? position.rotation : note.position?.rotation ?? 0,
      };
    }

    if (reminderAt !== undefined) {
      if (reminderAt) {
        const d = new Date(reminderAt);
        if (!isNaN(d.getTime())) {
          note.reminderAt = d;
          // If updated to future date, reset reminderSent flag
          note.reminderSent = false;
        }
      } else {
        note.reminderAt = null;
        note.reminderSent = false;
      }
    }

    await note.save();

    res.json({
      message: 'Sticky note updated',
      note,
    });
  } catch (error) {
    console.error('Error updating sticky note:', error);
    res.status(500).json({ message: 'Failed to update sticky note', error: error.message });
  }
};

// @desc    Quick toggle pin
// @route   PATCH /api/sticky-notes/:id/pin
// @access  Private (Owner only)
exports.togglePin = async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    note.isPinned = !note.isPinned;
    await note.save();

    res.json({
      message: note.isPinned ? 'Note pinned to top' : 'Note unpinned',
      isPinned: note.isPinned,
      note,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling pin status', error: error.message });
  }
};

// @desc    Quick toggle complete
// @route   PATCH /api/sticky-notes/:id/complete
// @access  Private (Owner only)
exports.toggleComplete = async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    note.isCompleted = !note.isCompleted;
    await note.save();

    res.json({
      message: note.isCompleted ? 'Marked as completed' : 'Marked active',
      isCompleted: note.isCompleted,
      note,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling completion', error: error.message });
  }
};

// @desc    Quick update color
// @route   PATCH /api/sticky-notes/:id/color
// @access  Private (Owner only)
exports.updateColor = async (req, res) => {
  try {
    const { color } = req.body;
    if (!['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'teal', 'white'].includes(color)) {
      return res.status(400).json({ message: 'Invalid color provided' });
    }

    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    note.color = color;
    await note.save();

    res.json({
      message: 'Color updated',
      color: note.color,
      note,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating color', error: error.message });
  }
};

// @desc    Quick update styling (color, fontStyle, textColor)
// @route   PATCH /api/sticky-notes/:id/style
// @access  Private (Owner only)
exports.updateStyle = async (req, res) => {
  try {
    const { color, fontStyle, textColor } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    if (color !== undefined) note.color = color;
    if (fontStyle !== undefined) note.fontStyle = fontStyle;
    if (textColor !== undefined) note.textColor = textColor;

    await note.save();

    res.json({
      message: 'Styling updated',
      note,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating styling', error: error.message });
  }
};

// @desc    Instant test reminder trigger
// @route   POST /api/sticky-notes/:id/test-reminder
// @access  Private (Owner only)
exports.testReminder = async (req, res) => {
  try {
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    const company = req.user.company;
    await dispatchNoteReminder(note, req.user, company);

    res.json({
      message: `Test reminder dispatched! In-app alert created & notification email sent to ${req.user.email}.`,
    });
  } catch (error) {
    console.error('Error testing reminder:', error);
    res.status(500).json({ message: 'Failed to dispatch test reminder', error: error.message });
  }
};

// @desc    Update single note position
// @route   PATCH /api/sticky-notes/:id/position
// @access  Private (Owner only)
exports.updatePosition = async (req, res) => {
  try {
    const { x, y, zIndex, rotation } = req.body;
    const note = await StickyNote.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    note.position = {
      x: typeof x === 'number' ? Math.round(x) : note.position?.x ?? null,
      y: typeof y === 'number' ? Math.round(y) : note.position?.y ?? null,
      zIndex: typeof zIndex === 'number' ? zIndex : note.position?.zIndex || 1,
      rotation: typeof rotation === 'number' ? rotation : note.position?.rotation || 0,
    };

    await note.save();
    res.json({ message: 'Position updated', position: note.position, note });
  } catch (error) {
    res.status(500).json({ message: 'Error updating position', error: error.message });
  }
};

// @desc    Update batch note positions (e.g., auto arrange or reset)
// @route   PATCH /api/sticky-notes/batch-positions
// @access  Private (Owner only)
exports.updateBatchPositions = async (req, res) => {
  try {
    const { positions } = req.body; // array of { id, x, y, zIndex, rotation }
    if (!Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ message: 'Positions array required' });
    }

    const bulkOps = positions.map((p) => ({
      updateOne: {
        filter: { _id: p.id, user: req.user._id },
        update: {
          $set: {
            'position.x': typeof p.x === 'number' ? Math.round(p.x) : null,
            'position.y': typeof p.y === 'number' ? Math.round(p.y) : null,
            'position.zIndex': typeof p.zIndex === 'number' ? p.zIndex : 1,
            'position.rotation': typeof p.rotation === 'number' ? p.rotation : 0,
          },
        },
      },
    }));

    await StickyNote.bulkWrite(bulkOps);
    res.json({ message: 'Positions updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating batch positions', error: error.message });
  }
};

// @desc    Delete sticky note
// @route   DELETE /api/sticky-notes/:id
// @access  Private (Owner only)
exports.deleteStickyNote = async (req, res) => {
  try {
    const note = await StickyNote.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!note) {
      return res.status(404).json({ message: 'Sticky note not found' });
    }

    res.json({ message: 'Sticky note deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete sticky note', error: error.message });
  }
};

module.exports.dispatchNoteReminder = dispatchNoteReminder;
