# MissAV Scraper API

A comprehensive Node.js API for scraping and structuring data from missav.ws. Provides endpoints for browsing, searching, and extracting video streaming URLs from the MissAV website.

> **⚠️ Disclaimer:** This project is for educational purposes only. Scraping websites may violate their Terms of Service. Use at your own risk and ensure compliance with applicable laws in your jurisdiction.

## Features

- **Video Details** - Extract metadata (title, code, description, thumbnail, duration, genres, actresses)
- **Streaming URLs** - Extract HLS (m3u8) video streaming URLs with proper playback headers
- **Search** - Search using the site's native Recombee API with automatic HMAC signing
- **Categories/Genres** - Browse all available genres and filter videos by category
- **Actresses** - Browse actresses and view their video catalog
- **Latest/Trending** - Browse the latest and trending videos from the homepage
- **Multiple Quality Options** - Select specific video qualities when available
- **Cloudflare Bypass** - Multiple strategies to handle Cloudflare protection
- **Ready for Vercel + Railway** - Pre-configured for serverless deployment

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **yarn**

## Installation

```bash
git clone <repo-url>
cd missav-api
npm install
```

## Usage

### Start the server

```bash
npm start
# or with verbose logging:
VERBOSE=true npm run dev
```

The server will start on **http://localhost:3000** by default.

### Set a custom port

```bash
PORT=8080 npm start
```

## API Endpoints

### Health Check

```
GET /api/health
```

Returns server status and available endpoints.

### Get Video Details

```
GET /api/video/:id
```

**Path Parameters:**
- `id` - Video ID (e.g., `SSIS-406`)

**Query Parameters:**
- `stream` - Set to `true` to also fetch streaming URLs

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "SSIS-406",
    "title": "Video Title",
    "code": "SSIS-406",
    "description": "...",
    "thumbnail": "https://...",
    "publishDate": "2024-01-15",
    "duration": null,
    "genres": [
      { "name": "Genre Name", "slug": "genre-slug", "url": "..." }
    ],
    "actresses": [
      { "name": "Actress Name", "slug": "actress-name", "url": "..." }
    ],
    "manufacturer": "...",
    "series": "...",
    "url": "https://missav.ws/en/SSIS-406",
    "relatedVideos": [
      { "id": "SOME-001", "title": "...", "thumbnail": "...", "duration": "..." }
    ]
  }
}
```

### Get Video Streaming URLs

```
GET /api/video/:id/stream
```

**Path Parameters:**
- `id` - Video ID (e.g., `SSIS-406`)

**Query Parameters:**
- `quality` - Desired quality: `best`, `720p`, `1080p`, or `all` (default: `best`)

**Response:**
```json
{
  "success": true,
  "data": {
    "videoId": "SSIS-406",
    "quality": "master",
    "url": "https://.../playlist.m3u8",
    "headers": {
      "User-Agent": "...",
      "Referer": "https://missav.ws/en/SSIS-406",
      "Origin": "https://missav.ws"
    }
  }
}
```

### Search Videos

```
GET /api/search?q=<query>
```

**Query Parameters:**
- `q` - Search query (required)
- `count` - Number of results (default: 50)
- `page` - Page number (default: 1)

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "SSIS",
    "count": 50,
    "page": 1,
    "results": [
      { "id": "SSIS-406", "url": "https://missav.ws/en/SSIS-406" }
    ]
  }
}
```

### Get All Genres

```
GET /api/genres
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "name": "Genre Name", "slug": "genre-slug", "url": "..." }
  ]
}
```

### Get Videos by Genre

```
GET /api/genre/:slug
```

**Path Parameters:**
- `slug` - Genre slug (e.g., `uncensored`, `hd`)

**Query Parameters:**
- `page` - Page number
- `sort` - Sort order (`latest`, `popular`)

**Response:**
```json
{
  "success": true,
  "data": {
    "genre": "uncensored",
    "page": 1,
    "videos": [
      {
        "id": "SSIS-406",
        "title": "...",
        "thumbnail": "...",
        "duration": "2:15:00",
        "url": "https://missav.ws/en/SSIS-406"
      }
    ],
    "hasMore": true
  }
}
```

