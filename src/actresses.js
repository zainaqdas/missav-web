'use strict';

const cheerio = require('cheerio');
const CONFIG = require('./config');
const Utils = require('./utils');

/**
 * Actresses/Performers scraper for missav.ws.
 */
class ActressesScraper {
  /**
   * @param {import('./scraper')} scraper - Scraper instance
   * @param {object} cache - Cache instance
   */
  constructor(scraper, cache = null) {
    this.scraper = scraper;
    this.cache = cache;
  }

  /**
   * Get all actresses.
   *
   * @param {object} options - { page }
   * @returns {Promise<Array>} List of actresses
   */
  async getActresses(options = {}) {
    const page = options.page || 1;
    const cacheKey = `actresses:list:${page}`;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    let path = `${CONFIG.EN}/actresses`;
    if (page > 1) path += `?page=${page}`;

    const response = await this.scraper.fetch(path);
    const html = response.data;
    const $ = cheerio.load(html);

    const actresses = [];
    const seen = new Set();

    $('a[href*="/en/actresses/"]').each((i, el) => {
      if (i > 60) return false;
      const href = $(el).attr('href') || '';
      const slug = href.split('/actresses/')?.[1]?.replace(/\/$/, '') || '';

      if (!slug || seen.has(slug)) return;
      seen.add(slug);

      const img = $(el).find('img').first();
      const name = img.attr('alt') || slug;
      const avatar = img.attr('src') || '';
      const countText = $(el).text().match(/(\d+)/);

      actresses.push({
        name: name.replace(/\d+/g, '').trim(),
        slug,
        avatar,
        videoCount: countText ? parseInt(countText[1], 10) : null,
        url: `${CONFIG.BASE_URL}${href}`,
      });
    });

    if (this.cache) {
      this.cache.set(cacheKey, actresses);
    }

    return actresses;
  }

  /**
   * Get videos by a specific actress.
   *
   * @param {string} actressSlug - Actress slug/name
   * @param {object} options - { page, sort }
   * @returns {Promise<object>} Actress page with videos
   */
  async getActressVideos(actressSlug, options = {}) {
    const page = options.page || 1;
    const sort = options.sort || '';
    const cacheKey = `actress:videos:${actressSlug}:${page}:${sort}`;

    if (this.cache && page === 1) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    let path = `${CONFIG.EN}/actresses/${actressSlug}`;
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
      actress: actressSlug,
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

module.exports = ActressesScraper;
