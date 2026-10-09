/**
 * platforms.js — OAuth connect / disconnect routes for each social platform
 *
 * Flow for each platform:
 *   1. GET /api/platforms/:platform/connect  → redirect to provider OAuth page
 *   2. GET /api/platforms/:platform/callback → exchange code, save tokens, redirect to frontend
 *   3. DELETE /api/platforms/:platform       → remove tokens from user doc
 *   4. GET /api/platforms                    → list connected platforms for current user
 */
const express = require('express');
const axios   = require('axios');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();
// Note: `protect` is applied per-route — the OAuth callbacks are hit by the
// provider's redirect, which carries no JWT.

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// A browser navigation can't send the Authorization header, so the frontend
// calls /connect via fetch with `?json=1` and navigates to the returned URL.
const sendAuthUrl = (req, res, url) =>
  req.query.json ? res.json({ url }) : res.redirect(url);

// ─────────────────────────────────────────────────────────
// GET /api/platforms — list connected platforms
// ─────────────────────────────────────────────────────────
router.get('/', protect, (req, res) => {
  const { platforms } = req.user;
  const connected = Object.entries(platforms || {})
    .filter(([, v]) => v?.accessToken)
    .map(([platform]) => platform);
  res.json({ connected });
});

// ══════════════════════════════════════════════════════════
// META (Instagram + Facebook share the same OAuth app)
// ══════════════════════════════════════════════════════════

// GET /api/platforms/instagram/connect
router.get('/instagram/connect', protect, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID,
    redirect_uri:  process.env.META_REDIRECT_URI,
    scope:         'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
    response_type: 'code',
    state:         `instagram|${req.user._id}`,
  });
  sendAuthUrl(req, res, `https://www.facebook.com/v18.0/dialog/oauth?${params}`);
});

// GET /api/platforms/facebook/connect
router.get('/facebook/connect', protect, (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID,
    redirect_uri:  process.env.META_REDIRECT_URI,
    scope:         'pages_manage_posts,pages_read_engagement,pages_show_list',
    response_type: 'code',
    state:         `facebook|${req.user._id}`,
  });
  sendAuthUrl(req, res, `https://www.facebook.com/v18.0/dialog/oauth?${params}`);
});

// GET /api/platforms/meta/callback  (shared callback for IG + FB)
router.get('/meta/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/connectors?error=meta_denied`);

  const [platform, userId] = (state || '').split('|');
  if (!platform || !userId) return res.redirect(`${CLIENT_URL}/connectors?error=invalid_state`);

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri:  process.env.META_REDIRECT_URI,
        code,
      },
    });
    const shortToken = tokenRes.data.access_token;

    // Exchange for long-lived token (~60 days)
    const longRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         process.env.META_APP_ID,
        client_secret:     process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
    const longToken = longRes.data.access_token;

    if (platform === 'instagram') {
      // Get connected Instagram Business account via Pages
      const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: longToken },
      });
      const page = pagesRes.data.data?.[0];
      if (!page) throw new Error('No Facebook Page found — required for Instagram Business');

      const igRes = await axios.get(`https://graph.facebook.com/v18.0/${page.id}`, {
        params: { fields: 'instagram_business_account', access_token: longToken },
      });
      const igId = igRes.data.instagram_business_account?.id;
      if (!igId) throw new Error('No Instagram Business account linked to this Page');

      await User.findByIdAndUpdate(userId, {
        'platforms.instagram.accessToken': longToken,
        'platforms.instagram.userId':      igId,
      });
    } else {
      // Facebook — grab the first Page and its page-scoped token
      const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: longToken },
      });
      const page = pagesRes.data.data?.[0];
      if (!page) throw new Error('No Facebook Page found');

      await User.findByIdAndUpdate(userId, {
        'platforms.facebook.accessToken': page.access_token, // page token never expires
        'platforms.facebook.pageId':      page.id,
      });
    }

    res.redirect(`${CLIENT_URL}/connectors?connected=${platform}`);
  } catch (err) {
    console.error(`[OAuth] Meta ${platform} error:`, err.message);
    res.redirect(`${CLIENT_URL}/connectors?error=${platform}_failed`);
  }
});

// ══════════════════════════════════════════════════════════
// TWITTER / X  (OAuth 2.0 PKCE)
// ══════════════════════════════════════════════════════════

// Simple in-memory store for PKCE verifiers (use Redis in production)
const pkceStore = new Map();

router.get('/twitter/connect', protect, (req, res) => {
  // Generate a random code verifier (43–128 chars, URL-safe)
  const verifier = Buffer.from(require('crypto').randomBytes(32)).toString('base64url');
  pkceStore.set(String(req.user._id), verifier);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             process.env.TWITTER_CLIENT_ID,
    redirect_uri:          process.env.TWITTER_REDIRECT_URI,
    scope:                 'tweet.read tweet.write users.read offline.access',
    state:                 String(req.user._id),
    code_challenge:        verifier, // S256 in production; plain is fine for dev
    code_challenge_method: 'plain',
  });
  sendAuthUrl(req, res, `https://twitter.com/i/oauth2/authorize?${params}`);
});

router.get('/twitter/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/connectors?error=twitter_denied`);

  const verifier = pkceStore.get(state);
  pkceStore.delete(state);
  if (!verifier) return res.redirect(`${CLIENT_URL}/connectors?error=twitter_state_mismatch`);

  try {
    const tokenRes = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        code,
        grant_type:    'authorization_code',
        redirect_uri:  process.env.TWITTER_REDIRECT_URI,
        code_verifier: verifier,
      }),
      {
        auth: {
          username: process.env.TWITTER_CLIENT_ID,
          password: process.env.TWITTER_CLIENT_SECRET,
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token, refresh_token } = tokenRes.data;

    // Get the authenticated user's Twitter ID
    const meRes = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    await User.findByIdAndUpdate(state, {
      'platforms.twitter.accessToken':  access_token,
      'platforms.twitter.refreshToken': refresh_token,
      'platforms.twitter.userId':       meRes.data.data.id,
    });

    res.redirect(`${CLIENT_URL}/connectors?connected=twitter`);
  } catch (err) {
    console.error('[OAuth] Twitter error:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}/connectors?error=twitter_failed`);
  }
});

// ══════════════════════════════════════════════════════════
// LINKEDIN  (OAuth 2.0)
// ══════════════════════════════════════════════════════════

router.get('/linkedin/connect', protect, (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    scope:         'r_liteprofile w_member_social',
    state:         String(req.user._id),
  });
  sendAuthUrl(req, res, `https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

router.get('/linkedin/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/connectors?error=linkedin_denied`);

  try {
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
        client_id:     process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // Get LinkedIn member ID
    const meRes = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    await User.findByIdAndUpdate(state, {
      'platforms.linkedin.accessToken': access_token,
      'platforms.linkedin.userId':      meRes.data.id,
    });

    res.redirect(`${CLIENT_URL}/connectors?connected=linkedin`);
  } catch (err) {
    console.error('[OAuth] LinkedIn error:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}/connectors?error=linkedin_failed`);
  }
});

// ══════════════════════════════════════════════════════════
// DISCONNECT — DELETE /api/platforms/:platform
// ══════════════════════════════════════════════════════════
router.delete('/:platform', protect, async (req, res) => {
  const { platform } = req.params;
  const allowed = ['instagram', 'facebook', 'twitter', 'linkedin'];
  if (!allowed.includes(platform))
    return res.status(400).json({ error: 'Unknown platform' });

  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { [`platforms.${platform}`]: '' },
    });
    res.json({ message: `${platform} disconnected` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
