const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const Report = require('../models/Report');
const Responder = require('../models/Responder');
const Feedback = require('../models/Feedback');
const { protect, adminOnly, responderOnly } = require('../middleware/auth');
const { upload, processImages } = require('../utils/fileUpload');
const { notifyAdminNewReport, notifyUserStatusUpdate } = require('../utils/emailService');
const { computePriority } = require('../utils/priority');
const { findPossibleDuplicates, distanceBetween } = require('../utils/duplicate');
const { canTransition, toLegacyStatus } = require('../utils/lifecycle');
const { pushTimeline, audit } = require('../utils/history');
const { notify } = require('../utils/notify');
const { haversineKm, toGeoPoint, slaMinutes, addMinutes } = require('../utils/geo');
const { responseMinutes, resolutionMinutes } = require('../utils/sla');

const router = express.Router();

// Helper: escape user input used inside RegExp
const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper: emit incident update to all interested rooms
function emitIncident(io, report, event = 'incidentUpdate') {
  if (!io) return;
  const payload = { reportId: report._id, status: report.status, priority: report.priority };
  io.to('admins').emit(event, payload);
  if (report.user) io.to(`user_${report.user._id || report.user}`).emit(event, payload);
  if (report.assignedResponder) io.to(`user_${report.assignedResponder._id || report.assignedResponder}`).emit(event, payload);
  io.to('responders').emit(event, payload);
}

// ===================================================================
// CREATE REPORT (citizen) — priority scoring + duplicate detection
// ===================================================================
router.post('/', protect, upload.array('images', 4), [
  body('type').isIn(['accident', 'fire', 'crime', 'medical', 'natural_disaster', 'other']).withMessage('Invalid emergency type'),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }).withMessage('Title too long'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 2000 }).withMessage('Description too long'),
  body('address').trim().notEmpty().withMessage('Location address is required'),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 }),
  body('affectedPeople').optional().isInt({ min: 0, max: 10000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { type, severity, title, description, address, lat, lng, affectedPeople } = req.body;

    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = await processImages(req.files);
    }

    const latNum = lat !== undefined && lat !== '' ? parseFloat(lat) : null;
    const lngNum = lng !== undefined && lng !== '' ? parseFloat(lng) : null;

    // Transparent priority scoring
    const prio = computePriority({
      type,
      severity: severity || 'medium',
      affectedPeople,
      hasImages: imagePaths.length > 0,
      description
    });

    // Duplicate detection (warning only — never blocks)
    const possibleDuplicates = await findPossibleDuplicates({ type, lat: latNum, lng: lngNum });

    const report = await Report.create({
      user: req.user._id,
      type,
      severity: severity || 'medium',
      title,
      description,
      location: { address, lat: latNum, lng: lngNum, coords: toGeoPoint(latNum, lngNum) },
      images: imagePaths,
      status: 'REPORTED',
      legacyStatus: 'Pending',
      priority: prio.priority,
      priorityScore: prio.score,
      priorityReason: prio.reason,
      affectedPeople: parseInt(affectedPeople) || 0,
      timeline: [{ action: 'REPORT_CREATED', actor: req.user._id, actorName: req.user.name, actorRole: req.user.role, note: title, at: new Date() }]
    });

    await report.populate('user', 'name email phone');

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('newReport', report); // legacy event preserved
      io.to('admins').emit('incidentUpdate', { reportId: report._id, status: report.status, priority: report.priority });
    }

    notify({
      recipient: 'admins', type: 'newReport',
      title: `🚨 New ${prio.priority} priority ${type} reported`,
      message: `${title} — ${address}`,
      report: report._id, actor: req.user._id,
      level: prio.priority === 'CRITICAL' ? 'critical' : prio.priority === 'HIGH' ? 'warning' : 'info',
      io
    });

    notifyAdminNewReport(report, req.user).catch(err => console.error('Email notification error:', err));

    audit({ actor: req.user, action: 'REPORT_CREATED', target: report._id, targetKind: 'Report', description: `Reported: ${title}`, metadata: { priority: prio.priority, score: prio.score }, ip: req.ip });

    res.status(201).json({
      success: true,
      report,
      priority: prio,
      possibleDuplicates: possibleDuplicates.map(d => ({
        _id: d._id, title: d.title, status: d.status, severity: d.severity,
        createdAt: d.createdAt, distanceKm: distanceBetween({ lat: latNum, lng: lngNum }, d),
        reportedBy: d.user?.name || 'Unknown'
      }))
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ success: false, message: 'Server error creating report' });
  }
});

