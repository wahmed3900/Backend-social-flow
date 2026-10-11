/**
 * seed.js — populates the DB with a demo user and sample posts
 * Run: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');
const Post     = require('../models/Post');
const connectDB = require('./db');

const DEMO_EMAIL    = 'demo@socialflow.app';
const DEMO_PASSWORD = 'Demo1234!';

async function seed() {
  await connectDB();
  console.log('🌱 Seeding database…');

  // Remove existing demo data
  await User.deleteOne({ email: DEMO_EMAIL });

  const user = await User.create({
    name:     'Demo User',
    email:    DEMO_EMAIL,
    password: DEMO_PASSWORD,
    plan:     'creator',
  });
  console.log(`✓ Created user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // Sample published posts with fake analytics
  const samplePosts = [
    {
      text: '🚀 Excited to share our biggest product update yet! New features dropping this week — stay tuned! #ProductLaunch #Startup #Tech',
      platforms: ['instagram', 'twitter', 'linkedin'],
      status: 'published',
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      results: [
        { platform: 'instagram', status: 'success', postId: 'fake_ig_1', url: 'https://instagram.com/p/fake1' },
        { platform: 'twitter',   status: 'success', postId: 'fake_tw_1', url: 'https://twitter.com/i/web/status/fake1' },
        { platform: 'linkedin',  status: 'success', postId: 'fake_li_1', url: 'https://linkedin.com/feed/update/fake1' },
      ],
      analytics: { likes: 312, comments: 47, shares: 89, reach: 4200 },
    },
    {
      text: "Here's what nobody tells you about growing on social media 🧵 Thread below 👇 #GrowthHacking #SocialMedia",
      platforms: ['twitter', 'linkedin'],
      status: 'published',
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      results: [
        { platform: 'twitter',  status: 'success', postId: 'fake_tw_2', url: 'https://twitter.com/i/web/status/fake2' },
        { platform: 'linkedin', status: 'success', postId: 'fake_li_2', url: 'https://linkedin.com/feed/update/fake2' },
      ],
      analytics: { likes: 198, comments: 62, shares: 134, reach: 3100 },
    },
    {
      text: 'POV: You finally figured out content scheduling and everything clicked 💡 Drop a comment if you want the full breakdown! #ContentCreator #Marketing',
      platforms: ['instagram', 'facebook'],
      status: 'published',
      publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      results: [
        { platform: 'instagram', status: 'success', postId: 'fake_ig_3', url: 'https://instagram.com/p/fake3' },
        { platform: 'facebook',  status: 'success', postId: 'fake_fb_3', url: 'https://facebook.com/fake3' },
      ],
      analytics: { likes: 445, comments: 93, shares: 67, reach: 6800 },
    },
    {
      text: '✨ Behind the scenes look at how we build in public. Transparency is our competitive advantage. #BuildInPublic #Startup',
      platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    },
    {
      text: 'Draft: Q4 campaign kickoff — something big is coming. Working on the final copy…',
      platforms: ['instagram', 'linkedin'],
      status: 'draft',
    },
  ];

  const posts = await Post.insertMany(
    samplePosts.map(p => ({ ...p, user: user._id }))
  );
  console.log(`✓ Created ${posts.length} sample posts`);

  console.log('\n✅ Seed complete!\n');
  console.log('  Login at POST /api/auth/login');
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
