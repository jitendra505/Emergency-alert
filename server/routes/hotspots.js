const express = require('express');
const Report = require('../models/Report');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route  GET /api/hotspots
// @desc   Admin: geographic incident density clusters (grid-based)
// @query  ?days=30&minCount=2
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const minCount = Math.max(parseInt(req.query.minCount) || 2, 1);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Grid size ~0.01° ≈ 1.1 km
    const hotspots = await Report.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          'location.lat': { $ne: null },
          'location.lng': { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            lat: { $round: [{ $divide: [{ $trunc: [{ $multiply: ['$location.lat', 100] }] }, 100] }, 2] },
            lng: { $round: [{ $divide: [{ $trunc: [{ $multiply: ['$location.lng', 100] }] }, 100] }, 2] }
          },
          count: { $sum: 1 },
          types: { $addToSet: '$type' },
          severities: { $addToSet: '$severity' },
          maxPriority: { $max: '$priorityScore' },
          avgPriorityScore: { $avg: '$priorityScore' },
          titles: { $push: '$title' }
        }
      },
      { $match: { count: { $gte: minCount } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    // Severity distribution per hotspot
    const severityCounts = await Report.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          'location.lat': { $ne: null },
          'location.lng': { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            lat: { $round: [{ $divide: [{ $trunc: [{ $multiply: ['$location.lat', 100] }] }, 100] }, 2] },
            lng: { $round: [{ $divide: [{ $trunc: [{ $multiply: ['$location.lng', 100] }] }, 100] }, 2] },
            severity: '$severity'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const severityMap = {};
    severityCounts.forEach(s => {
      const key = `${s._id.lat},${s._id.lng}`;
      severityMap[key] = severityMap[key] || {};
      severityMap[key][s._id.severity] = s.count;
    });

    const result = hotspots.map(h => ({
      lat: h._id.lat,
      lng: h._id.lng,
      count: h.count,
      types: h.types,
      severities: h.severities,
      severityBreakdown: severityMap[`${h._id.lat},${h._id.lng}`] || {},
      maxPriorityScore: Math.round(h.maxPriority || 0),
      avgPriorityScore: Math.round(h.avgPriorityScore || 0),
      sampleTitles: h.titles.slice(0, 3),
      // Intensity 0-1 for heatmap rendering
      intensity: Math.min(1, h.count / 10)
    }));

    res.json({ success: true, hotspots: result, windowDays: days, minCount });
  } catch (error) {
    console.error('Hotspots error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
