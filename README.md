# SocialFlow Backend

Node.js + Express + MongoDB REST API that powers the SocialFlow social media management app.

## Features

- **JWT Auth** — register, login, password change
- **Multi-platform Publishing** — Instagram, Facebook, Twitter/X, LinkedIn
- **Post Scheduler** — cron job publishes posts automatically at their scheduled time
- **AI Captions** — GPT-3.5-turbo generates 3 caption variants per topic
- **Analytics** — per-platform engagement aggregations
- **Plan Limits** — Free (10 posts/mo), Creator (unlimited), Pro (unlimited + teams)
- **OAuth Flows** — connect/disconnect each social platform

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/atlas) — free tier works)

### 2. Install

```bash
cd socialflow-backend
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string or `mongodb://localhost:27017/socialflow` |
| `JWT_SECRET` | Any long random string (e.g. `openssl rand -hex 32`) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) — optional, fallback captions work without it |
| `META_APP_ID` / `META_APP_SECRET` | [developers.facebook.com](https://developers.facebook.com) |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` | [developer.twitter.com](https://developer.twitter.com) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | [linkedin.com/developers](https://www.linkedin.com/developers) |

### 4. (Optional) Seed demo data

```bash
npm run seed
```

Creates a `demo@socialflow.app` / `Demo1234!` account with sample posts.

### 5. Run

```bash
# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:5000` (or `PORT` from `.env`).

---

## API Reference

All protected routes require `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | Register & get JWT |
| POST | `/api/auth/login` | `{ email, password }` | Login & get JWT |
| GET  | `/api/auth/me` | — | Current user info |
| PUT  | `/api/auth/password` | `{ currentPassword, newPassword }` | Change password |

### Posts

| Method | Path | Description |
|---|---|---|
| GET    | `/api/posts` | List posts (`?status=draft&platform=twitter&page=1`) |
| POST   | `/api/posts` | Create post (`text`, `platforms[]`, `scheduledAt?`, `mediaUrls[]?`) |
| POST   | `/api/posts/:id/publish` | Publish immediately |
| PUT    | `/api/posts/:id` | Update draft/scheduled |
| DELETE | `/api/posts/:id` | Delete post |

### Platforms (OAuth)

| Method | Path | Description |
|---|---|---|
| GET    | `/api/platforms` | List connected platforms |
| GET    | `/api/platforms/instagram/connect` | Redirect to Meta OAuth |
| GET    | `/api/platforms/facebook/connect` | Redirect to Meta OAuth |
| GET    | `/api/platforms/meta/callback` | Meta OAuth callback (set as redirect URI in Meta app) |
| GET    | `/api/platforms/twitter/connect` | Redirect to Twitter OAuth |
| GET    | `/api/platforms/twitter/callback` | Twitter OAuth callback |
| GET    | `/api/platforms/linkedin/connect` | Redirect to LinkedIn OAuth |
| GET    | `/api/platforms/linkedin/callback` | LinkedIn OAuth callback |
| DELETE | `/api/platforms/:platform` | Disconnect a platform |

**OAuth redirect URIs to register in each developer portal:**

- Meta: `http://localhost:5000/api/platforms/meta/callback`
- Twitter: `http://localhost:5000/api/platforms/twitter/callback`
- LinkedIn: `http://localhost:5000/api/platforms/linkedin/callback`

### Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/overview` | Total posts + aggregate engagement |
| GET | `/api/analytics/by-platform` | Breakdown by platform |
| GET | `/api/analytics/top-posts` | Top 5 posts by likes |

### AI

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/ai/captions` | `{ topic, platforms[] }` | Generate 3 captions |
| POST | `/api/ai/hashtags` | `{ text }` | Generate 10 hashtags |

---

## Project Structure

```
socialflow-backend/
├── src/
│   ├── server.js              # Express app entry point
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── seed.js            # Demo data seeder
│   ├── middleware/
│   │   └── auth.js            # JWT protect + plan limit check
│   ├── models/
│   │   ├── User.js            # User schema (auth, platforms, plan)
│   │   └── Post.js            # Post schema (content, schedule, analytics)
│   ├── routes/
│   │   ├── auth.js            # /api/auth/*
│   │   ├── posts.js           # /api/posts/*
│   │   ├── platforms.js       # /api/platforms/* (OAuth)
│   │   ├── analytics.js       # /api/analytics/*
│   │   └── ai.js              # /api/ai/*
│   └── services/
│       ├── publisher.js       # Platform API integrations
│       └── scheduler.js       # Cron: auto-publish scheduled posts
├── uploads/                   # Media uploads (multer)
├── .env.example
└── package.json
```

## Deployment

For production (Railway, Render, Fly.io, etc.):

1. Set `NODE_ENV=production` and all env vars in the platform's dashboard
2. Set `CLIENT_URL` to your frontend domain (for OAuth redirects)
3. Update OAuth redirect URIs in each developer portal to use your production domain
4. Use MongoDB Atlas (connection string goes in `MONGODB_URI`)

---

## Connect to the SocialFlow Frontend

The HTML frontend artifact (`socialflow.html`) talks to this backend. To wire them up, add a base URL constant at the top of the frontend JS:

```js
const API_BASE = 'http://localhost:5000/api';
```

Then replace the simulated fetch calls in the frontend with real `fetch()`/`axios` calls to this backend.
