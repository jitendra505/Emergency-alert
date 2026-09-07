const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    required: true,
    unique: true // one feedback per incident
  },
  citizen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  responder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    default: '',
    maxlength: 1000
  }
}, {
  timestamps: true
});

feedbackSchema.index({ responder: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
