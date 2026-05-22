'use strict';

const cheerio = require('cheerio');
const CONFIG = require('./config');

/**
 * Shared utility functions for the missav scraper.
 */
class Utils {
  /**
   * Extract video cards from a listing page HTML.
   *
   * @param {string} html - Page HTML
   * @param {object} options - Extraction options
   * @param {boolean} options.strictId - Only match JAV code pattern (XXX-000)
   * @param {number} options.maxCards - Maximum cards to extract
   * @param {string} options.baseUrl - Base URL for constructing full URLs
   * @returns {Array<object>} Video card objects
   */
  static extractVideoCards(html, options = {}) {
    const {
      strictId = false,
      maxCards = 60,
      baseUrl = CONFIG.BASE_URL,
    } = options;

    const $ = cheerio.load(html);
    const videos = [];
    const seen = new Set();

    $('a[href*="/en/"]').each((i, el) => {
      if (videos.length >= maxCards) return false;
      const href = $(el).attr('href') || '';
      const idMatch = href.match(/\/en\/([A-Za-z0-9-]+)/);
      if (!idMatch) return;

      const id = idMatch[1];

      // Filter out non-video links
      if (id.includes('genres') || id.includes('actresses') ||
          id.includes('search') || id.includes('/')) return;

      // Optional strict JAV code filtering
      if (strictId && !/^[A-Za-z0-9]+-\d+$/.test(id)) return;

      if (seen.has(id)) return;
      seen.add(id);

      const img = $(el).find('img').first();
      const thumbnail = img.attr('src') || img.attr('data-src') || '';
      const alt = img.attr('alt') || '';
      const title = $(el).find('[class*="text-nord6"], [class*="title"]').first().text().trim() || alt;
      const durationEl = $(el).find('[class*="duration"], [class*="time"], .absolute').first().text().trim();
      const duration = durationEl.match(/\d+:\d+/)?.[0] || '';

      // Ensure URL is not double-prefixed
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

      videos.push({
        id,
        title,
        thumbnail,
        duration,
        url: fullUrl,
      });
    });

    return videos;
  }

