const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Strip password and platform access tokens before sending a user to the client
const publicUser = (user) => ({
  id:        user._id,
  name:      user.name,
  email:     user.email,
  plan:      user.plan,
  avatar:    user.avatar,
  platforms: Object.fromEntries(
    Object.entries(user.toObject().platforms || {})
      .map(([name, p]) => [name, Boolean(p && p.accessToken)])
  ),
  postsThisMonth: user.postsThisMonth,
});

// ── POST /api/auth/register ─────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const user = await User.create({ name, email, password });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ── PUT /api/auth/password ──────────────────────────────────────
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
