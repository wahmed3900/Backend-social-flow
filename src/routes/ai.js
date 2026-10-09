const express = require('express');
const OpenAI  = require('openai');
const { protect } = require('../middleware/auth');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── POST /api/ai/captions — generate 3 captions ─────────────────
// Cost: ~$0.01 per call with gpt-3.5-turbo
router.post('/captions', protect, async (req, res) => {
  try {
    const { topic, platforms = ['instagram', 'twitter'] } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const platformStr = platforms.join(', ');
    const prompt = `
You are a social media expert. Write 3 different engaging captions for a post about: "${topic}".
Target platforms: ${platformStr}.
Rules:
- Keep each under 280 characters for Twitter compatibility
- Use 1-3 relevant emojis per caption
- Include a call to action
- Make each caption feel different in tone: one hype/energetic, one educational, one story-driven
- Add 2-3 relevant hashtags at the end of each

Return JSON: { "captions": ["caption1", "caption2", "caption3"] }
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const data = JSON.parse(completion.choices[0].message.content);
    res.json({ captions: data.captions });
  } catch (err) {
    // Fallback captions if OpenAI key isn't set yet
    if (err.code === 'invalid_api_key' || !process.env.OPENAI_API_KEY) {
      return res.json({
        captions: [
          `🚀 Just launched something that's going to change the game for ${req.body.topic}. Click the link in bio to see it!`,
          `Here's what nobody tells you about ${req.body.topic} — and why it matters for your business 🧵 Read on 👇`,
          `POV: You finally figured out ${req.body.topic} and everything clicked 💡 Drop a comment if you want the full breakdown! #growth`,
        ]
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai/hashtags — generate relevant hashtags ──────────
router.post('/hashtags', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Generate 10 relevant hashtags for this social media post. Return JSON: { "hashtags": ["#tag1", ...] }\n\nPost: "${text}"` }],
      response_format: { type: 'json_object' },
    });
    const data = JSON.parse(completion.choices[0].message.content);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