### Get All Actresses

```
GET /api/actresses
```

**Query Parameters:**
- `page` - Page number

### Get Videos by Actress

```
GET /api/actress/:slug
```

**Path Parameters:**
- `slug` - Actress slug/name

**Query Parameters:**
- `page` - Page number
- `sort` - Sort order

### Browse Latest/Trending

```
GET /api/browse?type=latest
```

**Query Parameters:**
- `type` - `latest` or `trending` (default: `latest`)
- `page` - Page number

## Using with a Video Player

The streaming endpoint returns a URL and required headers. You can use these with any HLS-compatible video player:

### HLS.js (Browser)

```javascript
const response = await fetch('http://localhost:3000/api/video/SSIS-406/stream');
const { data } = await response.json();

const video = document.getElementById('video');
const hls = new Hls();

// Set the Referer header via video element
hls.loadSource(data.url);
hls.attachMedia(video);
```

### VLC Media Player

You can use the m3u8 URL directly in VLC:
```
File > Open Network > Paste the stream URL
```

### FFmpeg

```bash
ffmpeg -headers "Referer: https://missav.ws/en/SSIS-406" -i "<stream-url>" -c copy output.ts
```

## Scraper Backends (Cloudflare Bypass)

missav.ws uses **Cloudflare** protection that blocks standard HTTP requests. The API supports **multiple scraping backends** to handle this:

### Option 1: FlareSolverr (Recommended for Vercel + Railway)

[FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) is an open-source proxy that uses a headless browser (Chromium) to solve Cloudflare challenges. Deploy it on Railway (free tier) as a companion service.

### Option 2: Scrapfly

