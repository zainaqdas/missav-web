'use strict';

const cheerio = require('cheerio');
const CONFIG = require('./config');
const Signer = require('./signer');
const Utils = require('./utils');

/**
 * Search engine for missav.ws using HMAC-signed API and HTML fallback.
 */
class SearchEngine {
  /**
   * @param {import('./scraper')} scraper - Scraper instance
   * @param {object} cache - Cache instance
   */
  constructor(scraper, cache = null) {
    this.scraper = scraper;
    this.signer = new Signer(CONFIG.PUBLIC_TOKEN);
    this.cache = cache;
  }

  /**
   * Search for videos.
   *
   * @param {string} query - Search query
   * @param {object} options - { count, page }
   * @returns {Promise<object>} Search results
   */
  async search(query, options = {}) {
    const count = options.count || 50;
    const page = options.page || 1;
    const cacheKey = `search:${query}:${count}:${page}`;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Try the native API first (uses HMAC signing)
    try {
      const results = await this._searchViaApi(query, count);
      if (results && results.length > 0) {
        const data = { query, count: results.length, total: results.length, page, results };
        if (this.cache) this.cache.set(cacheKey, data);
        return data;
      }
    } catch (err) {
      console.warn(`[Search] Native API search failed: ${err.message}`);
    }

    // Fallback: scrape the search results page
    try {
      const data = await this._searchViaScraping(query);
      if (this.cache) this.cache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.warn(`[Search] Scraping fallback failed: ${err.message}`);
      // Preserve the original error type so the error handler can map it correctly
      const wrapped = new Error(`Search failed for "${query}"`);
      if (err.message?.includes('Cloudflare') || err.message?.includes('blocked')) {
        wrapped.message = `Cloudflare: Search failed for "${query}"`;
      }
      throw wrapped;
    }
  }

  /**
   * Search via the native Recombee API with HMAC signing.
   */
  async _searchViaApi(query, count) {
    const signedUrl = this.signer.buildSignedUrl(
      CONFIG.BASE_URL,
      CONFIG.SEARCH_API_PATH
    );

    const response = await this.scraper.post(
      signedUrl,
      { searchQuery: query, count },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }
    );

    let data = response.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return [];
      }
    }

    if (data.recomms) {
      return data.recomms
        .filter(item => item.id)
        .map(item => ({
          id: item.id,
          url: `${CONFIG.BASE_URL}${CONFIG.EN}/${item.id}`,
          confidence: item.confidence || 0,
        }));
    }

    if (Array.isArray(data)) {
      return data.map(item => ({
        id: item.id || item,
        url: `${CONFIG.BASE_URL}${CONFIG.EN}/${item.id || item}`,
      }));
    }

    return [];
  }

  /**
   * Fallback search by scraping the HTML search results page.
   */
  async _searchViaScraping(query) {
    const path = `${CONFIG.EN}/search?q=${encodeURIComponent(query)}`;
    const response = await this.scraper.fetch(path);
    const html = response.data;

    const results = Utils.extractVideoCards(html, {
      strictId: false,
      maxCards: 60,
      baseUrl: CONFIG.BASE_URL,
    });

    return {
      query,
      count: results.length,
      total: results.length,
      page: 1,
      results,
    };
  }
}

module.exports = SearchEngine;
