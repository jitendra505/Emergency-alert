const express = require('express');
const { body, validationResult } = require('express-validator');
const Responder = require('../models/Responder');
const User = require('../models/User');
const Report = require('../models/Report');
const { protect, adminOnly, responderOnly } = require('../middleware/auth');
const { pushTimeline, audit } = require('../utils/history');
const { notify } = require('../utils/notify');
const { haversineKm } = require('../utils/geo');

const router = express.Router();

// ===================================================================
// RESPONDER SELF-SERVICE
// ===================================================================

// @route  GET /api/responders/me
// @desc   Current responder profile
router.get('/me', protect, responderOnly, async (req, res) => {
  try {
    let profile = await Responder.findOne({ user: req.user._id }).populate('user', 'name email phone');
    if (!profile) {
      profile = await Responder.create({ user: req.user._id });
    }
    res.json({ success: true, responder: profile });
  } catch (error) {
    console.error('Get responder profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  PUT /api/responders/me
// @desc   Update own profile / availability / location
router.put('/me', protect, responderOnly, [
  body('specialization').optional().isIn(['Medical', 'Fire', 'Police', 'Disaster', 'General']),
  body('availability').optional().isIn(['Available', 'Assigned', 'Responding', 'Offline']),
  body('zone').optional().trim().isLength({ max: 100 }),
  body('contactPhone').optional().trim().isLength({ max: 20 }),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    let profile = await Responder.findOne({ user: req.user._id });
    if (!profile) profile = await Responder.create({ user: req.user._id });

    const { specialization, availability, zone, contactPhone, lat, lng } = req.body;
    if (specialization !== undefined) profile.specialization = specialization;
    if (availability !== undefined) profile.availability = availability;
    if (zone !== undefined) profile.zone = zone;
    if (contactPhone !== undefined) profile.contactPhone = contactPhone;
    if (lat !== undefined && lng !== undefined && lat !== '' && lng !== '') {
      profile.lastLocation = { lat: parseFloat(lat), lng: parseFloat(lng), updatedAt: new Date() };
    }

    await profile.save();

    // Broadcast availability to control room
    const io = req.app.get('io');
    if (io && availability !== undefined) {
      io.to('admins').emit('responderAvailabilityChanged', {
        responderId: profile._id, userId: req.user._id,
        name: req.user.name, availability: profile.availability
      });
    }
    if (io && lat !== undefined && lng !== undefined) {
      io.to('admins').emit('responderLocation', {
        responderId: profile._id, userId: req.user._id,
        name: req.user.name, lat: profile.lastLocation.lat, lng: profile.lastLocation.lng
      });
    }

    res.json({ success: true, responder: profile });
  } catch (error) {
    console.error('Update responder profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  GET /api/responders/me/incidents
// @desc   Incidents assigned to me
router.get('/me/incidents', protect, responderOnly, async (req, res) => {
  try {
    const filter = { assignedResponder: req.user._id };
    // "active" view: everything not closed/rejected/withdrawn
    if (req.query.view === 'active') {
      filter.status = { $nin: ['CLOSED', 'REJECTED', 'WITHDRAWN'] };
    }
    if (req.query.status) filter.status = req.query.status;

    const reports = await Report.find(filter)
      .populate('user', 'name phone')
      .sort({ priorityScore: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, reports });
  } catch (error) {
    console.error('Responder incidents error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  GET /api/responders/nearby
// @desc   Admin: find available responders near coordinates
router.get('/nearby', protect, adminOnly, async (req, res) => {
  try {
    const { lat, lng, specialization, radiusKm = 15 } = req.query;
    const filter = { active: true, availability: { $in: ['Available', 'Assigned'] } };
    if (specialization) filter.specialization = specialization;

    const responders = await Responder.find(filter).populate('user', 'name email phone').lean();
    const withDistance = responders
      .map(r => ({
        ...r,
        distanceKm: (lat && lng && r.lastLocation?.lat != null)
          ? haversineKm(parseFloat(lat), parseFloat(lng), r.lastLocation.lat, r.lastLocation.lng)
          : null
      }))
      .filter(r => r.distanceKm === null || r.distanceKm <= parseFloat(radiusKm))
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));

    res.json({ success: true, responders: withDistance });
  } catch (error) {
    console.error('Nearby responders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// ADMIN MANAGEMENT
// ===================================================================

// @route  GET /api/responders
// @desc   List all responders with live stats
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const responders = await Responder.find().populate('user', 'name email phone active').lean();

    // Active assignment counts
    const assignmentCounts = await Report.aggregate([
      { $match: { assignedResponder: { $ne: null }, status: { $nin: ['RESOLVED', 'CLOSED', 'REJECTED', 'WITHDRAWN'] } } },
      { $group: { _id: '$assignedResponder', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    assignmentCounts.forEach(a => { countMap[a._id.toString()] = a.count; });

    const enriched = responders.map(r => ({
      ...r,
      activeAssignments: countMap[(r.user?._id || r.user || '').toString()] || 0
    }));

    res.json({ success: true, responders: enriched });
  } catch (error) {
    console.error('List responders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  POST /api/responders
// @desc   Admin creates a responder account (User + Responder profile)
router.post('/', protect, adminOnly, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('specialization').isIn(['Medical', 'Fire', 'Police', 'Disaster', 'General']).withMessage('Invalid specialization'),
  body('zone').optional().trim().isLength({ max: 100 }),
  body('contactPhone').optional().trim().isLength({ max: 20 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { name, email, password, specialization, zone, contactPhone } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: 'A user with this email already exists' });

    const user = await User.create({ name, email, password, phone: contactPhone, role: 'responder' });
    const responder = await Responder.create({
      user: user._id, specialization,
      zone: zone || '', contactPhone: contactPhone || '',
      availability: 'Available'
    });

    notify({
      recipient: user._id, type: 'accountCreated',
      title: 'Welcome to the Emergency Response Team',
      message: `Your responder account (${email}) was created. Specialization: ${specialization}.`,
      actor: req.user._id, level: 'success', io: req.app.get('io')
    });

    audit({ actor: req.user, action: 'RESPONDER_CREATED', target: user._id, targetKind: 'User', description: `Created responder ${email} (${specialization})`, ip: req.ip });

    res.status(201).json({ success: true, responder: { ...responder.toObject(), user: { id: user._id, name, email, role: 'responder' } } });
  } catch (error) {
    console.error('Create responder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  PUT /api/responders/:id
// @desc   Admin updates a responder profile
router.put('/:id', protect, adminOnly, [
  body('specialization').optional().isIn(['Medical', 'Fire', 'Police', 'Disaster', 'General']),
  body('availability').optional().isIn(['Available', 'Assigned', 'Responding', 'Offline']),
  body('active').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const profile = await Responder.findById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Responder not found' });

    const { specialization, availability, zone, contactPhone, active } = req.body;
    if (specialization !== undefined) profile.specialization = specialization;
    if (availability !== undefined) profile.availability = availability;
    if (zone !== undefined) profile.zone = zone;
    if (contactPhone !== undefined) profile.contactPhone = contactPhone;
    if (active !== undefined) profile.active = active;
    await profile.save();

    audit({ actor: req.user, action: 'RESPONDER_UPDATED', target: profile._id, targetKind: 'Responder', description: `Updated responder profile ${profile._id}`, metadata: req.body, ip: req.ip });

    res.json({ success: true, responder: profile });
  } catch (error) {
    console.error('Update responder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  DELETE /api/responders/:id
// @desc   Admin deactivates (not deletes) a responder
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const profile = await Responder.findById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Responder not found' });

    profile.active = false;
    profile.availability = 'Offline';
    await profile.save();
    await User.findByIdAndUpdate(profile.user, { active: false });

    audit({ actor: req.user, action: 'RESPONDER_DEACTIVATED', target: profile._id, targetKind: 'Responder', description: `Deactivated responder ${profile._id}`, ip: req.ip });

    res.json({ success: true, message: 'Responder deactivated' });
  } catch (error) {
    console.error('Deactivate responder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
