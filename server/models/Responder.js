const mongoose = require('mongoose');

const responderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  specialization: {
    type: String,
    enum: ['Medical', 'Fire', 'Police', 'Disaster', 'General'],
    default: 'General'
  },
  availability: {
    type: String,
    enum: ['Available', 'Assigned', 'Responding', 'Offline'],
    default: 'Available'
  },
  // Region / unit the responder belongs to (used for filtering and dispatch)
  zone: {
    type: String,
    default: 'Zone 1'
  },
  contactPhone: {
    type: String,
    default: ''
  },
  // Availability of location depends on the responder sharing it (only used
  // while logged in); stored so the control room can see last known position.
  lastLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    updatedAt: { type: Date, default: null }
  },
  // Aggregated performance stats (updated on resolution)
  stats: {
    resolvedCount: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for the recommendation engine
responderSchema.index({ availability: 1, specialization: 1 });
responderSchema.index({ zone: 1 });

module.exports = mongoose.model('Responder', responderSchema);
