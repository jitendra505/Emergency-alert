const express = require('express');
const { query, validationResult } = require('express-validator');
const User = require('../models/User');
const Report = require('../models/Report');
const { protect, adminOnly } = require('../middleware/auth');
const { audit } = require('../utils/history');

const router = express.Router();

// @route  GET /api/users
// @desc   Admin: list users with report counts + filters
router.get('/', protect, adminOnly, [
  query('role').optional().isIn(['user', 'admin', 'responder']),
  query('search').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [users, total, reportCounts] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-password -refreshTokens -resetPasswordToken').lean(),
      User.countDocuments(filter),
      Report.aggregate([{ $group: { _id: '$user', count: { $sum: 1 } } }])
    ]);

    const countMap = {};
    reportCounts.forEach(r => { countMap[r._id ? r._id.toString() : ''] = r.count; });

    const enriched = users.map(u => ({ ...u, reportCount: countMap[u._id.toString()] || 0 }));

    res.json({
      success: true,
      users: enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  PATCH /api/users/:id/activate
// @desc   Admin: enable an account
router.patch('/:id/activate', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.active = true;
    await user.save();

    audit({ actor: req.user, action: 'USER_ACTIVATED', target: user._id, targetKind: 'User', description: `Activated ${user.email}`, ip: req.ip });
    res.json({ success: true, message: 'Account activated' });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route  PATCH /api/users/:id/deactivate
// @desc   Admin: disable an account (cannot deactivate yourself or other admins)
router.patch('/:id/deactivate', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin accounts cannot be deactivated' });
    }

    user.active = false;
    user.refreshTokens = []; // kill sessions
    await user.save();

    audit({ actor: req.user, action: 'USER_DEACTIVATED', target: user._id, targetKind: 'User', description: `Deactivated ${user.email}`, ip: req.ip });
    res.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
