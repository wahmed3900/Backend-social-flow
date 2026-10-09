const express   = require('express');
const Post      = require('../models/Post');
const User      = require('../models/User');
const { protect, checkPlanLimit } = require('../middleware/auth');
const publisher = require('../services/publisher');

const router = express.Router();

// All post routes require auth
router.use(protect);

// ── GET /api/posts — list user's posts ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, platform, page = 1, limit = 20 } = req.query;
    const filter = { user: req.user._id };
    if (status)   filter.status   = status;
    if (platform) filter.platforms = platform;

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Post.countDocuments(filter);
    res.json({ posts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/posts — create a post (draft or scheduled) ────────
router.post('/', checkPlanLimit, async (req, res) => {
  try {
    const { text, platforms, scheduledAt, mediaUrls = [] } = req.body;
    if (!text)      return res.status(400).json({ error: 'Text is required' });
    if (!platforms?.length) return res.status(400).json({ error: 'Pick at least one platform' });

    const status = scheduledAt ? 'scheduled' : 'draft';
    const post   = await Post.create({
      user: req.user._id, text, platforms, mediaUrls, status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/posts/:id/publish — publish now ───────────────────
router.post('/:id/publish', checkPlanLimit, async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, user: req.user._id });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published') return res.status(400).json({ error: 'Already published' });

    const user    = await User.findById(req.user._id);
    const results = await publisher.publishPost(post, user);

    post.status      = results.every(r => r.status === 'success') ? 'published' : 'failed';
    post.results     = results;
    post.publishedAt = new Date();
    await post.save();

    // Increment monthly counter
    await User.findByIdAndUpdate(req.user._id, { $inc: { postsThisMonth: 1 } });

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/posts/:id — update a draft/scheduled post ──────────
router.put('/:id', async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, user: req.user._id });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published') return res.status(400).json({ error: 'Cannot edit a published post' });

    const { text, platforms, scheduledAt, mediaUrls } = req.body;
    if (text)        post.text        = text;
    if (platforms)   post.platforms   = platforms;
    if (mediaUrls)   post.mediaUrls   = mediaUrls;
    if (scheduledAt) { post.scheduledAt = new Date(scheduledAt); post.status = 'scheduled'; }

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/posts/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const post = await Post.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
