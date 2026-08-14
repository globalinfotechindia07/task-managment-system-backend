const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const ChatGroup = require('../models/ChatGroup');

let io;
// Keep track of connected users: { userId: socketId }
const userSockets = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Be more specific in production
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.id} (Socket: ${socket.id})`);
    
    // Store socket mapping
    userSockets.set(socket.user.id, socket.id);

    // Join personal room
    socket.join(socket.user.id);

    // Join group rooms
    try {
      const groups = await ChatGroup.find({ members: socket.user.id });
      groups.forEach(group => {
        socket.join(`group_${group._id}`);
      });
    } catch (err) {
      console.error('Error joining group rooms:', err);
    }

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.id}`);
      userSockets.delete(socket.user.id);
    });

    // ==========================================
    // WebRTC Signaling for Team Meetings
    // ==========================================

    socket.on('join-meeting', (roomId, userId) => {
      socket.join(roomId);
      // Broadcast to everyone else in the room that a new user joined
      socket.to(roomId).emit('user-connected', userId);

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', userId);
      });
    });

    socket.on('leave-meeting', (roomId, userId) => {
      socket.leave(roomId);
      socket.to(roomId).emit('user-disconnected', userId);
    });

    socket.on('invite-to-meeting', ({ roomId, fromName, toUserId }) => {
      const toSocketId = userSockets.get(toUserId);
      if (toSocketId) {
        io.to(toSocketId).emit('meeting-invite', { roomId, fromName });
      }
    });

    socket.on('offer', (payload) => {
      // payload: { to: userId, caller: userId, sdp: offer }
      const toSocketId = userSockets.get(payload.to);
      if (toSocketId) {
        io.to(toSocketId).emit('offer', payload);
      }
    });

    socket.on('answer', (payload) => {
      // payload: { to: userId, answer: sdp }
      const toSocketId = userSockets.get(payload.to);
      if (toSocketId) {
        io.to(toSocketId).emit('answer', payload);
      }
    });

    socket.on('ice-candidate', (payload) => {
      // payload: { to: userId, candidate: candidate, from: userId }
      const toSocketId = userSockets.get(payload.to);
      if (toSocketId) {
        io.to(toSocketId).emit('ice-candidate', payload);
      }
    });
    // ==========================================
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const sendRealTimeNotification = (userId, notification) => {
  if (io) {
    // We emit to the user's specific room
    io.to(userId.toString()).emit('notification', notification);
  }
};

const sendRealTimeMessage = (id, message, isGroup = false) => {
  if (io) {
    const room = isGroup ? `group_${id}` : id.toString();
    io.to(room).emit('receive_message', message);
  }
};

const emitTaskUpdate = (userIds, event, payload) => {
  if (io) {
    userIds.forEach(userId => {
      if (userId) {
        io.to(userId.toString()).emit(event, payload);
      }
    });
  }
};

const emitChatEvent = (userId, event, payload) => {
  if (io) {
    io.to(userId.toString()).emit(event, payload);
  }
};

module.exports = {
  initSocket,
  getIO,
  sendRealTimeNotification,
  emitTaskUpdate,
  sendRealTimeMessage,
  emitChatEvent
};
