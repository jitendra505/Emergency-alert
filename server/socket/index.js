/* ===================================================================
   Socket.io handler — JWT-authenticated, room-based real-time layer.

   Backward compatible with the Minor Project:
     - rooms: admins, user_<id>
     - events: joinRoom, newReport, statusUpdate
   Extended for the Major Project:
     - handshake authentication (JWT in auth.token or query token)
     - responder rooms: responders, responder_<userId>
     - events: incidentUpdate, notification, unreadCountChanged,
       responderLocation, dispatch
   =================================================================== */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Responder = require('../models/Responder');

const socketHandler = (io) => {
  // ---- Handshake authentication ----
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('name role active');
      if (!user || user.active === false) {
        return next(new Error('Authentication failed'));
      }
      socket.data.user = { id: user._id.toString(), role: user.role, name: user.name };
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.data.user;
    console.log(`⚡ Socket connected: ${socket.id} (${role} ${userId})`);

    // Auto-join identity rooms (server-side, based on VERIFIED identity)
    socket.join(`user_${userId}`);
    if (role === 'admin') socket.join('admins');
    if (role === 'responder') socket.join('responders');

    // Legacy client event — kept for compatibility. The server now joins
    // rooms itself from the verified token; client payload is ignored.
    socket.on('joinRoom', (data) => {
      // no-op: rooms are joined server-side from verified identity
      socket.emit('joined', { userId, role });
    });

    // Responder shares live location (only responders may emit this)
    socket.on('responderLocation', async (data) => {
      if (role !== 'responder') return;
      const { lat, lng } = data || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      try {
        await Responder.findOneAndUpdate(
          { user: userId },
          { lastLocation: { lat, lng, updatedAt: new Date() } }
        );
        // Broadcast to control room only
        io.to('admins').emit('responderLocation', {
          responderId: userId,
          lat, lng, updatedAt: new Date()
        });
      } catch (err) {
        console.error('responderLocation error:', err.message);
      }
    });

    // Responder availability change broadcast (control room awareness)
    socket.on('responderAvailability', async (data) => {
      if (role !== 'responder') return;
      const { availability } = data || {};
      if (!['Available', 'Assigned', 'Responding', 'Offline'].includes(availability)) return;
      try {
        await Responder.findOneAndUpdate({ user: userId }, { availability });
        io.to('admins').emit('responderAvailabilityChanged', { responderId: userId, availability });
      } catch (err) {
        console.error('responderAvailability error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
