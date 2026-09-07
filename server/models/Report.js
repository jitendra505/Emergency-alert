const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['accident', 'fire', 'crime', 'medical', 'natural_disaster', 'other'],
    required: [true, 'Emergency type is required']
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  location: {
    address: {
      type: String,
      required: [true, 'Location address is required']
    },
    lat: {
      type: Number,
      default: null
    },
    lng: {
      type: Number,
      default: null
    },
    // GeoJSON point used by 2dsphere queries (kept in sync with lat/lng)
    coords: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined
      }
    }
  },
  images: [{
    type: String   // File paths of uploaded images
  }],
  status: {
    type: String,
    enum: [
      'REPORTED', 'VERIFIED', 'PRIORITIZED', 'ASSIGNED', 'DISPATCHED',
      'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED', 'RESOLVED', 'CLOSED', 'REJECTED', 'WITHDRAWN'
    ],
    default: 'REPORTED'
  },
  // Legacy status kept for backward compatibility with existing UI badges
  legacyStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved', 'Dismissed'],
    default: 'Pending'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  // ---- Major Project lifecycle fields ----
  // Transparent priority scoring
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  priorityScore: { type: Number, default: 0 },
  priorityReason: { type: String, default: '' },
  // Verification / rejection
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  rejectedReason: { type: String, default: '' },
  // Assignment / dispatch
  assignedResponder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedAt: { type: Date, default: null },
  dispatchedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  arrivedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  // SLA tracking (minutes allowed per stage; null = no SLA)
  sla: {
    verifyDueAt: { type: Date, default: null },
    dispatchDueAt: { type: Date, default: null },
    resolveDueAt: { type: Date, default: null },
    escalated: { type: Boolean, default: false }
  },
  // Duplicate detection
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
  duplicates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
  // Citizen edit/withdraw support
  withdrawnReason: { type: String, default: '' },
  editedAt: { type: Date, default: null },
  // Number of people affected (used in priority scoring)
  affectedPeople: { type: Number, default: 0 },
  // Full audit trail of the incident
  timeline: [{
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'System' },
    actorRole: { type: String, default: 'system' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Index for faster queries
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ user: 1, createdAt: -1 });
reportSchema.index({ type: 1 });
reportSchema.index({ priority: 1, status: 1 });
reportSchema.index({ assignedResponder: 1, status: 1 });
// Geospatial index for hotspots / nearby queries
reportSchema.index({ 'location.coords': '2dsphere' });

module.exports = mongoose.model('Report', reportSchema);
