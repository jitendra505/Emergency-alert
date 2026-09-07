const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null = system
  },
  actorName: { type: String, default: 'System' },
  actorRole: { type: String, default: 'system' },
  action: {
    type: String,
    required: true,
    index: true
    // e.g. LOGIN, LOGOUT, REPORT_CREATED, REPORT_VERIFIED, PRIORITY_CHANGED,
    // RESPONDER_ASSIGNED, DISPATCHED, RESPONDER_ACCEPTED, RESPONDER_ARRIVED,
    // REPORT_RESOLVED, REPORT_CLOSED, REPORT_WITHDRAWN, FEEDBACK_SUBMITTED,
    // USER_DEACTIVATED, USER_ACTIVATED, RESPONDER_UPDATED, DUPLICATE_LINKED
  },
  target: {
    kind: { type: String, default: '' },   // 'Report' | 'User' | 'Responder' | 'System'
    id: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  description: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' }
}, {
  timestamps: true
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'target.id': 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