[Scrapfly](https://scrapfly.io) is a managed scraping API. Has a **free tier** (1,000 credits).

```bash
export SCRAPER_BACKEND=scrapfly
export SCRAPFLY_API_KEY=your_key_here
```

### Option 3: ScraperAPI

[ScraperAPI](https://scraperapi.com) works as a proxy service with Cloudflare bypass. Free tier available (1,000 credits).

```bash
export SCRAPER_BACKEND=scraperapi
export SCRAPERAPI_API_KEY=your_key_here
```

### Option 4: Direct (Fallback)

Standard HTTP requests with browser-like headers. **Will not work** when Cloudflare is actively blocking.

```bash
export SCRAPER_BACKEND=direct
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `VERBOSE` | `false` | Enable verbose request logging |
| `QUIET` | `false` | Suppress startup banner |
| `SCRAPER_BACKEND` | `direct` | Scraper backend: `direct`, `scrapfly`, `scraperapi`, `flaresolverr` |
| `SCRAPFLY_API_KEY` | - | Scrapfly API key (required for `scrapfly` backend) |
| `SCRAPERAPI_API_KEY` | - | ScraperAPI API key (required for `scraperapi` backend) |
| `FLARESOLVERR_URL` | `http://localhost:8191/v1` | FlareSolverr server URL |

---

## Deployment: Vercel + Railway

This is the recommended deployment architecture:

- **Vercel** hosts the Node.js API as a serverless function
- **Railway** runs FlareSolverr (a headless browser proxy that solves Cloudflare challenges)

### Architecture

```
┌────────────┐   HTTPS    ┌───────────────────┐   HTTP    ┌──────────────────────┐
│   Browser  │ ────────▶  │  Vercel (API)     │ ──────▶  │  Railway (Flare-    │
│  / Mobile  │            │  missav-api       │           │  Solverr)            │
│            │ ◀────────  │  /api/video/:id   │ ◀──────  │  :8191/v1            │
└────────────┘   JSON     └───────────────────┘   HTML   └──────────────────────┘
```

- Vercel URL: `https://missav-api.vercel.app`
- Railway URL: `https://flaresolverr.up.railway.app`

### Step 1: Deploy FlareSolverr on Railway (free)

1. Go to **[railway.app/new](https://railway.app/new)** and sign up (GitHub login)
2. Click **"Deploy from Image"** (not from a repo)
3. In the image field, enter: `flaresolverr/flaresolverr`
4. Click **"Add Variables"** and add this optional variable:
   - `LOG_LEVEL` = `info` (or `warn` for less verbose logs)
5. Railway will deploy FlareSolverr. Wait for it to show **"Deployed"** (green checkmark)
6. Go to **Settings → Networking** and click **"Generate Domain"**
7. Railway will provide a public URL like: `https://flaresolverr-production-xxxx.up.railway.app`
8. **Copy this URL** — you'll need it for the Vercel configuration

> **Test it:** This URL is your `FLARESOLVERR_URL`. Append `/v1` when configuring Vercel:
> ```bash
> curl -X POST https://your-service.up.railway.app/v1 \
>   -H "Content-Type: application/json" \
>   -d '{"cmd":"sessions.list"}'
> ```
> Expect a response like `{"sessions":[]}`

### Step 2: Prepare the Code for Vercel

The project already includes Vercel configuration:

- **`api/index.js`** — Vercel serverless entry point (exports the Express app)
- **`vercel.json`** — Routes all `/api/*` requests to the serverless function
- **`.vercelignore`** — Excludes unnecessary files from deployment

Push the code to a **GitHub repository**:

```bash
# Initialize git (if not already done)
cd missav-api
git init
git add .
git commit -m "Initial commit"

# Create a repo on GitHub and push
git remote add origin https://github.com/YOUR_USERNAME/missav-api.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy the API on Vercel

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign up (GitHub login recommended)
2. Click **"Import Project"** → select your `missav-api` repository
3. Vercel will auto-detect the project. In the configuration screen:

   **Framework Preset:** Leave as "Other" (Vercel auto-detects Node.js)

   **Root Directory:** Keep as `./` (project root)

   **Build Command:** Leave empty (no build step needed)

   **Output Directory:** Leave default

4. **Add Environment Variables** (click "Environment Variables"):

   | Variable | Value |
   |----------|-------|
   | `SCRAPER_BACKEND` | `flaresolverr` |
   | `FLARESOLVERR_URL` | `https://your-service.up.railway.app/v1` (from Step 1) |

5. Click **"Deploy"**

6. Wait for deployment to complete. Vercel will give you a URL like:
   `https://missav-api.vercel.app`

### Step 4: Test Your Deployed API

```bash
# Health check
curl https://missav-api.vercel.app/api/health

# Browse latest videos
curl https://missav-api.vercel.app/api/browse?type=latest

# Get video details
curl https://missav-api.vercel.app/api/video/SSIS-406

# Get streaming URL (may take 30-60s on first request)
curl --max-time 90 https://missav-api.vercel.app/api/video/SSIS-406/stream

# Search
curl "https://missav-api.vercel.app/api/search?q=SSIS"

# Genres
curl https://missav-api.vercel.app/api/genres

# Actresses
curl https://missav-api.vercel.app/api/actresses
```

### Step 5: Set Up Vercel Domain (Optional)

By default, Vercel gives you a subdomain at `vercel.app`. To add a custom domain:

1. Go to your Vercel project dashboard
2. Click **Settings → Domains**
3. Enter your custom domain (e.g., `api.yourdomain.com`)
4. Follow Vercel's DNS configuration instructions

### Vercel Plan Limits

| Feature | Hobby (Free) | Pro ($20/mo) |
|---------|-------------|--------------|
| Function timeout | **10 seconds** | **60 seconds** |
| Bandwidth | 100 GB | 1 TB |
| Serverless invocations | 100k/mo | 1M/mo |

**Important:** The `/api/video/:id/stream` endpoint can take **30-60 seconds** because FlareSolverr needs to run a headless browser to bypass Cloudflare. This means:

- ✅ Browse, search, genres, actresses endpoints work on **Hobby plan** (fast, <5s)
- ⚠️ Video metadata works on **Hobby plan** (usually <10s)
- ❌ Stream URL extraction may **timeout on Hobby** (needs Pro's 60s limit)

To upgrade: **Vercel Dashboard → Settings → Plans & Invoices → Upgrade to Pro**

## Local Development with FlareSolverr

For local testing before deploying:

```bash
# 1. Start FlareSolverr (requires Docker)
docker run -d --name flaresolverr -p 8191:8191 flaresolverr/flaresolverr:latest

# 2. Wait for it to be ready
sleep 5
curl -X POST http://localhost:8191/v1 \
  -H "Content-Type: application/json" \
  -d '{"cmd":"sessions.list"}'

# 3. Start the API server
cd missav-api
SCRAPER_BACKEND=flaresolverr FLARESOLVERR_URL=http://localhost:8191/v1 npm start

# 4. Test
curl http://localhost:3000/api/health
curl http://localhost:3000/api/browse?type=latest
curl --max-time 90 http://localhost:3000/api/video/SSIS-406/stream
```

### Stopping FlareSolverr

```bash
docker stop flaresolverr
docker rm flaresolverr
```

## Common Issues

### Cloudflare Protection

If the API returns 502 errors, it means the scraper backend couldn't bypass Cloudflare:

1. **FlareSolverr on Railway not responding?** → Check Railway dashboard for logs
2. **FlareSolverr timeout?** → Cloudflare challenges can take 30-60s. Check Vercel plan limits
3. **Using `direct` backend?** → Switch to `flaresolverr` or another proxy backend

### Video Playback

Streaming URLs require specific HTTP headers (`Referer`, `Origin`) to play. The API returns these headers alongside the stream URL. Make sure your video player sends them, or use the headers in your HLS configuration.

### HLS.js Headers Workaround

Since browsers can't set custom `Referer` headers on video sources, use a proxy approach:

```javascript
// The CDN may allow direct access without custom headers
const response = await fetch('/api/video/SSIS-406/stream');
const { data } = await response.json();

const video = document.getElementById('video');
const hls = new Hls();
hls.loadSource(data.url);
hls.attachMedia(video);
```

## Architecture

```
missav-api/
├── api/
│   └── index.js        # Vercel serverless entry point
├── src/
│   ├── server.js        # Express server entry point
│   ├── config.js        # Configuration (URLs, tokens, regex patterns)
│   ├── scraper.js       # Multi-backend scraper (4 backends)
│   ├── signer.js        # HMAC-SHA1 signing for native search API
│   ├── utils.js         # Shared utilities (video cards, m3u8 parsing, cache)
│   ├── video.js         # Video page scraping & metadata extraction
│   ├── search.js        # Search via API + HTML fallback
│   ├── categories.js    # Genre/category page scraping
│   ├── actresses.js     # Actress page scraping
│   ├── stream.js        # Video stream URL resolution
│   └── routes.js        # Express API route definitions
├── .env.example         # Environment configuration template
├── .vercelignore        # Files excluded from Vercel deployment
├── vercel.json          # Vercel deployment configuration
├── package.json
└── README.md
```

### How It Works

1. **Multi-Backend Scraper** (`scraper.js`) - Routes requests through one of four backends: direct HTTP, Scrapfly, ScraperAPI, or FlareSolverr. Selectable via environment variable.

2. **Search Signing** (`signer.js`) - Reverses the site's native Recombee API signing by computing HMAC-SHA1 signatures with the extracted public token.

3. **Video Extraction** (`video.js`) - Parses HTML using Cheerio and regex to extract video metadata. For streaming URLs, it locates obfuscated m3u8 URLs embedded in JavaScript.

4. **Stream Resolution** (`stream.js`) - Resolves video streaming URLs by extracting m3u8 playlists and parsing available quality options. Returns the URLs with required HTTP headers for playback.

5. **Express API** (`server.js` + `routes.js`) - Exposes all functionality through a clean REST API with caching, rate limiting, and proper error handling.

## License

MIT