// ===================================================================
// GET MY REPORTS (citizen)
// ===================================================================
router.get('/my', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { 'location.address': rx }];
    }

    const [reports, total] = await Promise.all([
      Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('assignedResponder', 'name').lean(),
      Report.countDocuments(filter)
    ]);

    res.json({ success: true, reports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// GET ALL REPORTS (admin) — filters + stats + SLA flags
// ===================================================================
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.assigned === 'unassigned') filter.assignedResponder = null;
    if (req.query.assigned === 'assigned') filter.assignedResponder = { $ne: null };
    if (req.query.escalated === 'true') filter['sla.escalated'] = true;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { 'location.address': rx }];
    }

    const [reports, total, stats] = await Promise.all([
      Report.find(filter)
        .populate('user', 'name email phone')
        .populate('assignedResponder', 'name email phone')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Report.countDocuments(filter),
      Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);

    const statusStats = { Pending: 0, 'In Progress': 0, Resolved: 0, Dismissed: 0 };
    const lifecycleStats = {};
    stats.forEach(s => {
      lifecycleStats[s._id] = s.count;
      const legacy = toLegacyStatus(s._id);
      statusStats[legacy] = (statusStats[legacy] || 0) + s.count;
    });

    const now = Date.now();
    const enriched = reports.map(r => ({
      ...r,
      slaBreached: Boolean(r.sla && !r.dispatchedAt && r.sla.dispatchDueAt && now > new Date(r.sla.dispatchDueAt).getTime()) ||
        Boolean(r.sla && !r.resolvedAt && r.sla.resolveDueAt && now > new Date(r.sla.resolveDueAt).getTime()),
      responseMinutes: responseMinutes(r),
      resolutionMinutes: resolutionMinutes(r)
    }));

    res.json({
      success: true,
      reports: enriched,
      stats: statusStats,
      lifecycleStats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// GET SINGLE REPORT — owner, admin, or assigned responder
// ===================================================================
router.get('/:id', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('assignedResponder', 'name email phone')
      .populate('verifiedBy', 'name')
      .populate('timeline.actor', 'name role');

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const isOwner = report.user && report.user._id.toString() === req.user._id.toString();
    const isAssigned = report.assignedResponder && report.assignedResponder._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// EDIT REPORT (citizen, only while REPORTED)
// ===================================================================
router.put('/:id', protect, [
  body('title').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('address').optional().trim().notEmpty(),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 }),
  body('affectedPeople').optional().isInt({ min: 0, max: 10000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (report.status !== 'REPORTED') {
      return res.status(400).json({ success: false, message: 'Report can only be edited while status is REPORTED' });
    }

    const { title, description, severity, address, lat, lng, affectedPeople } = req.body;
    if (title !== undefined) report.title = title;
    if (description !== undefined) report.description = description;
    if (severity !== undefined) report.severity = severity;
    if (address !== undefined) report.location.address = address;
    if (lat !== undefined && lat !== '') report.location.lat = parseFloat(lat);
    if (lng !== undefined && lng !== '') report.location.lng = parseFloat(lng);
    if (lat !== undefined && lng !== undefined && lat !== '' && lng !== '') {
      report.location.coords = toGeoPoint(parseFloat(lat), parseFloat(lng));
    }
    if (affectedPeople !== undefined) report.affectedPeople = parseInt(affectedPeople) || 0;

    const prio = computePriority({
      type: report.type, severity: report.severity, affectedPeople: report.affectedPeople,
      hasImages: (report.images || []).length > 0, description: report.description
    });
    report.priority = prio.priority;
    report.priorityScore = prio.score;
    report.priorityReason = prio.reason;
    report.editedAt = new Date();

    pushTimeline(report, 'REPORT_EDITED', req.user, 'Citizen updated incident details');
    await report.save();
    await report.populate('user', 'name email phone');

    const io = req.app.get('io');
    if (io) io.to('admins').emit('incidentUpdate', { reportId: report._id, status: report.status, priority: report.priority });

    audit({ actor: req.user, action: 'REPORT_EDITED', target: report._id, targetKind: 'Report', description: `Edited: ${report.title}`, ip: req.ip });

    res.json({ success: true, report, priority: prio });
  } catch (error) {
    console.error('Edit report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// WITHDRAW REPORT (citizen, before dispatch)
// ===================================================================
router.patch('/:id/withdraw', protect, [body('reason').optional().trim().isLength({ max: 500 })], async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const check = canTransition(report.status, 'WITHDRAWN', 'user');
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    report.status = 'WITHDRAWN';
    report.legacyStatus = 'Dismissed';
    report.withdrawnReason = req.body.reason || '';
    pushTimeline(report, 'REPORT_WITHDRAWN', req.user, report.withdrawnReason);
    await report.save();

    const io = req.app.get('io');
    emitIncident(io, report);
    notify({
      recipient: 'admins', type: 'reportWithdrawn',
      title: 'Incident withdrawn by citizen',
      message: `${report.title} was withdrawn${report.withdrawnReason ? `: ${report.withdrawnReason}` : ''}`,
      report: report._id, actor: req.user._id, level: 'warning', io
    });

    audit({ actor: req.user, action: 'REPORT_WITHDRAWN', target: report._id, targetKind: 'Report', description: `Withdrawn: ${report.title}`, ip: req.ip });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Withdraw report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// LIFECYCLE TRANSITIONS (unified, role-enforced)
// PATCH /api/reports/:id/status  { status, note?, rejectedReason?, resolutionNotes? }
// ===================================================================
router.patch('/:id/status', protect, [body('status').notEmpty().withMessage('Status is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { status, note = '', rejectedReason = '', resolutionNotes = '' } = req.body;
    const report = await Report.findById(req.params.id).populate('user', 'name email phone notificationsEnabled');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const role = req.user.role;
    const check = canTransition(report.status, status, role);
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    if (role === 'responder') {
      if (!report.assignedResponder || report.assignedResponder.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'This incident is not assigned to you' });
      }
    }

    const now = new Date();
    let timelineAction = null;
    let notifyTitle = null;
    let notifyLevel = 'info';
    let notifyType = null;

    switch (status) {
      case 'VERIFIED': {
        report.verifiedBy = req.user._id;
        report.verifiedAt = now;
        const m = slaMinutes(report.priority);
        report.sla = {
          verifyDueAt: addMinutes(now, m.verify),
          dispatchDueAt: addMinutes(now, m.dispatch),
          resolveDueAt: addMinutes(now, m.resolve),
          escalated: false
        };
        timelineAction = 'REPORT_VERIFIED';
        notifyType = 'reportVerified';
        notifyTitle = '✅ Your emergency report has been verified';
        notifyLevel = 'success';
        break;
      }
      case 'REJECTED':
        report.rejectedReason = rejectedReason || note || 'No reason provided';
        timelineAction = 'REPORT_REJECTED';
        notifyType = 'reportRejected';
        notifyTitle = '❌ Your report was rejected by the control room';
        notifyLevel = 'warning';
        break;
      case 'PRIORITIZED':
        timelineAction = 'PRIORITY_ASSIGNED';
        break;
      case 'DISPATCHED':
        report.dispatchedAt = now;
        timelineAction = 'DISPATCHED';
        notifyType = 'dispatched';
        notifyTitle = '🚑 You have been dispatched to an incident';
        notifyLevel = 'critical';
        break;
      case 'RESPONDER_ACCEPTED':
        report.acceptedAt = now;
        timelineAction = 'RESPONDER_ACCEPTED';
        notifyType = 'responderAccepted';
        notifyTitle = '🙌 Responder accepted the assignment';
        break;
      case 'RESPONDER_ARRIVED':
        report.arrivedAt = now;
        timelineAction = 'RESPONDER_ARRIVED';
        notifyType = 'responderArrived';
        notifyTitle = '📍 Responder has arrived on scene';
        notifyLevel = 'success';
        break;
      case 'RESOLVED':
        report.resolvedAt = now;
        report.legacyStatus = 'Resolved';
        if (resolutionNotes || note) report.adminNotes = resolutionNotes || note;
        timelineAction = 'RESOLVED';
        notifyType = 'reportResolved';
        notifyTitle = '✅ Your incident has been resolved';
        notifyLevel = 'success';
        break;
      case 'CLOSED':
        report.closedAt = now;
        timelineAction = 'CLOSED';
        notifyType = 'reportClosed';
        notifyTitle = '📁 Incident closed';
        break;
      case 'ASSIGNED': // reassignment path (after DISPATCHED rejection)
        timelineAction = 'RESPONDER_REASSIGNED';
        report.dispatchedAt = null;
        report.acceptedAt = null;
        break;
    }

    report.status = status;
    report.legacyStatus = toLegacyStatus(status);
    if (note && status !== 'RESOLVED') report.adminNotes = note;

    pushTimeline(report, timelineAction || status, req.user, note || rejectedReason || '');
    await report.save();
    await report.populate('user', 'name email phone');
    await report.populate('assignedResponder', 'name email phone');

    const io = req.app.get('io');
    emitIncident(io, report, 'incidentUpdate');

    // Legacy event for old clients
    if (io) {
      io.to(`user_${report.user._id}`).emit('statusUpdate', {
        reportId: report._id, status: report.status,
        adminNotes: report.adminNotes, resolvedAt: report.resolvedAt
      });
    }

    if (notifyType && notifyTitle) {
      if (report.user && report.user.notificationsEnabled !== false) {
        notify({
          recipient: report.user._id, type: notifyType, title: notifyTitle,
          message: `${report.title} — status: ${status}`,
          report: report._id, actor: req.user._id, level: notifyLevel, io
        });
      }
      if (role === 'responder') {
        notify({
          recipient: 'admins', type: notifyType,
          title: notifyTitle.replace('Your', 'Citizen').replace('You have been', 'Responder has been'),
          message: `${report.title} — ${status}`,
          report: report._id, actor: req.user._id, level: notifyLevel, io
        });
      }
    }

    if (report.user && report.user.email && report.user.notificationsEnabled !== false) {
      notifyUserStatusUpdate(report, report.user.email).catch(err => console.error('Email notification error:', err));
    }

    audit({ actor: req.user, action: timelineAction || status, target: report._id, targetKind: 'Report', description: `${report.title}: ${report.status}`, ip: req.ip });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// PRIORITY CHANGE (admin, transparent)
// ===================================================================
router.patch('/:id/priority', protect, adminOnly, [
  body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Invalid priority'),
  body('reason').optional().trim().isLength({ max: 300 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const report = await Report.findById(req.params.id).populate('user', 'name email');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const oldPriority = report.priority;
    report.priority = req.body.priority;
    report.priorityReason = `Manually set by ${req.user.name}: ${req.body.reason || 'control room judgment'}`;

    const m = slaMinutes(report.priority);
    const base = report.verifiedAt || new Date();
    report.sla = {
      verifyDueAt: addMinutes(base, m.verify),
      dispatchDueAt: addMinutes(base, m.dispatch),
      resolveDueAt: addMinutes(base, m.resolve),
      escalated: false
    };

    pushTimeline(report, 'PRIORITY_CHANGED', req.user, `${oldPriority} → ${report.priority}. ${req.body.reason || ''}`);
    await report.save();

    const io = req.app.get('io');
    emitIncident(io, report);
    if (report.user) {
      notify({
        recipient: report.user._id, type: 'priorityChanged',
        title: `⚡ Incident priority updated to ${report.priority}`,
        message: report.title, report: report._id, actor: req.user._id, level: 'info', io
      });
    }

    audit({ actor: req.user, action: 'PRIORITY_CHANGED', target: report._id, targetKind: 'Report', description: `${report.title}: ${oldPriority} → ${report.priority}`, ip: req.ip });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Priority change error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// RESPONDER RECOMMENDATIONS (admin) — smart assignment suggestions
// ===================================================================
router.get('/:id/recommendations', protect, adminOnly, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const specMap = {
      medical: 'Medical', fire: 'Fire', crime: 'Police',
      accident: ['Medical', 'Police', 'General'], natural_disaster: 'Disaster', other: 'General'
    };
    const preferred = specMap[report.type] || 'General';
    const preferredList = Array.isArray(preferred) ? preferred : [preferred];

    const responders = await Responder.find({ active: true, availability: { $in: ['Available', 'Assigned'] } })
      .populate('user', 'name email phone').lean();

    const recommendations = responders.map(r => {
      const dist = (report.location?.lat != null && r.lastLocation?.lat != null)
        ? haversineKm(report.location.lat, report.location.lng, r.lastLocation.lat, r.lastLocation.lng)
        : null;

      let score = 0;
      const reasons = [];

      if (preferredList.includes(r.specialization)) {
        score += 50;
        reasons.push(`Specialization matches (${r.specialization})`);
      } else if (r.specialization === 'General') {
        score += 20;
        reasons.push('General responder (flexible)');
      } else {
        score += 5;
        reasons.push(`Different specialization (${r.specialization})`);
      }

      if (r.availability === 'Available') {
        score += 30;
        reasons.push('Currently available');
      } else {
        score += 5;
        reasons.push('Busy (Assigned)');
      }

      if (dist !== null) {
        if (dist <= 3) { score += 20; reasons.push(`Very close (${dist} km)`); }
        else if (dist <= 8) { score += 12; reasons.push(`Nearby (${dist} km)`); }
        else if (dist <= 20) { score += 5; reasons.push(`${dist} km away`); }
        else { reasons.push(`Far (${dist} km)`); }
      } else {
        reasons.push('Location unknown');
      }

      return {
        responderId: r._id, userId: r.user?._id, name: r.user?.name || 'Unknown',
        specialization: r.specialization, availability: r.availability, zone: r.zone,
        phone: r.user?.phone || '', distanceKm: dist, score, reason: reasons.join(' • ')
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// ASSIGN RESPONDER (admin)
// ===================================================================
router.patch('/:id/assign', protect, adminOnly, [body('responderUserId').notEmpty().withMessage('Responder is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const report = await Report.findById(req.params.id).populate('user', 'name email');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const responderProfile = await Responder.findOne({ user: req.body.responderUserId }).populate('user', 'name email phone');
    if (!responderProfile) return res.status(404).json({ success: false, message: 'Responder profile not found' });
    if (responderProfile.availability === 'Offline') {
      return res.status(400).json({ success: false, message: 'Responder is offline' });
    }

    const wasAssigned = Boolean(report.assignedResponder);
    const previousResponder = report.assignedResponder;

    report.assignedResponder = responderProfile.user._id;
    report.assignedAt = new Date();

    if (report.status === 'REPORTED' || report.status === 'VERIFIED') {
      report.status = 'PRIORITIZED';
      pushTimeline(report, 'PRIORITY_ASSIGNED', req.user, `Auto-prioritized (${report.priority}) during assignment`);
    }
    if (report.status === 'PRIORITIZED') {
      report.status = 'ASSIGNED';
      report.legacyStatus = 'In Progress';
    }

    pushTimeline(report, wasAssigned ? 'RESPONDER_REASSIGNED' : 'RESPONDER_ASSIGNED', req.user,
      `${responderProfile.user.name} (${responderProfile.specialization})`);

    responderProfile.availability = 'Assigned';
    await responderProfile.save();

    await report.save();
    await report.populate('assignedResponder', 'name email phone');

    const io = req.app.get('io');
    emitIncident(io, report);

    notify({
      recipient: responderProfile.user._id, type: 'responderAssigned',
      title: `🚨 You have been assigned a ${report.priority} priority incident`,
      message: `${report.title} — ${report.location.address}`,
      report: report._id, actor: req.user._id,
      level: report.priority === 'CRITICAL' ? 'critical' : 'warning', io
    });

    if (previousResponder && previousResponder.toString() !== responderProfile.user._id.toString()) {
      notify({
        recipient: previousResponder, type: 'adminMessage',
        title: 'Incident reassigned',
        message: `${report.title} has been reassigned to another responder.`,
        report: report._id, actor: req.user._id, level: 'info', io
      });
    }

    audit({ actor: req.user, action: 'RESPONDER_ASSIGNED', target: report._id, targetKind: 'Report', description: `${report.title} → ${responderProfile.user.name}`, ip: req.ip });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Assign responder error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// RESPONDER: REJECT ASSIGNMENT → back to ASSIGNED
// ===================================================================
router.patch('/:id/reject-assignment', protect, responderOnly, [body('reason').trim().notEmpty().withMessage('Rejection reason is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const report = await Report.findById(req.params.id).populate('user', 'name email');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (!report.assignedResponder || report.assignedResponder.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This incident is not assigned to you' });
    }
    if (report.status !== 'DISPATCHED') {
      return res.status(400).json({ success: false, message: 'Can only reject while DISPATCHED' });
    }

    const check = canTransition(report.status, 'ASSIGNED', 'responder');
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    report.status = 'ASSIGNED';
    report.dispatchedAt = null;
    pushTimeline(report, 'ASSIGNMENT_REJECTED', req.user, req.body.reason);

    await Responder.findOneAndUpdate({ user: req.user._id }, { availability: 'Available' });

    await report.save();
    await report.populate('assignedResponder', 'name email phone');

    const io = req.app.get('io');
    emitIncident(io, report);
    notify({
      recipient: 'admins', type: 'assignmentRejected',
      title: '⚠️ Assignment rejected by responder',
      message: `${req.user.name} rejected ${report.title}: ${req.body.reason}`,
      report: report._id, actor: req.user._id, level: 'warning', io
    });

    audit({ actor: req.user, action: 'ASSIGNMENT_REJECTED', target: report._id, targetKind: 'Report', description: `${report.title}: ${req.body.reason}`, ip: req.ip });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Reject assignment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// DUPLICATES: LINK / UNLINK (admin)
// ===================================================================
router.patch('/:id/link-duplicate', protect, adminOnly, [body('duplicateOf').notEmpty().withMessage('Primary incident id required')], async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    const primary = await Report.findById(req.body.duplicateOf);
    if (!report || !primary) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report._id.toString() === primary._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot link an incident to itself' });
    }

    report.duplicateOf = primary._id;
    primary.duplicates = [...new Set([...(primary.duplicates || []).map(String), report._id.toString()])];

    pushTimeline(report, 'DUPLICATE_LINKED', req.user, `Linked to primary incident: ${primary.title}`);
    pushTimeline(primary, 'DUPLICATE_LINKED', req.user, `Duplicate incident linked: ${report.title}`);

    await report.save();
    await primary.save();

    audit({ actor: req.user, action: 'DUPLICATE_LINKED', target: report._id, targetKind: 'Report', description: `${report.title} → ${primary.title}`, ip: req.ip });

    res.json({ success: true, report, primary });
  } catch (error) {
    console.error('Link duplicate error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/:id/unlink-duplicate', protect, adminOnly, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const primaryId = report.duplicateOf;
    report.duplicateOf = null;
    pushTimeline(report, 'DUPLICATE_UNLINKED', req.user, '');
    await report.save();

    if (primaryId) {
      await Report.findByIdAndUpdate(primaryId, { $pull: { duplicates: report._id } });
    }

    audit({ actor: req.user, action: 'DUPLICATE_UNLINKED', target: report._id, targetKind: 'Report', description: report.title, ip: req.ip });
    res.json({ success: true, report });
  } catch (error) {
    console.error('Unlink duplicate error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// FEEDBACK (citizen, after RESOLVED/CLOSED)
// ===================================================================
router.post('/:id/feedback', protect, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!['RESOLVED', 'CLOSED'].includes(report.status)) {
      return res.status(400).json({ success: false, message: 'Feedback can only be given after resolution' });
    }

    const existing = await Feedback.findOne({ report: report._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Feedback already submitted for this incident' });
    }

    const feedback = await Feedback.create({
      report: report._id, citizen: req.user._id,
      responder: report.assignedResponder || null,
      rating: parseInt(req.body.rating), comment: req.body.comment || ''
    });

    if (report.assignedResponder) {
      const r = await Responder.findOne({ user: report.assignedResponder });
      if (r) {
        const total = r.stats.ratingCount * r.stats.avgRating + feedback.rating;
        r.stats.ratingCount += 1;
        r.stats.avgRating = Math.round((total / r.stats.ratingCount) * 10) / 10;
        await r.save();
      }
    }

    pushTimeline(report, 'FEEDBACK_SUBMITTED', req.user, `Rated ${feedback.rating}/5`);
    await report.save();

    const io = req.app.get('io');
    notify({
      recipient: 'admins', type: 'feedbackReceived',
      title: `⭐ New feedback: ${feedback.rating}/5`,
      message: `${report.title}${feedback.comment ? ` — "${feedback.comment}"` : ''}`,
      report: report._id, actor: req.user._id, level: 'info', io
    });

    audit({ actor: req.user, action: 'FEEDBACK_SUBMITTED', target: report._id, targetKind: 'Report', description: `${report.title}: ${feedback.rating}/5`, ip: req.ip });

    res.status(201).json({ success: true, feedback });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// GET FEEDBACK for a report (owner or admin)
// ===================================================================
router.get('/:id/feedback', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const isOwner = report.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const feedback = await Feedback.findOne({ report: report._id }).populate('citizen', 'name');
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================================================================
// DELETE REPORT (admin) — also removes image files
// ===================================================================
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    (report.images || []).forEach(img => {
      try {
        const p = path.join(__dirname, '..', img.replace(/^\//, ''));
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) { /* non-fatal */ }
    });

    await Feedback.deleteOne({ report: report._id });
    await Report.findByIdAndDelete(report._id);

    const io = req.app.get('io');
    if (io) io.to('admins').emit('incidentUpdate', { reportId: report._id, deleted: true });

    audit({ actor: req.user, action: 'REPORT_DELETED', target: report._id, targetKind: 'Report', description: `Deleted: ${report.title}`, ip: req.ip });

    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
