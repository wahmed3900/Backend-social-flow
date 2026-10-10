const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes — verifies JWT and attaches user to req
const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorised — no token' });
  }
  try {
    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Check plan limits before allowing a post
const checkPlanLimit = (req, res, next) => {
  if (!req.user.canPost()) {
    return res.status(403).json({
      error: 'Monthly post limit reached. Upgrade to Creator for unlimited posts.',
      plan: req.user.plan,
    });
  }
  next();
};

module.exports = { protect, checkPlanLimit };
