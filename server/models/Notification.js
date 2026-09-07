const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'newReport', 'reportVerified', 'reportRejected', 'priorityChanged',
      'responderAssigned', 'dispatched', 'responderAccepted', 'responderArrived',
      'reportResolved', 'reportClosed', 'reportWithdrawn', 'feedbackReceived',
      'assignmentRejected', 'adminMessage', 'accountCreated'
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
  // Who triggered the notification (null for system-generated)
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Severity to color the notification in the UI
  level: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
  read: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Fast unread queries + inbox ordering
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