  /**
   * Decode obfuscated m3u8 URL from the site's JavaScript.
   *
   * The site stores m3u8 paths in a pipe-delimited obfuscated format within JS arrays:
   *   'm3u8|UUID_PART1|UUID_PART2|...|com|surrit|https|video|...'
   *
   * This method reconstructs the proper m3u8 URL from the delimited segments.
   *
   * @param {string} encoded - The encoded m3u8 string from JS
   * @returns {string|null} Decoded m3u8 URL or null
   */
  static decodeM3u8Url(encoded) {
    if (!encoded) return null;

    try {
      // Clean up: remove 'm3u8' prefix, 'video' suffix, trim pipes/dashes
      let clean = encoded
        .replace(/^m3u8/, '')
        .replace(/video$/, '')
        .replace(/^[\|\-]+/, '')
        .replace(/[\|\-]+$/, '');

      // Split by query params
      const parts = clean.split('?');
      const pathPart = parts[0];
      const queryPart = parts.slice(1).join('?');

      // Try pipe-separated segments first (current site obfuscation pattern)
      if (pathPart.includes('|')) {
        const segments = pathPart.split('|').filter(Boolean);

        // segments look like: [uuid1, uuid2, uuid3, uuid4, uuid5, 'com', 'surrit', 'https', ...]
        // Expected: https://surrit.com/UUID/video/playlist.m3u8
        if (segments.length >= 5) {
          // Find protocol position (usually near the end)
          const httpsIdx = segments.lastIndexOf('https');
          const httpIdx = segments.lastIndexOf('http');
          const protoIdx = httpsIdx >= 0 ? httpsIdx : httpIdx;

          if (protoIdx >= 4) {
            // Protocol
            const protocol = segments[protoIdx];

            // Domain parts (com, surrit) - typically at positions protoIdx-2, protoIdx-1
            const tld = segments[protoIdx - 2] || 'com';
            const domain = segments[protoIdx - 1] || '';

            // UUID parts - everything before the domain parts
            const uuidParts = segments.slice(0, protoIdx - 2);
            const uuid = uuidParts.join('-');

            // Path segments after protocol
            const pathSegments = segments.slice(protoIdx + 1).filter(s => s !== 'video' && !s.includes('x'));

            if (domain && uuid) {
              // Try common path patterns
              const pathAttempts = [
                // Standard: /video/playlist.m3u8
                `${protocol}://${domain}.${tld}/${uuid}/video/playlist.m3u8`,
                // With path segments: /video/X/playlist.m3u8
                ...(pathSegments.length > 0 ? [
                  `${protocol}://${domain}.${tld}/${uuid}/video/${pathSegments.join('/')}/playlist.m3u8`
                ] : []),
                // Direct: /playlist.m3u8
                `${protocol}://${domain}.${tld}/${uuid}/playlist.m3u8`,
              ];

              for (const url of pathAttempts) {
                if (url && url.length > 30) {
                  const finalUrl = queryPart ? `${url}?${queryPart}` : url;
                  return finalUrl;
                }
              }
            }
          }
        }

        // Fallback: try reconstructing from reversed segments
        const reversed = [...segments].reverse();
        const protoIdx = reversed.indexOf('https') >= 0 ? reversed.indexOf('https') : reversed.indexOf('http');
        if (protoIdx >= 0 && reversed.length >= protoIdx + 4) {
          const protocol = reversed[protoIdx];
          const domain = reversed[protoIdx + 1];
          const tld = reversed[protoIdx + 2];
          const uuid = reversed.slice(protoIdx + 3).join('-');
          if (domain && uuid) {
            return `${protocol}://${domain}.${tld}/${uuid}/video/playlist.m3u8`;
          }
        }
      }

      // Legacy: try dash-separated segments
      const segments = pathPart.split('-').filter(Boolean);
      if (segments.length >= 3) {
        const possibilities = [
          () => `https://${segments[0]}.${segments[1]}/${segments.slice(2).join('-')}/playlist.m3u8`,
          () => `https://${segments[0]}.${segments[1]}.${segments[2]}/${segments.slice(3).join('-')}/playlist.m3u8`,
          () => `https://${segments[0]}.${segments[1]}/${segments.slice(2).join('/')}/playlist.m3u8`,
        ];

        for (const build of possibilities) {
          const url = build();
          if (url && url.length > 30) {
            return queryPart ? `${url}?${queryPart}` : url;
          }
        }

        // Try reversed
        const reversed = [...segments].reverse();
        if (reversed.length >= 3) {
          return `https://${reversed[0]}.${reversed[1]}/${reversed.slice(2).join('-')}/playlist.m3u8`;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find m3u8 URLs in HTML using multiple pattern matching strategies.
   *
   * @param {string} html - Page HTML
   * @returns {string|null} First m3u8 URL found, or null
   */
  static findM3u8Url(html) {
    if (!html) return null;

    const patterns = [
      // UUID-based CDN URLs (surrit.com or similar)
      /(?:https?:)?\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]+\/([a-f0-9-]{32,36}(?:\?[^"'\s]*)?)\/playlist\.m3u8[^"'\s]*/i,
      // Direct m3u8 URL
      /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i,
      // Generic HLS playlist
      /(?:https?:)?\/\/[^"'\s<>]+\/playlist\.m3u8[^"'\s<>]*/i,
      // m3u8 in data attributes
      /data-url=["']([^"']+\.m3u8[^"']*)["']/i,
      // m3u8 in JS config objects
      /["'(](?:src|url|file|source)["')]\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i,
      // hls/manifest paths
      /["'(](?:src|url|file)["')]\s*[:=]\s*["']([^"']+\/hls\/[^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let url = match[1] || match[0];
        // Prepend protocol if needed
        if (url.startsWith('//')) {
          url = `https:${url}`;
        }
        // Validate it looks like a URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
      }
    }

    // Look for obfuscated m3u8 pattern in JavaScript pipe-delimited arrays
    // Pattern: 'm3u8|uuid|uuid|...|com|surrit|https|...'
    const obfuscatedMatch = html.match(/'m3u8(.*?)'/i);
    if (obfuscatedMatch && obfuscatedMatch[1]) {
      const decoded = Utils.decodeM3u8Url(obfuscatedMatch[1]);
      if (decoded) return decoded;
    }

    // Fallback: look for pipe-delimited m3u8 patterns in script tags
    const pipeMatch = html.match(/['"]m3u8(?:\|[^'"]+)+['"]/i);
    if (pipeMatch) {
      const cleaned = pipeMatch[0].replace(/^['"]/, '').replace(/['"]$/, '');
      const decoded = Utils.decodeM3u8Url(cleaned);
      if (decoded) return decoded;
    }

    return null;
  }

  /**
   * Parse an m3u8 playlist and extract available quality options.
   *
   * @param {string} playlistContent - Content of the m3u8 playlist
   * @param {string} baseUrl - Base URL for resolving relative paths
   * @returns {Array<object>|null} Quality options or null
   */
  static parseM3u8Qualities(playlistContent, baseUrl) {
    if (!playlistContent) return null;

    const lines = playlistContent.split('\n');
    const qualities = [];
    let currentRes = null;
    let currentBandwidth = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for resolution info
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      if (resMatch) {
        currentRes = {
          width: parseInt(resMatch[1], 10),
          height: parseInt(resMatch[2], 10),
        };
      }

      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      if (bwMatch) {
        currentBandwidth = parseInt(bwMatch[1], 10);
      }

      if (line && !line.startsWith('#') && currentRes) {
        const streamUrl = line.startsWith('http')
          ? line
          : Utils.resolveRelativeUrl(baseUrl || streamUrl, line);

        qualities.push({
          label: `${currentRes.height}p`,
          resolution: `${currentRes.width}x${currentRes.height}`,
          width: currentRes.width,
          height: currentRes.height,
          bandwidth: currentBandwidth || 0,
          url: streamUrl,
        });

        currentRes = null;
        currentBandwidth = null;
      }
    }

    qualities.sort((a, b) => b.height - a.height);
    return qualities.length > 0 ? qualities : null;
  }

  /**
   * Resolve a relative URL against a base URL.
   *
   * @param {string} base - Base URL
   * @param {string} relative - Relative path
   * @returns {string} Resolved absolute URL
   */
  static resolveRelativeUrl(base, relative) {
    try {
      const baseUrl = new URL(base);
      if (relative.startsWith('/')) {
        return `${baseUrl.protocol}//${baseUrl.host}${relative}`;
      }
      const basePath = base.substring(0, base.lastIndexOf('/') + 1);
      return basePath + relative;
    } catch {
      return relative;
    }
  }

  /**
   * Build HTTP headers required for video stream playback.
   *
   * @param {string} videoId - Video ID for the Referer header
   * @param {string} baseUrl - Base URL
   * @returns {object} Headers object
   */
  static buildStreamHeaders(videoId, baseUrl = CONFIG.BASE_URL) {
    return {
      'User-Agent': CONFIG.HEADERS['User-Agent'],
      'Referer': `${baseUrl}${CONFIG.EN}/${videoId}`,
      'Origin': baseUrl,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };
  }

  /**
   * Simple in-memory TTL cache.
   */
  static createCache(ttlSeconds = 300) {
    const cache = new Map();

    return {
      /**
       * Get a cached value.
       * @param {string} key - Cache key
       * @returns {*|null} Cached value or null if not found/expired
       */
      get(key) {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
          cache.delete(key);
          return null;
        }
        return entry.value;
      },

      /**
       * Set a cached value.
       * @param {string} key - Cache key
       * @param {*} value - Value to cache
       */
      set(key, value) {
        cache.set(key, {
          value,
          expiry: Date.now() + ttlSeconds * 1000,
        });
      },

      /**
       * Clear all cached entries.
       */
      clear() {
        cache.clear();
      },

      /**
       * Get cache stats.
       * @returns {object} Cache stats
       */
      stats() {
        const now = Date.now();
        let valid = 0;
        let expired = 0;
        for (const entry of cache.values()) {
          if (now > entry.expiry) expired++;
          else valid++;
        }
        return { size: cache.size, valid, expired };
      },
    };
  }

  /**
   * Simple rate limiter.
   */
  static createRateLimiter(maxRequestsPerSecond = 5) {
    const timestamps = [];

    return {
      /**
       * Check if a request is allowed. If so, record it.
       * @returns {boolean} Whether the request is allowed
       */
      allow() {
        const now = Date.now();
        const windowStart = now - 1000;

        // Remove old timestamps
        while (timestamps.length > 0 && timestamps[0] < windowStart) {
          timestamps.shift();
        }

        if (timestamps.length >= maxRequestsPerSecond) {
          return false;
        }

        timestamps.push(now);
        return true;
      },

      /**
       * Wait until a request slot is available.
       * @returns {Promise<void>}
       */
      async waitForSlot() {
        while (!this.allow()) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      },
    };
  }
}

module.exports = Utils;
