/* ===================================================================
   Incident lifecycle — status machine, transitions, timeline, SLA.
   Single source of truth for the Major Project incident workflow:

   REPORTED → VERIFIED → PRIORITIZED → ASSIGNED → DISPATCHED →
   RESPONDER_ACCEPTED → RESPONDER_ARRIVED → RESOLVED → CLOSED

   Side branches: REJECTED (admin), WITHDRAWN (citizen).
   =================================================================== */

const STATUSES = [
  'REPORTED', 'VERIFIED', 'PRIORITIZED', 'ASSIGNED', 'DISPATCHED',
  'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED', 'RESOLVED', 'CLOSED',
  'REJECTED', 'WITHDRAWN'
];

// Allowed transitions: from → [to...]
const TRANSITIONS = {
  REPORTED:           ['VERIFIED', 'REJECTED', 'WITHDRAWN'],
  VERIFIED:           ['PRIORITIZED', 'REJECTED', 'WITHDRAWN'],
  PRIORITIZED:        ['ASSIGNED', 'WITHDRAWN'],
  ASSIGNED:           ['DISPATCHED', 'RESPONDER_ACCEPTED', 'PRIORITIZED'], // reassign → back to PRIORITIZED
  DISPATCHED:         ['RESPONDER_ACCEPTED', 'ASSIGNED'],     // reject assignment → back to ASSIGNED
  RESPONDER_ACCEPTED: ['RESPONDER_ARRIVED'],
  RESPONDER_ARRIVED:  ['RESOLVED'],
  RESOLVED:           ['CLOSED'],
  CLOSED:             [],
  REJECTED:           [],
  WITHDRAWN:          []
};

// Which roles may perform each transition
const TRANSITION_ROLES = {
  'REPORTED>VERIFIED':            ['admin'],
  'REPORTED>REJECTED':            ['admin'],
  'REPORTED>WITHDRAWN':           ['user'],
  'VERIFIED>PRIORITIZED':         ['admin'],
  'VERIFIED>REJECTED':            ['admin'],
  'VERIFIED>WITHDRAWN':           ['user'],
  'PRIORITIZED>ASSIGNED':         ['admin'],
  'PRIORITIZED>WITHDRAWN':        ['user'],
  'ASSIGNED>DISPATCHED':          ['admin'],
  'ASSIGNED>RESPONDER_ACCEPTED':  ['responder'], // direct accept (dispatch optional)
  'ASSIGNED>PRIORITIZED':         ['admin'],   // reassignment
  'DISPATCHED>RESPONDER_ACCEPTED':['responder'],
  'DISPATCHED>ASSIGNED':          ['responder'], // responder rejects → admin reassigns
  'RESPONDER_ACCEPTED>RESPONDER_ARRIVED': ['responder'],
  'RESPONDER_ARRIVED>RESOLVED':   ['responder'],
  'RESOLVED>CLOSED':              ['admin']
};

/**
 * Check whether a transition is valid.
 * @returns {{ ok: boolean, message?: string }}
 */
function canTransition(from, to, role) {
  if (!STATUSES.includes(from)) return { ok: false, message: `Unknown current status: ${from}` };
  if (!STATUSES.includes(to)) return { ok: false, message: `Unknown target status: ${to}` };
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { ok: false, message: `Invalid transition: ${from} → ${to}` };
  }
  const permitted = TRANSITION_ROLES[`${from}>${to}`] || [];
  if (!permitted.includes(role)) {
    return { ok: false, message: `Role "${role}" is not allowed to move ${from} → ${to}` };
  }
  return { ok: true };
}

/**
 * Human-friendly labels for the UI timeline.
 */
const ACTION_LABELS = {
  REPORT_CREATED: 'Incident Reported',
  REPORT_EDITED: 'Incident Edited by Citizen',
  REPORT_WITHDRAWN: 'Incident Withdrawn by Citizen',
  REPORT_VERIFIED: 'Verified by Control Room',
  REPORT_REJECTED: 'Rejected by Control Room',
  PRIORITY_ASSIGNED: 'Priority Assigned',
  PRIORITY_CHANGED: 'Priority Changed',
  RESPONDER_ASSIGNED: 'Responder Assigned',
  RESPONDER_REASSIGNED: 'Responder Reassigned',
  DISPATCHED: 'Dispatched to Responder',
  ASSIGNMENT_REJECTED: 'Assignment Rejected by Responder',
  RESPONDER_ACCEPTED: 'Responder Accepted',
  RESPONDER_ARRIVED: 'Responder Arrived on Scene',
  RESOLVED: 'Incident Resolved',
  CLOSED: 'Incident Closed',
  DUPLICATE_LINKED: 'Linked as Duplicate',
  DUPLICATE_UNLINKED: 'Duplicate Unlinked',
  FEEDBACK_SUBMITTED: 'Citizen Feedback Received'
};

function labelFor(action) {
  return ACTION_LABELS[action] || action;
}

/**
 * Map new lifecycle statuses to the legacy 4-status model so the
 * existing UI badges and stats keep working (backward compatibility).
 */
function toLegacyStatus(status) {
  switch (status) {
    case 'REPORTED': return 'Pending';
    case 'VERIFIED':
    case 'PRIORITIZED':
    case 'ASSIGNED':
    case 'DISPATCHED':
    case 'RESPONDER_ACCEPTED':
    case 'RESPONDER_ARRIVED': return 'In Progress';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Resolved';
    case 'REJECTED': return 'Dismissed';
    case 'WITHDRAWN': return 'Dismissed';
    default: return 'Pending';
  }
}

module.exports = { STATUSES, TRANSITIONS, TRANSITION_ROLES, canTransition, labelFor, toLegacyStatus, ACTION_LABELS };
