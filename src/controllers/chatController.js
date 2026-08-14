const Message = require('../models/Message');
const User = require('../models/User');
const ChatGroup = require('../models/ChatGroup');
const { sendRealTimeMessage, emitChatEvent } = require('../utils/socketService');

// @desc    Get chat history between logged-in user and selected user
// @route   GET /api/chat/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send a new message (to user or group)
// @route   POST /api/chat/send
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { receiverId, groupId, text } = req.body;
    const senderId = req.user._id;

    if (!text) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    if (!receiverId && !groupId) {
      return res.status(400).json({ message: 'Receiver ID or Group ID is required' });
    }

    const message = new Message({
      sender: senderId,
      receiver: receiverId || undefined,
      groupId: groupId || undefined,
      text
    });

    const savedMessage = await message.save();
    await savedMessage.populate('sender', 'name profilePicture');

    // Emit real-time message via Socket.IO
    if (groupId) {
      sendRealTimeMessage(groupId, savedMessage, true); // true indicates it's a group room
    } else {
      sendRealTimeMessage(receiverId, savedMessage, false);
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send a new media message (to user or group)
// @route   POST /api/chat/send-media
// @access  Private
const sendMediaMessage = async (req, res) => {
  try {
    const { receiverId, groupId, text, mediaType } = req.body;
    const senderId = req.user._id;

    if (!receiverId && !groupId) {
      return res.status(400).json({ message: 'Receiver ID or Group ID is required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Media file is required' });
    }

    const mediaUrl = `/uploads/${req.file.filename}`;

    const message = new Message({
      sender: senderId,
      receiver: receiverId || undefined,
      groupId: groupId || undefined,
      text: text || '',
      mediaUrl,
      mediaType: mediaType || 'document'
    });

    const savedMessage = await message.save();
    await savedMessage.populate('sender', 'name profilePicture');

    // Emit real-time message via Socket.IO
    if (groupId) {
      sendRealTimeMessage(groupId, savedMessage, true);
    } else {
      sendRealTimeMessage(receiverId, savedMessage, false);
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark messages from a user as read
// @route   PUT /api/chat/read/:userId
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const result = await Message.updateMany(
      { sender: userId, receiver: currentUserId, read: false },
      { $set: { read: true } }
    );

    if (result.modifiedCount > 0) {
      // Notify the sender that their messages were read
      emitChatEvent(userId, 'messages_read', { readerId: currentUserId });
    }

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new chat group
// @route   POST /api/chat/groups
// @access  Private (Admin only logic can be handled in routes or frontend)
const createGroup = async (req, res) => {
  try {
    const { name, members } = req.body;
    
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ message: 'Group name and members array are required' });
    }

    // Include the creator in the members list if not already there
    const allMembers = [...new Set([...members, req.user._id.toString()])];

    const newGroup = new ChatGroup({
      name,
      admin: req.user._id,
      members: allMembers
    });

    const savedGroup = await newGroup.save();
    res.status(201).json(savedGroup);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a chat group (Add/Remove members, change name)
// @route   PUT /api/chat/groups/:groupId
// @access  Private (Admin only)
const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, members } = req.body;

    const group = await ChatGroup.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Admins can update any group in this system, but we can verify admin status via middleware
    if (name) group.name = name;
    
    if (members && Array.isArray(members)) {
      // Ensure the creator/admin is always in the group to avoid getting locked out
      const allMembers = [...new Set([...members, req.user._id.toString()])];
      group.members = allMembers;
    }

    const updatedGroup = await group.save();
    res.json(updatedGroup);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all groups for the logged-in user
// @route   GET /api/chat/groups
// @access  Private
const getUserGroups = async (req, res) => {
  try {
    const groups = await ChatGroup.find({ members: req.user._id }).populate('members', 'name role profilePicture');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get messages for a specific group
// @route   GET /api/chat/group/:groupId
// @access  Private
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Optional: check if user is in group
    const group = await ChatGroup.findById(groupId);
    if (!group || !group.members.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not a member of this group' });
    }

    const messages = await Message.find({ groupId }).sort({ createdAt: 1 }).populate('sender', 'name profilePicture');
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get all recent conversations (users and groups)
// @route   GET /api/chat/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Get all users (except self)
    const users = await User.find({ _id: { $ne: userId } }).select('-password');
    
    // 2. Get all groups where user is a member
    const groups = await ChatGroup.find({ members: userId }).populate('members', 'name role profilePicture');

    const conversations = [];

    // Process Users
    for (const u of users) {
      const latestMessage = await Message.findOne({
        $or: [
          { sender: userId, receiver: u._id },
          { sender: u._id, receiver: userId }
        ]
      }).sort({ createdAt: -1 });

      const unreadCount = await Message.countDocuments({
        sender: u._id,
        receiver: userId,
        read: false
      });

      conversations.push({
        _id: u._id,
        isGroup: false,
        name: u.name,
        profilePicture: u.profilePicture,
        role: u.role,
        designation: u.designation,
        unreadCount,
        latestMessage: latestMessage ? {
          text: latestMessage.text,
          mediaType: latestMessage.mediaType,
          createdAt: latestMessage.createdAt,
          sender: latestMessage.sender
        } : null,
        updatedAt: latestMessage ? latestMessage.createdAt : new Date(0) // 1970 for sorting
      });
    }

    // Process Groups
    for (const group of groups) {
      const latestMessage = await Message.findOne({ groupId: group._id }).sort({ createdAt: -1 });

      conversations.push({
        _id: group._id,
        isGroup: true,
        name: group.name,
        members: group.members,
        unreadCount: 0, // Group unread tracking requires a different schema structure
        latestMessage: latestMessage ? {
          text: latestMessage.text,
          mediaType: latestMessage.mediaType,
          createdAt: latestMessage.createdAt,
          sender: latestMessage.sender
        } : null,
        updatedAt: latestMessage ? latestMessage.createdAt : group.createdAt
      });
    }

    // Sort all conversations by updatedAt descending
    conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  getMessages,
  sendMessage,
  sendMediaMessage,
  markAsRead,
  createGroup,
  updateGroup,
  getUserGroups,
  getGroupMessages,
  getConversations
};
