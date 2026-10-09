const express = require('express');
const Post    = require('../models/Post');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// ── GET /api/analytics/overview ─────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user._id;

    const [totalPosts, publishedPosts, scheduledPosts] = await Promise.all([
      Post.countDocuments({ user: userId }),
      Post.countDocuments({ user: userId, status: 'published' }),
      Post.countDocuments({ user: userId, status: 'scheduled' }),
    ]);

    // Total engagement from all published posts
    const engagementAgg = await Post.aggregate([
      { $match: { user: userId, status: 'published' } },
      { $group: {
        _id: null,
        likes:    { $sum: '$analytics.likes' },
        comments: { $sum: '$analytics.comments' },
        shares:   { $sum: '$analytics.shares' },
        reach:    { $sum: '$analytics.reach' },
      }}
    ]);

    const engagement = engagementAgg[0] || { likes: 0, comments: 0, shares: 0, reach: 0 };

    res.json({ totalPosts, publishedPosts, scheduledPosts, engagement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/by-platform ──────────────────────────────
router.get('/by-platform', async (req, res) => {
  try {
    const results = await Post.aggregate([
      { $match: { user: req.user._id, status: 'published' } },
      { $unwind: '$results' },
      { $match: { 'results.status': 'success' } },
      { $group: {
        _id: '$results.platform',
        posts:    { $sum: 1 },
        likes:    { $sum: '$analytics.likes' },
        reach:    { $sum: '$analytics.reach' },
      }},
      { $sort: { posts: -1 } }
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/top-posts ────────────────────────────────
router.get('/top-posts', async (req, res) => {
  try {
    const posts = await Post.find({ user: req.user._id, status: 'published' })
      .sort({ 'analytics.likes': -1 })
      .limit(5)
      .select('text platforms analytics publishedAt');
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
