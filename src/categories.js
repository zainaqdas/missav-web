'use strict';

const cheerio = require('cheerio');
const CONFIG = require('./config');
const Utils = require('./utils');

/**
 * Categories/Genres scraper for missav.ws.
 */
class CategoriesScraper {
  /**
   * @param {import('./scraper')} scraper - Scraper instance
   * @param {object} cache - Cache instance
   */
  constructor(scraper, cache = null) {
    this.scraper = scraper;
    this.cache = cache;
  }

  /**
   * Get all available genres/categories.
   *
   * @returns {Promise<Array>} List of genres
   */
  async getGenres() {
    const cacheKey = 'genres:all';
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const path = `${CONFIG.EN}/genres`;
    const response = await this.scraper.fetch(path);
    const html = response.data;
    const $ = cheerio.load(html);

    const genres = [];
    const seen = new Set();

    $('a[href*="/en/genres/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const slug = href.split('/genres/')?.[1]?.replace(/\/$/, '') || '';
      const name = $(el).text().trim() || slug;

      if (slug && !seen.has(slug)) {
        seen.add(slug);
        genres.push({
          name,
          slug,
          url: `${CONFIG.BASE_URL}${href}`,
        });
      }
    });

    if (this.cache) {
      this.cache.set(cacheKey, genres);
    }

    return genres;
  }

  /**
   * Get videos in a specific genre/category.
   *
   * @param {string} genreSlug - Genre slug
   * @param {object} options - { page, sort }
   * @returns {Promise<object>} Genre page with videos
   */
  async getGenreVideos(genreSlug, options = {}) {
    const page = options.page || 1;
    const sort = options.sort || '';
    const cacheKey = `genre:${genreSlug}:${page}:${sort}`;

    if (this.cache && page === 1) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    let path = `${CONFIG.EN}/genres/${genreSlug}`;
    const params = [];
    if (page > 1) params.push(`page=${page}`);
    if (sort) params.push(`sort=${sort}`);
    if (params.length > 0) path += `?${params.join('&')}`;

    const response = await this.scraper.fetch(path);
    const html = response.data;
    const videos = Utils.extractVideoCards(html, {
      strictId: true,
      baseUrl: CONFIG.BASE_URL,
    });

    const result = {
      genre: genreSlug,
      page,
      sort: sort || 'latest',
      videos,
      hasMore: videos.length >= 20,
    };

    if (this.cache && page === 1) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }
}

module.exports = CategoriesScraper;
