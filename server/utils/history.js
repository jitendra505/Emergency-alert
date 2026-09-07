/* ===================================================================
   History & audit helpers — append timeline entries to incidents and
   write system-wide audit logs.
   =================================================================== */

const AuditLog = require('../models/AuditLog');
const { labelFor } = require('./lifecycle');

/**
 * Append a timeline entry to a report document (mutates the doc; caller saves).
 */
function pushTimeline(report, action, actor, note = '') {
  report.timeline.push({
    action,
    actor: actor ? actor._id || actor : null,
    actorName: actor ? (actor.name || 'System') : 'System',
    actorRole: actor ? (actor.role || 'system') : 'system',
    note,
    at: new Date()
  });
}

/**
 * Write an audit log entry (fire-and-forget safe wrapper).
 */
async function audit({ actor = null, action, target = null, targetKind = '', description = '', metadata = {}, ip = '' }) {
  try {
    await AuditLog.create({
      actor: actor ? (actor._id || actor) : null,
      actorName: actor ? (actor.name || 'Unknown') : 'System',
      actorRole: actor ? (actor.role || 'system') : 'system',
      action,
      target: { kind: targetKind, id: target },
      description: description || labelFor(action),
      metadata,
      ip
    });
  } catch (err) {
    console.error('audit error:', err.message);
  }
}

module.exports = { pushTimeline, audit };
