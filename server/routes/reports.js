const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Report = require('../models/Report');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { upload, processImages } = require('../utils/fileUpload');
const { notifyAdminNewReport, notifyUserStatusUpdate } = require('../utils/emailService');

const router = express.Router();

// @route   POST /api/reports
// @desc    Create a new emergency report (with optional image upload)
// @access  Private (User)
router.post('/', protect, upload.array('images', 4), [
  body('type').isIn(['accident', 'fire', 'crime', 'medical', 'natural_disaster', 'other'])
    .withMessage('Invalid emergency type'),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('title').trim().notEmpty().withMessage('Title is required')
    .isLength({ max: 100 }).withMessage('Title too long'),
  body('description').trim().notEmpty().withMessage('Description is required')
    .isLength({ max: 2000 }).withMessage('Description too long'),
  body('address').trim().notEmpty().withMessage('Location address is required'),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { type, severity, title, description, address, lat, lng } = req.body;

    // Process uploaded images
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      imagePaths = await processImages(req.files);
    }

    // Create report
    const report = await Report.create({
      user: req.user._id,
      type,
      severity: severity || 'medium',
      title,
      description,
      location: {
        address,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null
      },
      images: imagePaths
    });

    // Populate user info for the response
    await report.populate('user', 'name email phone');

    // Emit real-time alert to admins
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('newReport', report);
    }

    // Send email notification to admin (non-blocking)
    notifyAdminNewReport(report, req.user).catch(err =>
      console.error('Email notification error:', err)
    );

    res.status(201).json({ success: true, report });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ success: false, message: 'Server error creating report' });
  }
});

// @route   GET /api/reports/my
// @desc    Get current user's reports
// @access  Private (User)
router.get('/my', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments({ user: req.user._id })
    ]);

    res.json({
      success: true,
      reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/reports
// @desc    Get all reports (with filters)
// @access  Private (Admin)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.severity) filter.severity = req.query.severity;

    // Search by title or description
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
        { 'location.address': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const [reports, total, stats] = await Promise.all([
      Report.find(filter)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
      Report.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Format stats
    const statusStats = { Pending: 0, 'In Progress': 0, Resolved: 0, Dismissed: 0 };
    stats.forEach(s => { statusStats[s._id] = s.count; });

    res.json({
      success: true,
      reports,
      stats: statusStats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/reports/:id
// @desc    Get single report
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('user', 'name email phone');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Users can only see their own reports; admins can see all
    if (req.user.role !== 'admin' && report.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PATCH /api/reports/:id/status
// @desc    Update report status (admin only)
// @access  Private (Admin)
router.patch('/:id/status', protect, adminOnly, [
  body('status').isIn(['Pending', 'In Progress', 'Resolved', 'Dismissed'])
    .withMessage('Invalid status'),
  body('adminNotes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { status, adminNotes } = req.body;

    const updateData = { status };
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (status === 'Resolved') updateData.resolvedAt = new Date();

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    ).populate('user', 'name email phone');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Emit real-time status update to the report owner
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${report.user._id}`).emit('statusUpdate', {
        reportId: report._id,
        status: report.status,
        adminNotes: report.adminNotes,
        resolvedAt: report.resolvedAt
      });
    }

    // Send email notification to user (non-blocking)
    if (report.user && report.user.email) {
      notifyUserStatusUpdate(report, report.user.email).catch(err =>
        console.error('Email notification error:', err)
      );
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/reports/:id
// @desc    Delete a report (admin only)
// @access  Private (Admin)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
