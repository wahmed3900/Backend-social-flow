const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  plan:     { type: String, enum: ['free', 'creator', 'pro'], default: 'free' },
  avatar:   { type: String, default: '' },

  // Connected social platforms
  platforms: {
    instagram: { accessToken: String, userId: String, username: String },
    facebook:  { accessToken: String, pageId: String, pageName: String },
    twitter:   { accessToken: String, accessSecret: String, userId: String, username: String },
    linkedin:  { accessToken: String, userId: String, name: String },
  },

  // Usage tracking for free plan limits
  postsThisMonth: { type: Number, default: 0 },
  monthResetDate: { type: Date, default: () => new Date() },

}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Plan limits helper
userSchema.methods.canPost = function () {
  const limits = { free: 10, creator: Infinity, pro: Infinity };
  return this.postsThisMonth < limits[this.plan];
};

userSchema.methods.platformLimit = function () {
  return { free: 3, creator: 6, pro: Infinity }[this.plan];
};

module.exports = mongoose.model('User', userSchema);
