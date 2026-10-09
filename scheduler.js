/**
 * scheduler.js — publishes posts whose scheduledAt time has passed
 * Runs every minute via node-cron
 */
const cron    = require('node-cron');
const Post    = require('../models/Post');
const User    = require('../models/User');
const publisher = require('./publisher');

let task = null;

async function processScheduledPosts() {
  try {
    const now = new Date();

    // Find all posts scheduled for now or earlier that are still pending
    const duePosts = await Post.find({
      status: 'scheduled',
      scheduledAt: { $lte: now },
    });

    if (duePosts.length === 0) return;

    console.log(`[Scheduler] Found ${duePosts.length} post(s) to publish`);

    for (const post of duePosts) {
      try {
        // Mark as publishing to prevent double-fire
        post.status = 'publishing';
        await post.save();

        const user = await User.findById(post.user);
        if (!user) {
          post.status = 'failed';
          post.results = [{ platform: 'all', status: 'failed', error: 'User not found' }];
          await post.save();
          continue;
        }

        // Check plan limit before publishing
        if (!user.canPost()) {
          post.status = 'failed';
          post.results = [{ platform: 'all', status: 'failed', error: 'Monthly post limit reached' }];
          await post.save();
          continue;
        }

        const results = await publisher.publishPost(post, user);

        post.status      = results.every(r => r.status === 'success') ? 'published' : 'failed';
        post.results     = results;
        post.publishedAt = new Date();
        await post.save();

        // Increment monthly post counter
        await User.findByIdAndUpdate(post.user, { $inc: { postsThisMonth: 1 } });

        const succeeded = results.filter(r => r.status === 'success').map(r => r.platform);
        const failed    = results.filter(r => r.status !== 'success').map(r => r.platform);
        console.log(`[Scheduler] Post ${post._id} → ✓ ${succeeded.join(', ')} ${failed.length ? '✗ ' + failed.join(', ') : ''}`);
      } catch (postErr) {
        console.error(`[Scheduler] Error publishing post ${post._id}:`, postErr.message);
        post.status = 'failed';
        post.results = [{ platform: 'all', status: 'failed', error: postErr.message }];
        await post.save();
      }
    }
  } catch (err) {
    console.error('[Scheduler] Unexpected error:', err.message);
  }
}

/**
 * Reset postsThisMonth for all users at the start of each month.
 * Runs at 00:00 on the 1st of every month.
 */
async function resetMonthlyCounters() {
  try {
    const result = await User.updateMany({}, { $set: { postsThisMonth: 0, monthResetDate: new Date() } });
    console.log(`[Scheduler] Monthly counters reset for ${result.modifiedCount} users`);
  } catch (err) {
    console.error('[Scheduler] Error resetting monthly counters:', err.message);
  }
}

function start() {
  if (task) return; // already running

  // Check for due posts every minute
  task = cron.schedule('* * * * *', processScheduledPosts, { timezone: 'UTC' });

  // Reset monthly post counters on the 1st of each month at midnight UTC
  cron.schedule('0 0 1 * *', resetMonthlyCounters, { timezone: 'UTC' });

  console.log('[Scheduler] Started — checking for due posts every minute');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[Scheduler] Stopped');
  }
}

module.exports = { start, stop, processScheduledPosts };
