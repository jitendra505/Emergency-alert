const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`);

    // User joins their personal room for status updates
    socket.on('joinRoom', (data) => {
      const { userId, role } = data;

      if (role === 'admin') {
        socket.join('admins');
        console.log(`👔 Admin joined admins room: ${socket.id}`);
      }

      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`👤 User joined room user_${userId}: ${socket.id}`);
      }
    });

    // Admin typing indicator (optional real-time feature)
    socket.on('adminTyping', (data) => {
      io.to(`user_${data.userId}`).emit('adminTyping', {
        reportId: data.reportId
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
