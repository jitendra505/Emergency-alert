/* ===================================================================
   SLA helpers — compute due dates per priority and detect breaches.
   =================================================================== */

const { slaMinutes, addMinutes } = require('./geo');

/**
 * Compute SLA due dates for a report at a given point in its lifecycle.
 * Called after verification (priority known) and after assignment.
 */
function computeSlaDates(report) {
  const m = slaMinutes(report.priority);
  const now = new Date();
  const sla = { escalated: report.sla?.escalated || false };

  if (report.verifiedAt) {
    sla.verifyDueAt = addMinutes(report.verifiedAt, m.verify);
    sla.dispatchDueAt = addMinutes(report.verifiedAt, m.dispatch);
    sla.resolveDueAt = addMinutes(report.verifiedAt, m.resolve);
  }
  return sla;
}

/**
 * Mark SLA breach flags on a report (mutates; caller saves).
 * Returns true if any breach newly detected.
 */
function checkSlaBreaches(report) {
  const now = Date.now();
  let breached = false;
  const s = report.sla || {};

  if (s.dispatchDueAt && !report.dispatchedAt && now > s.dispatchDueAt.getTime()) breached = true;
  if (s.resolveDueAt && !report.resolvedAt && now > s.resolveDueAt.getTime()) breached = true;

  if (breached && !s.escalated) {
    report.sla = { ...s, escalated: true };
  }
  return breached && !s.escalated;
}

/**
 * Response time in minutes: verifiedAt - createdAt (or first action after report).
 */
function responseMinutes(report) {
  if (!report.verifiedAt || !report.createdAt) return null;
  return Math.round((report.verifiedAt - report.createdAt) / 60000);
}

/**
 * Resolution time in minutes: resolvedAt - createdAt.
 */
function resolutionMinutes(report) {
  if (!report.resolvedAt || !report.createdAt) return null;
  return Math.round((report.resolvedAt - report.createdAt) / 60000);
}

module.exports = { computeSlaDates, checkSlaBreaches, responseMinutes, resolutionMinutes };
