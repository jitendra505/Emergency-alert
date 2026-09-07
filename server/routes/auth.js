const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Responder = require('../models/Responder');
const { protect, generateToken, generateRefreshToken, hashToken } = require('../middleware/auth');
const { audit } = require('../utils/history');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

// Validation error handler
const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  return null;
};

// Issue access + refresh tokens and persist the hashed refresh token
async function issueTokens(res, req, user) {
  const token = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken();

  // Keep at most 5 sessions per user
  user.refreshTokens = [...(user.refreshTokens || []), hashToken(refreshToken)].slice(-5);
  await user.save();

  const payload = {
    success: true,
    token,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    }
  };

  // Attach responder profile when relevant
  if (user.role === 'responder') {
    const responder = await Responder.findOne({ user: user._id }).lean();
    payload.responder = responder || null;
  }
  return payload;
}

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters'),
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().trim()
], async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return validationError;

  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    // Create user (role is always 'user' — privilege escalation is impossible
    // because role is NOT accepted from the request body)
    const user = await User.create({ name, email, password, phone, role: 'user' });

    audit({ actor: user, action: 'REGISTER', target: user._id, targetKind: 'User', description: `New citizen registered: ${user.email}`, ip: req.ip });

    const payload = await issueTokens(res, req, user);
    res.status(201).json(payload);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user & return token
// @access  Public
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return validationError;

  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Deactivated accounts cannot log in
    if (user.active === false) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated. Contact an administrator.' });
    }

    audit({ actor: user, action: 'LOGIN', target: user._id, targetKind: 'User', description: `${user.role} logged in`, ip: req.ip });

    const payload = await issueTokens(res, req, user);
    res.json(payload);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// @route   POST /api/auth/refresh
// @desc    Exchange a refresh token for a new access token
// @access  Public (requires valid refresh token)
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }
    const hashed = hashToken(refreshToken);
    const user = await User.findOne({ refreshTokens: hashed }).select('+password');
    if (!user || user.active === false) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    const token = generateToken(user._id, user.role);
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/logout
// @desc    Secure logout — invalidates the refresh token server-side
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      req.user.refreshTokens = (req.user.refreshTokens || []).filter(t => t !== hashed);
      await User.findByIdAndUpdate(req.user._id, { refreshTokens: req.user.refreshTokens });
    }
    audit({ actor: req.user, action: 'LOGOUT', target: req.user._id, targetKind: 'User', description: `${req.user.role} logged out`, ip: req.ip });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request a password reset link (token returned in dev for demo)
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail()
], async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return validationError;

  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond the same way (no account enumeration)
    const generic = { success: true, message: 'If that account exists, a reset link has been sent.' };
    if (!user) return res.json(generic);

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(resetToken);
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: '🔐 Password Reset — Emergency Alert System',
      html: `<p>Hello ${user.name},</p><p>Click the link below to reset your password (valid 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`
    });

    // In development (no SMTP configured) return the token so the demo works
    const devToken = process.env.EMAIL_USER ? undefined : resetToken;
    res.json({ ...generic, ...(devToken ? { resetToken: devToken, resetUrl } : {}) });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using a valid token
// @access  Public
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const validationError = handleValidation(req, res);
  if (validationError) return validationError;

  try {
    const { token, password } = req.body;
    const hashed = hashToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.refreshTokens = []; // force re-login everywhere
    await user.save();

    audit({ actor: user, action: 'PASSWORD_RESET', target: user._id, targetKind: 'User', description: 'Password reset via email token', ip: req.ip });

    res.json({ success: true, message: 'Password has been reset. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  const payload = {
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      phone: req.user.phone,
      createdAt: req.user.createdAt
    }
  };
  if (req.user.role === 'responder') {
    payload.responder = await Responder.findOne({ user: req.user._id }).lean();
  }
  res.json(payload);
});

// @route   PUT /api/auth/profile
// @desc    Update user profile (name, phone, password)
// @access  Private
router.put('/profile', protect, [
  body('name').optional().trim().isLength({ max: 50 }),
  body('phone').optional().trim(),
  body('newPassword').optional().isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    // Handle password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new password' });
      }
      // Verify current password
      const userWithPass = await User.findById(req.user._id).select('+password');
      const isMatch = await userWithPass.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }
      // Set new password (will be hashed by pre-save hook)
      userWithPass.name = name || userWithPass.name;
      if (phone !== undefined) userWithPass.phone = phone;
      userWithPass.password = newPassword;
      await userWithPass.save();

      return res.json({
        success: true,
        user: {
          id: userWithPass._id,
          name: userWithPass.name,
          email: userWithPass.email,
          role: userWithPass.role,
          phone: userWithPass.phone
        }
      });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updateData, { returnDocument: 'after' });
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
