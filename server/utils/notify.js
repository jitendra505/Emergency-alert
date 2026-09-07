/* ===================================================================
   Notification service — persists notifications AND emits real-time.
   Every notification is stored (inbox) then pushed via Socket.io to
   the recipient's personal room (user_<id>).
   =================================================================== */

const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Create + emit a notification.
 * @param {Object} opts
 *   recipient: ObjectId | 'admins'  (admins → all active admin users)
 *   type: string
 *   title: string
 *   message: string
 *   report: ObjectId|null
 *   actor: ObjectId|null
 *   level: info|success|warning|critical
 *   io: Socket.io server instance
 */
async function notify({ recipient, type, title, message = '', report = null, actor = null, level = 'info', io = null }) {
  try {
    const recipientIds = [];
    if (recipient === 'admins') {
      const admins = await User.find({ role: 'admin', active: true }).select('_id notificationsEnabled');
      admins.forEach(a => {
        if (a.notificationsEnabled) recipientIds.push(a._id);
      });
    } else if (recipient) {
      recipientIds.push(recipient);
    }

    for (const rid of recipientIds) {
      const n = await Notification.create({
        recipient: rid, type, title, message, report, actor, level
      });
      if (io) {
        io.to(`user_${rid}`).emit('notification', n);
        io.to(`user_${rid}`).emit('unreadCountChanged');
      }
    }
    return true;
  } catch (err) {
    console.error('notify error:', err.message);
    return false;
  }
}

module.exports = { notify };
