const express = require('express');
const OpenAI  = require('openai');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
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

// ── Edge TTS (free Microsoft Edge neural voices, no API key) ───
const DEFAULT_VOICE   = process.env.TTS_DEFAULT_VOICE || 'en-US-AriaNeural';
const MAX_TTS_CHARS   = 5000;
const VOICE_RE        = /^[a-z]{2,3}-[A-Za-z]{2,4}(-[A-Za-z]+)?-[A-Za-z]+Neural$/;
const PROSODY_KEYWORD = /^(x-slow|slow|medium|fast|x-fast|x-low|low|high|x-high|silent|x-soft|soft|loud|x-loud|default)$/;
const PROSODY_RELATIVE = /^[+-]\d{1,3}(%|Hz)$/;

const escapeXml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const validProsody = (v) => v === undefined || PROSODY_KEYWORD.test(v) || PROSODY_RELATIVE.test(v);

let voicesCache = null;

// ── GET /api/ai/voices — list Edge TTS voices (?locale=en-US) ───
router.get('/voices', protect, async (req, res) => {
  try {
    if (!voicesCache) {
      const tts = new MsEdgeTTS();
      voicesCache = (await tts.getVoices()).map(v => ({
        name: v.ShortName, gender: v.Gender, locale: v.Locale, friendlyName: v.FriendlyName,
      }));
    }
    const { locale } = req.query;
    res.json({ voices: locale ? voicesCache.filter(v => v.locale === locale) : voicesCache });
  } catch (err) {
    res.status(502).json({ error: `Could not fetch voices: ${err.message}` });
  }
});

// ── POST /api/ai/tts — synthesise speech, returns audio/mpeg ────
// Body: { text, voice?, rate? ("+10%"), pitch? ("-5Hz"), volume? }
router.post('/tts', protect, async (req, res) => {
  const { text, voice = DEFAULT_VOICE, rate, pitch, volume } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (text.length > MAX_TTS_CHARS) {
    return res.status(400).json({ error: `Text must be at most ${MAX_TTS_CHARS} characters` });
  }
  if (!VOICE_RE.test(voice)) {
    return res.status(400).json({ error: 'Invalid voice name (e.g. en-US-AriaNeural)' });
  }
  if (![rate, pitch, volume].every(validProsody)) {
    return res.status(400).json({ error: 'rate/pitch/volume must be a keyword (e.g. "fast") or relative value (e.g. "+10%", "-5Hz")' });
  }

  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), { rate, pitch, volume });

    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', c => chunks.push(c));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    const audio = Buffer.concat(chunks);
    if (!audio.length) return res.status(502).json({ error: 'TTS service returned no audio' });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Content-Disposition': 'inline; filename="speech.mp3"',
    });
    res.send(audio);
  } catch (err) {
    res.status(502).json({ error: `TTS failed: ${err.message}` });
  } finally {
    tts.close();
  }
});

module.exports = router;
