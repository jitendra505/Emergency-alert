/* ===================================================================
   Socket.io Client — Real-time communication layer
   =================================================================== */

let socket = null;

function initSocket() {
  if (socket) return socket;

  const user = getUser();
  if (!user) return null;

  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('⚡ Socket connected:', socket.id);
    // Join appropriate rooms
    socket.emit('joinRoom', { userId: user.id, role: user.role });
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    socket.emit('joinRoom', { userId: user.id, role: user.role });
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket connection error:', err.message);
  });

  return socket;
}

function getSocket() {
  return socket;
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
