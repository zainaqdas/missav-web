'use strict';

const express = require('express');
const Utils = require('./utils');

/**
 * Creates and configures all Express API routes.
 *
 * @param {object} services - Service instances
 * @returns {express.Router} Configured router
 */
function createRouter(services) {
  const router = express.Router();
  const { videoScraper, searchEngine, categoriesScraper, actressesScraper, streamResolver } = services;

  // ---- Health Check ----

  router.get('/health', (req, res) => {
    const cache = req.app.locals.cache;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      cache: cache ? cache.stats() : { size: 0 },
      endpoints: [
        { method: 'GET', path: '/api/health', description: 'Health check' },
        { method: 'GET', path: '/api/video/:id', description: 'Video details' },
        { method: 'GET', path: '/api/video/:id/stream', description: 'Video streaming URLs' },
        { method: 'GET', path: '/api/search?q=<query>', description: 'Search videos' },
        { method: 'GET', path: '/api/genres', description: 'All genres/categories' },
        { method: 'GET', path: '/api/genre/:slug', description: 'Videos by genre' },
        { method: 'GET', path: '/api/actresses', description: 'All actresses' },
        { method: 'GET', path: '/api/actress/:slug', description: 'Videos by actress' },
        { method: 'GET', path: '/api/browse', description: 'Browse latest/trending' },
      ],
    });
  });

  // ---- Video Endpoints ----

  router.get('/video/:id', async (req, res, next) => {
    try {
      const videoId = req.params.id.toUpperCase();
      const includeStream = req.query.stream === 'true' || req.query.stream === '1';

      let video;
      if (includeStream) {
        video = await videoScraper.getVideoWithStreams(videoId);
      } else {
        video = await videoScraper.getVideo(videoId);
      }

      if (!video || (!video.title && !video.code)) {
        return res.status(404).json({
          success: false,
          error: `Video '${videoId}' not found or could not be parsed`,
        });
      }

      res.json({ success: true, data: video });
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        res.status(404).json({ success: false, error: 'Video not found' });
      } else {
        next(err);
      }
    }
  });

  router.get('/video/:id/stream', async (req, res, next) => {
    try {
      const videoId = req.params.id.toUpperCase();
      const quality = req.query.quality || 'best';

      const result = await streamResolver.resolve(videoId, { quality });

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        data: {
          videoId: result.videoId,
          quality: result.quality,
          resolution: result.resolution || null,
          url: result.url,
          masterUrl: result.masterUrl || result.url,
          headers: result.headers,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ---- Search Endpoint ----

  router.get('/search', async (req, res, next) => {
    try {
      const query = req.query.q || req.query.query || '';

      if (!query || !query.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required. Use ?q=<query>',
        });
      }

      const count = parseInt(req.query.count, 10) || 50;
      const page = parseInt(req.query.page, 10) || 1;

      const results = await searchEngine.search(query, { count, page });

      res.json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  });

  // ---- Categories/Genres Endpoints ----

  router.get('/genres', async (req, res, next) => {
    try {
      const genres = await categoriesScraper.getGenres();
      res.json({ success: true, data: genres });
    } catch (err) {
      next(err);
    }
  });

  router.get('/genre/:slug', async (req, res, next) => {
    try {
      const { slug } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const sort = req.query.sort || '';

      const result = await categoriesScraper.getGenreVideos(slug, { page, sort });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // ---- Actresses Endpoints ----

  router.get('/actresses', async (req, res, next) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const actresses = await actressesScraper.getActresses({ page });
      res.json({ success: true, data: actresses });
    } catch (err) {
      next(err);
    }
  });

  router.get('/actress/:slug', async (req, res, next) => {
    try {
      const { slug } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const sort = req.query.sort || '';

      const result = await actressesScraper.getActressVideos(slug, { page, sort });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // ---- Browse Endpoint ----

  router.get('/browse', async (req, res, next) => {
    try {
      const type = req.query.type || 'latest';
      const page = parseInt(req.query.page, 10) || 1;

      let path = '/en';
      if (type === 'trending') {
        path = '/en/trending';
      }
      if (page > 1) {
        path += `?page=${page}`;
      }

      const { scraper } = req.app.locals;
      const response = await scraper.fetch(path);

      const videos = Utils.extractVideoCards(response.data, {
        strictId: true,
        maxCards: 60,
        baseUrl: scraper.baseUrl,
      });

      res.json({
        success: true,
        data: { type, page, videos },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createRouter;
