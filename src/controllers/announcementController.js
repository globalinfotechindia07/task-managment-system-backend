const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { sendAnnouncementEmail } = require('../utils/emailService');
const { sendNotificationToUser } = require('../utils/pushService');

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private
const getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create an announcement
// @route   POST /api/announcements
// @access  Private/HR Manager & Admin
const createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, scheduledDate } = req.body;

    const attachments = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const announcement = new Announcement({
      title,
      content,
      priority,
      scheduledDate,
      attachments,
      createdBy: req.user._id
    });

    const createdAnnouncement = await announcement.save();
    await createdAnnouncement.populate('createdBy', 'name role');
    
    // Fetch all users to send the announcement
    const allUsers = await User.find({}).select('email pushSubscriptions');
    sendAnnouncementEmail(createdAnnouncement, allUsers).catch(err => {
      console.error('Failed to send announcement emails:', err);
    });
    
    // Send push notifications
    allUsers.forEach(u => {
      if (u._id.toString() !== req.user._id.toString()) {
        sendNotificationToUser(u, {
          title: 'New Announcement',
          body: createdAnnouncement.title,
          url: '/'
        }).catch(err => console.error('Failed to send push notification:', err));
      }
    });
    
    res.status(201).json(createdAnnouncement);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete an announcement
// @route   DELETE /api/announcements/:id
// @access  Private/HR Manager & Admin
const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    if (announcement.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
       return res.status(403).json({ message: 'Not authorized to delete this announcement' });
    }

    await announcement.deleteOne();
    res.json({ message: 'Announcement removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an announcement
// @route   PUT /api/announcements/:id
// @access  Private/HR Manager & Admin
const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    if (announcement.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'Admin') {
       return res.status(403).json({ message: 'Not authorized to update this announcement' });
    }

    const { title, content, priority, scheduledDate } = req.body;
    
    announcement.title = title || announcement.title;
    announcement.content = content || announcement.content;
    announcement.priority = priority || announcement.priority;
    if (scheduledDate) announcement.scheduledDate = scheduledDate;

    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => `/uploads/${file.filename}`);
      announcement.attachments.push(...newAttachments);
    }

    const updatedAnnouncement = await announcement.save();
    await updatedAnnouncement.populate('createdBy', 'name role');

    res.json(updatedAnnouncement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement
};
