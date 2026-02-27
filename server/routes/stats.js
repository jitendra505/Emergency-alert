const express = require('express');
const Report = require('../models/Report');
const User = require('../models/User');

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
      Report.find({ status: 'Resolved' })
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
      { $match: { status: 'Resolved', resolvedAt: { $ne: null } } },
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

module.exports = router;
