const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true, maxlength: 2200 },
  mediaUrls: [{ type: String }],

  // Which platforms to publish to
  platforms: [{
    type: String,
    enum: ['instagram', 'facebook', 'twitter', 'linkedin']
  }],

  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'],
    default: 'draft'
  },

  scheduledAt: { type: Date },   // null = publish immediately
  publishedAt: { type: Date },

  // Per-platform results after publishing
  results: [{
    platform:  String,
    postId:    String,          // the ID from that platform
    url:       String,          // link to the live post
    status:    String,          // 'success' | 'failed'
    error:     String,
    publishedAt: Date,
  }],

  // Engagement stats (updated by analytics sync job)
  analytics: {
    likes:    { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares:   { type: Number, default: 0 },
    reach:    { type: Number, default: 0 },
  },

}, { timestamps: true });

// Index for the scheduler: find all scheduled posts due now
postSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Post', postSchema);
