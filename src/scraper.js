'use strict';

const https = require('https');
const CONFIG = require('./config');

/**
 * Multi-backend scraper for missav.ws.
 * Supports multiple backends to bypass Cloudflare protection:
 *   - direct:      Direct HTTP requests with browser-like headers
 *   - scrapfly:    Scrapfly.io anti-scraping API (recommended)
 *   - scraperapi:  ScraperAPI.com proxy service
 *   - flaresolverr: Self-hosted FlareSolverr proxy
 *
 * The backend is selected via the SCRAPER_BACKEND environment variable.
 */
class Scraper {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.baseUrl - Base URL (default: CONFIG.BASE_URL)
   * @param {string} options.backend - Scraper backend (default: process.env.SCRAPER_BACKEND || 'direct')
   * @param {number} options.timeout - Request timeout in ms (default: 30000)
   * @param {number} options.maxRetries - Max retry attempts (default: 3)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || CONFIG.BASE_URL;
    this.backend = options.backend || process.env.SCRAPER_BACKEND || 'direct';
    this.timeout = options.timeout || CONFIG.TIMEOUT;
    this.maxRetries = options.maxRetries || 3;
    this.cookieJar = {};

    console.log(`[Scraper] Initialized with backend: ${this.backend}`);
  }

  /**
   * Fetch a page from the target site.
   * Routes to the appropriate backend based on configuration.
   *
   * @param {string} path - URL path (e.g., '/en', '/en/SSIS-406')
   * @param {object} options - Request options
   * @param {object} options.headers - Additional headers
   * @param {object} options.params - Query parameters
   * @param {string} options.method - HTTP method (GET, POST)
   * @param {*} options.data - POST body data
   * @param {boolean} options.raw - Return full response
   * @returns {Promise<object>} Response data
   */
  async fetch(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();

    switch (this.backend) {
      case 'scrapfly':
        return this._fetchViaScrapfly(path, options);
      case 'scraperapi':
        return this._fetchViaScraperAPI(path, options);
      case 'flaresolverr':
        return this._fetchViaFlareSolverr(path, options);
      case 'direct':
      default:
        return this._fetchDirect(path, options);
    }
  }

  /**
   * POST request via the configured backend.
   *
   * @param {string} path - URL path
   * @param {object} data - POST body
   * @param {object} options - Additional options
   * @returns {Promise<object>} Response data
   */
  async post(path, data, options = {}) {
    return this.fetch(path, {
      ...options,
      method: 'POST',
      data,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
      },
    });
  }

  // ===== BACKEND: Direct HTTP (axios-based, original implementation) =====

  async _fetchDirect(path, options = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const method = (options.method || 'GET').toLowerCase();

    // Dynamic import of axios (loaded only when this backend is used)
    const axios = require('axios');

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios({
          method,
          url,
          headers: {
            ...CONFIG.HEADERS,
            ...options.headers,
            Referer: `${this.baseUrl}/`,
            Origin: this.baseUrl,
          },
          params: options.params,
          data: options.data,
          responseType: 'text',
          timeout: this.timeout,
          httpAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
          httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
          maxRedirects: 5,
          decompress: true,
          validateStatus: (status) => status < 500,
        });

        // Rotate UA on retry
        if (attempt > 1) {
          response.config.headers['User-Agent'] = this._getRandomUserAgent();
          await this._delay(1000 * attempt);
        }

        // Check for Cloudflare challenge
        if (this._isCloudflareChallenge(response.data)) {
          console.warn(`[Direct] Cloudflare challenge on ${path} (attempt ${attempt})`);
          if (attempt < this.maxRetries) {
            await this._delay(2000 * attempt);
            continue;
          }
          throw new Error('Cloudflare challenge could not be bypassed with direct backend. Try using scrapfly, scraperapi, or flaresolverr backend.');
        }

        if (response.status === 403 || response.status === 503) {
          if (attempt < this.maxRetries) {
            await this._delay(2000 * attempt);
            continue;
          }
          throw new Error(`Access blocked: HTTP ${response.status}. Try using a Cloudflare bypass backend.`);
        }

        if (options.raw) return response;

        return {
          status: response.status,
          headers: response.headers,
          data: response.data,
          url: response.request?.res?.responseUrl || url,
        };

      } catch (error) {
        if (error.message?.includes('Cloudflare') || error.message?.includes('blocked')) {
          if (attempt < this.maxRetries) continue;
        }
        if (attempt < this.maxRetries) {
          await this._delay(1000 * attempt);
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Failed to fetch ${path} after ${this.maxRetries} attempts`);
  }

  // ===== BACKEND: Scrapfly (https://scrapfly.io) =====

  async _fetchViaScrapfly(path, options = {}) {
    const apiKey = process.env.SCRAPFLY_API_KEY;
    if (!apiKey) {
      throw new Error('SCRAPFLY_API_KEY environment variable is not set. Get a free key at https://scrapfly.io');
    }

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const method = (options.method || 'GET').toUpperCase();

    try {
      // Use dynamic import for scrapfly-sdk
      const { ScrapflyClient, ScrapeConfig } = require('scrapfly-sdk');
      const client = new ScrapflyClient({ key: apiKey });

      // Build the scrape configuration - pass ALL options in constructor
      const scrapeOptions = {
        url,
        asp: true, // Anti-Scraping Protection bypass (handles Cloudflare)
        render_js: false, // We only need HTML, no JS rendering needed
        country: 'us',
        method: method,
      };

      // Add POST body in constructor options (SDK may not allow setting after construction)
      if (options.data) {
        scrapeOptions.body = typeof options.data === 'string'
          ? options.data
          : JSON.stringify(options.data);
      }

      const config = new ScrapeConfig(scrapeOptions);
      const result = await client.scrape(config);

      const content = result?.result?.content || '';
      const headers = result?.result?.headers || {};

      if (options.raw) {
        return { data: content, status: 200, headers };
      }

      return {
        status: 200,
        headers,
        data: content,
        url: url,
      };

    } catch (error) {
      console.error(`[Scrapfly] Error fetching ${path}:`, error.message);
      throw new Error(`Scrapfly scraping failed: ${error.message}`);
    }
  }

  // ===== BACKEND: ScraperAPI (https://scraperapi.com) =====

  async _fetchViaScraperAPI(path, options = {}) {
    const apiKey = process.env.SCRAPERAPI_API_KEY;
    if (!apiKey) {
      throw new Error('SCRAPERAPI_API_KEY environment variable is not set. Get a free key at https://scraperapi.com');
    }

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const method = (options.method || 'GET').toUpperCase();

    try {
      const axios = require('axios');

      // Build ScraperAPI request URL - supports GET and POST
      const apiUrl = `https://api.scraperapi.com`;
      const params = {
        api_key: apiKey,
        url: url,
        render: 'true', // Enable JavaScript rendering for Cloudflare bypass
        country_code: 'jp', // Match target site's region (Japan)
        keep_headers: 'true',
        ...options.params,
      };

      // For POST requests, add method and body params
      if (method === 'POST' && options.data) {
        params.method = 'POST';
        params.body = typeof options.data === 'string'
          ? options.data
          : JSON.stringify(options.data);
      }

      const response = await axios({
        method: 'GET', // ScraperAPI always uses GET, but passes method via params
        url: apiUrl,
        params,
        timeout: this.timeout + 20000, // Extra time for JS rendering + proxy (10s Vercel buffer)
        responseType: 'text',
        validateStatus: (status) => status < 500,
      });

      // Check for Cloudflare challenge first (often manifests as HTTP 403)
      if (this._isCloudflareChallenge(response.data)) {
        throw new Error('ScraperAPI could not bypass Cloudflare. Try using a premium plan or Scrapfly backend.');
      }

      // Check for auth/permission errors
      if (response.status === 403) {
        const preview = (response.data || '').substring(0, 200);
        throw new Error(`ScraperAPI error (HTTP 403): ${preview}`);
      }

      if (options.raw) return response;

      return {
        status: response.status,
        headers: response.headers,
        data: response.data,
        url: url,
      };

    } catch (error) {
      if (error.message?.includes('Cloudflare')) throw error;
      console.error(`[ScraperAPI] Error fetching ${path}:`, error.message);
      throw new Error(`ScraperAPI scraping failed: ${error.message}`);
    }
  }

  // ===== BACKEND: FlareSolverr (Self-hosted) =====

  async _fetchViaFlareSolverr(path, options = {}) {
    const solverUrl = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    try {
      const axios = require('axios');

      // Use longer timeout for FlareSolverr (up to 65s) since Cloudflare challenges can take time
      const solverTimeout = 65000;

      const payload = {
        cmd: 'request.get',
        url: url,
        maxTimeout: solverTimeout - 5000, // Give 5s buffer for the HTTP call itself
        session: 'missav-session',
      };

      // For POST requests
      if (options.method === 'POST' && options.data) {
        payload.cmd = 'request.post';
        payload.postData = typeof options.data === 'string'
          ? options.data
          : JSON.stringify(options.data);
      }

      const response = await axios.post(solverUrl, payload, {
        timeout: solverTimeout,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.data?.solution?.response) {
        const content = response.data.solution.response;
        const headers = response.data.solution.headers || {};
        const cookies = response.data.solution.cookies || [];

        if (options.raw) {
          return { data: content, status: 200, headers };
        }

        return {
          status: response.data.solution.status || 200,
          headers,
          data: content,
          url: url,
          cookies,
        };
      }

      // Check if the response indicates an error (e.g., timeout)
      if (response.data?.status === 'error') {
        throw new Error(`FlareSolverr challenge failed: ${response.data.message || 'Unknown error'}`);
      }

      throw new Error('FlareSolverr did not return expected response format');

    } catch (error) {
      if (error.message?.includes('FlareSolverr challenge failed')) throw error;
      console.error(`[FlareSolverr] Error fetching ${path}:`, error.message);
      throw new Error(`FlareSolverr scraping failed: ${error.message}. Ensure FlareSolverr is running at ${solverUrl}`);
    }
  }

  // ===== Utility Methods =====

  _isCloudflareChallenge(html) {
    if (!html || typeof html !== 'string') return false;
    return (
      html.includes('cf-browser-verification') ||
      html.includes('cf-challenge') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser') ||
      html.includes('cdn-cgi/challenge-platform') ||
      html.includes('_cf_chl_opt')
    );
  }

  _getRandomUserAgent() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = Scraper;
