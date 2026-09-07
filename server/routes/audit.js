const express = require('express');
const AuditLog = require('../models/AuditLog');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route  GET /api/audit
// @desc   Admin: audit trail with filters
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action.toUpperCase();
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.targetId) filter['target.id'] = req.query.targetId;
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ description: rx }, { actorName: rx }, { action: rx }];
    }

    const [logs, total, actions] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action')
    ]);

    res.json({
      success: true,
      logs,
      actions: actions.sort(),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
