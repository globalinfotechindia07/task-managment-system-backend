const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id} (Socket: ${socket.id})`);
    
    // Store socket mapping
    userSockets.set(socket.user.id, socket.id);

    // Optional: User can join a room based on their ID for easier targeted emitting
    socket.join(socket.user.id);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.id}`);
      userSockets.delete(socket.user.id);
    });
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

const emitTaskUpdate = (userIds, event, payload) => {
  if (io) {
    userIds.forEach(userId => {
      if (userId) {
        io.to(userId.toString()).emit(event, payload);
      }
    });
  }
};

module.exports = {
  initSocket,
  getIO,
  sendRealTimeNotification,
  emitTaskUpdate
};
