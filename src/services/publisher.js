/**
 * publisher.js — sends posts to each social platform
 * Each platform function returns { platform, status, postId, url, error }
 */
const axios = require('axios');

// ── Instagram (via Meta Graph API) ──────────────────────────────
async function publishToInstagram(post, user) {
  const { accessToken, userId } = user.platforms?.instagram || {};
  if (!accessToken) return { platform: 'instagram', status: 'failed', error: 'Not connected' };

  try {
    // Step 1: create a media container
    const mediaRes = await axios.post(
      `https://graph.facebook.com/v18.0/${userId}/media`,
      { caption: post.text, access_token: accessToken,
        ...(post.mediaUrls[0] ? { image_url: post.mediaUrls[0] } : {}) }
    );

    // Step 2: publish the container
    const publishRes = await axios.post(
      `https://graph.facebook.com/v18.0/${userId}/media_publish`,
      { creation_id: mediaRes.data.id, access_token: accessToken }
    );

    return {
      platform: 'instagram', status: 'success',
      postId: publishRes.data.id,
      url: `https://instagram.com/p/${publishRes.data.id}`,
    };
  } catch (err) {
    return { platform: 'instagram', status: 'failed', error: err.response?.data?.error?.message || err.message };
  }
}

// ── Facebook (via Meta Graph API) ───────────────────────────────
async function publishToFacebook(post, user) {
  const { accessToken, pageId } = user.platforms?.facebook || {};
  if (!accessToken) return { platform: 'facebook', status: 'failed', error: 'Not connected' };

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}/feed`,
      { message: post.text, access_token: accessToken }
    );
    return {
      platform: 'facebook', status: 'success',
      postId: res.data.id,
      url: `https://facebook.com/${res.data.id}`,
    };
  } catch (err) {
    return { platform: 'facebook', status: 'failed', error: err.response?.data?.error?.message || err.message };
  }
}

// ── Twitter / X (OAuth 2.0) ──────────────────────────────────────
async function publishToTwitter(post, user) {
  const { accessToken } = user.platforms?.twitter || {};
  if (!accessToken) return { platform: 'twitter', status: 'failed', error: 'Not connected' };

  try {
    const res = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: post.text.slice(0, 280) },  // free tier: 280 char limit
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    return {
      platform: 'twitter', status: 'success',
      postId: res.data.data.id,
      url: `https://twitter.com/i/web/status/${res.data.data.id}`,
    };
  } catch (err) {
    return { platform: 'twitter', status: 'failed', error: err.response?.data?.detail || err.message };
  }
}

// ── LinkedIn ─────────────────────────────────────────────────────
async function publishToLinkedIn(post, user) {
  const { accessToken, userId } = user.platforms?.linkedin || {};
  if (!accessToken) return { platform: 'linkedin', status: 'failed', error: 'Not connected' };

  try {
    const res = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post.text },
            shareMediaCategory: 'NONE',
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    return {
      platform: 'linkedin', status: 'success',
      postId: res.data.id,
      url: `https://linkedin.com/feed/update/${res.data.id}`,
    };
  } catch (err) {
    return { platform: 'linkedin', status: 'failed', error: err.response?.data?.message || err.message };
  }
}

// ── Main publish function ─────────────────────────────────────────
const handlers = {
  instagram: publishToInstagram,
  facebook:  publishToFacebook,
  twitter:   publishToTwitter,
  linkedin:  publishToLinkedIn,
};

async function publishPost(post, user) {
  const promises = post.platforms.map(platform => {
    const fn = handlers[platform];
    return fn ? fn(post, user) : Promise.resolve({ platform, status: 'failed', error: 'Unsupported' });
  });
  return Promise.all(promises);
}

module.exports = { publishPost };
