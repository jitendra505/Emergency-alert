const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password -refreshTokens');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (req.user.active === false) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated. Contact an administrator.' });
    }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
  }
};

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
};

// Responder-only middleware
const responderOnly = (req, res, next) => {
  if (req.user && req.user.role === 'responder') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Responder access required' });
  }
};

// Any staff member (admin or responder)
const staffOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'responder')) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Staff access required' });
  }
};

// Generate JWT access token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Generate a refresh token (opaque random string, stored hashed on the user)
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = { protect, adminOnly, responderOnly, staffOnly, generateToken, generateRefreshToken, hashToken };
