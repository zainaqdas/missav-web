'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const CONFIG = require('./config');
const Scraper = require('./scraper');
const VideoScraper = require('./video');
const SearchEngine = require('./search');
const CategoriesScraper = require('./categories');
const ActressesScraper = require('./actresses');
const StreamResolver = require('./stream');
const Utils = require('./utils');
const createRouter = require('./routes');

/**
 * MissAV Scraper API Server
 *
 * A comprehensive Node.js API for scraping and structuring data from missav.ws.
 */
class Server {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3000;
    this.verbose = options.verbose || process.env.VERBOSE === 'true';

    // Initialize cache and rate limiter
    this.cache = Utils.createCache(CONFIG.CACHE_TTL);
    this.rateLimiter = Utils.createRateLimiter(10);

    // Initialize the scraper with configurable backend
    const backend = options.backend || process.env.SCRAPER_BACKEND || 'direct';
    this.scraper = new Scraper({
      baseUrl: options.baseUrl || CONFIG.BASE_URL,
      backend,
    });

    this.services = {
      videoScraper: new VideoScraper(this.scraper, this.cache),
      searchEngine: new SearchEngine(this.scraper, this.cache),
      categoriesScraper: new CategoriesScraper(this.scraper, this.cache),
      actressesScraper: new ActressesScraper(this.scraper, this.cache),
      streamResolver: new StreamResolver(this.scraper, this.cache),
    };

    this.app = express();
    this._configureApp();
  }

  _configureApp() {
    const app = this.app;

    // Express 5 query parser (explicit setting)
    app.set('query parser', 'extended');

    // Security
    app.use(helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }));

    // CORS
    app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
    }));

    // Body parsing
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting middleware
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) {
        if (!this.rateLimiter.allow()) {
          res.set('Retry-After', '1');
          return res.status(429).json({
            success: false,
            error: 'Too many requests. Please slow down.',
            retryAfter: '1 second',
          });
        }
      }
      next();
    });

    // Expose services and cache to routes
    app.locals.scraper = this.scraper;
    app.locals.cache = this.cache;

    // Request logging
    if (this.verbose) {
      app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
          const duration = Date.now() - start;
          console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        });
        next();
      });
    }

    // API routes
    const router = createRouter(this.services);
    app.use('/api', router);

    // 404 for unknown API routes (Express 5 compatible - use regex instead of wildcard)
    app.use(/^\/api\//, (req, res) => {
      res.status(404).json({
        success: false,
        error: `Unknown endpoint: ${req.method} ${req.originalUrl}`,
      });
    });

    // Static frontend if available
    const frontendPath = path.join(__dirname, '..', 'public');
    try {
      const fs = require('fs');
      if (fs.existsSync(frontendPath)) {
        app.use(express.static(frontendPath));
      }
    } catch {
      // No frontend directory
    }

    // Error handling middleware (4 params - Express 5 compatible)
    app.use((err, req, res, _next) => {
      console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

      let statusCode = 500;
      let errorMessage = 'Internal server error';

      if (err.message?.includes('Cloudflare') || err.message?.includes('blocked')) {
        statusCode = 502;
        errorMessage = 'Target site is blocking requests (Cloudflare protection). Try again later or use a proxy.';
      } else if (err.message?.includes('not found') || err.message?.includes('404')) {
        statusCode = 404;
        errorMessage = 'Resource not found';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        statusCode = 502;
        errorMessage = 'Could not connect to target site';
      } else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        statusCode = 504;
        errorMessage = 'Request to target site timed out';
      } else if (err.response?.status === 404) {
        statusCode = 404;
        errorMessage = 'Resource not found';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        ...(this.verbose ? { detail: err.message } : {}),
      });
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    MissAV Scraper API                        ║
║                                                              ║
║  Server running on: http://localhost:${this.port}                    ║
║  API base URL:      http://localhost:${this.port}/api                ║
║  Health check:      http://localhost:${this.port}/api/health         ║
║                                                              ║
║  Available Endpoints:                                        ║
║  ───────────────────────────────────────────                 ║
║  GET /api/video/:id          - Video details                 ║
║  GET /api/video/:id/stream   - Streaming URLs                ║
║  GET /api/search?q=<query>   - Search videos                 ║
║  GET /api/genres             - All genres                    ║
║  GET /api/genre/:slug        - Videos by genre               ║
║  GET /api/actresses          - All actresses                 ║
║  GET /api/actress/:slug      - Videos by actress             ║
║  GET /api/browse             - Browse latest/trending        ║
║  GET /api/health             - Health check                  ║
╚══════════════════════════════════════════════════════════════╝
        `);
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('[Server] Shutting down...');
          resolve();
        });
      });
    }
  }
}

if (require.main === module) {
  const server = new Server({
    verbose: process.env.VERBOSE === 'true' || !process.env.QUIET,
  });

  server.start().catch((err) => {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\n[Server] Received SIGINT');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Server] Received SIGTERM');
    await server.stop();
    process.exit(0);
  });
}

module.exports = Server;
