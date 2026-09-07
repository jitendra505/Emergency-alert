const express = require('express');
const Report = require('../models/Report');
const User = require('../models/User');
const Responder = require('../models/Responder');
const Feedback = require('../models/Feedback');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/stats/public
// @desc    Get public dashboard statistics (no auth required)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const [statusStats, typeStats, severityStats, recentReports, totalUsers] = await Promise.all([
      // Status breakdown
      Report.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Type breakdown
      Report.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // Severity breakdown
      Report.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      // Latest 5 resolved reports (public-safe: no user info)
      Report.find({ status: { $in: ['RESOLVED', 'CLOSED'] } })
        .select('type title location.address severity resolvedAt createdAt')
        .sort({ resolvedAt: -1 })
        .limit(5)
        .lean(),
      // Total registered users
      User.countDocuments()
    ]);

    // Format status stats
    const statuses = { Pending: 0, 'In Progress': 0, Resolved: 0, Dismissed: 0 };
    statusStats.forEach(s => { statuses[s._id] = s.count; });
    const totalReports = Object.values(statuses).reduce((a, b) => a + b, 0);

    // Format type stats
    const types = {};
    typeStats.forEach(t => { types[t._id] = t.count; });

    // Format severity stats
    const severities = { low: 0, medium: 0, high: 0, critical: 0 };
    severityStats.forEach(s => { severities[s._id] = s.count; });

    // Average resolution time (for resolved reports)
    const avgResolution = await Report.aggregate([
      { $match: { status: { $in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { $ne: null } } },
      {
        $project: {
          resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$resolutionTime' }
        }
      }
    ]);

    const avgResolutionHours = avgResolution.length > 0
      ? Math.round(avgResolution[0].avgTime / (1000 * 60 * 60) * 10) / 10
      : 0;

    res.json({
      success: true,
      stats: {
        totalReports,
        totalUsers,
        statuses,
        types,
        severities,
        avgResolutionHours,
        recentResolved: recentReports
      }
    });
  } catch (error) {
    console.error('Public stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/stats/public-map
// @desc    Public-safe active incident pins for the landing-page map (no auth, no personal data)
// @access  Public
router.get('/public-map', async (req, res) => {
  try {
    const reports = await Report.find({
      status: { $in: ['REPORTED', 'VERIFIED', 'PRIORITIZED', 'ASSIGNED', 'DISPATCHED', 'RESPONDER_ACCEPTED', 'RESPONDER_ARRIVED'] },
      'location.lat': { $ne: null }
    })
      .select('type title severity priority location.lat location.lng createdAt')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      success: true,
      incidents: reports.map(r => ({
        id: r._id,
        type: r.type,
        title: r.title,
        severity: r.severity,
        priority: r.priority,
        lat: r.location?.lat,
        lng: r.location?.lng,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('Public map error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/stats/admin
// @desc    Control-room analytics dashboard data
// @access  Admin only
router.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      byCategory,
      bySeverity,
      byStatus,
      byPriority,
      overTime,
      avgResponse,
      avgResolution,
      resolutionRateAgg,
      responderPerf,
      feedbackAgg,
      totals
    ] = await Promise.all([
      // By emergency category
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // By severity
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      // By lifecycle status
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // By priority
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      // Reports per day (for trend chart)
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Avg response time: report created → verified
      Report.aggregate([
        { $match: { createdAt: { $gte: since }, verifiedAt: { $ne: null } } },
        { $project: { ms: { $subtract: ['$verifiedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$ms' } } }
      ]),
      // Avg resolution time
      Report.aggregate([
        { $match: { createdAt: { $gte: since }, resolvedAt: { $ne: null } } },
        { $project: { ms: { $subtract: ['$resolvedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$ms' } } }
      ]),
      // Resolution rate
      Report.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $in: ['$status', ['RESOLVED', 'CLOSED']] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
            withdrawn: { $sum: { $cond: [{ $eq: ['$status', 'WITHDRAWN'] }, 1, 0] } }
          }
        }
      ]),
      // Responder performance leaderboard
      Responder.aggregate([
        { $match: { active: true } },
        {
          $lookup: {
            from: 'reports',
            localField: 'user',
            foreignField: 'assignedResponder',
            pipeline: [
              { $match: { status: { $in: ['RESOLVED', 'CLOSED'] } } },
              { $project: { ms: { $subtract: ['$resolvedAt', '$assignedAt'] } } }
            ],
            as: 'resolved'
          }
        },
        {
          $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' }
        },
        {
          $project: {
            name: { $arrayElemAt: ['$userDoc.name', 0] },
            specialization: 1,
            availability: 1,
            avgRating: '$stats.avgRating',
            ratingCount: '$stats.ratingCount',
            resolvedCount: '$stats.resolvedCount',
            resolvedViaReports: { $size: '$resolved' },
            avgResolutionMs: { $avg: '$resolved.ms' }
          }
        },
        { $sort: { resolvedViaReports: -1, avgRating: -1 } },
        { $limit: 10 }
      ]),
      // Feedback aggregates
      Feedback.aggregate([
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]),
      // Grand totals
      Promise.all([
        Report.countDocuments(),
        User.countDocuments(),
        Responder.countDocuments({ active: true }),
        Report.countDocuments({ createdAt: { $gte: since } })
      ])
    ]);

    const hours = ms => (ms ? Math.round((ms / (1000 * 60 * 60)) * 10) / 10 : 0);

    const rate = resolutionRateAgg[0] || { total: 0, resolved: 0, rejected: 0, withdrawn: 0 };
    const feedback = feedbackAgg[0] || { avg: 0, count: 0 };

    res.json({
      success: true,
      windowDays: days,
      stats: {
        byCategory,
        bySeverity,
        byStatus,
        byPriority,
        overTime,
        avgResponseHours: hours(avgResponse[0]?.avgMs),
        avgResolutionHours: hours(avgResolution[0]?.avgMs),
        resolutionRate: {
          ...rate,
          percent: rate.total ? Math.round((rate.resolved / rate.total) * 100) : 0
        },
        responderPerformance: responderPerf.map(r => ({
          ...r,
          avgResolutionHours: hours(r.avgResolutionMs),
          avgResolutionMs: undefined
        })),
        feedback: {
          average: Math.round((feedback.avg || 0) * 10) / 10,
          count: feedback.count
        },
        totals: {
          allReports: totals[0],
          users: totals[1],
          activeResponders: totals[2],
          reportsInWindow: totals[3]
        }
      }
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
