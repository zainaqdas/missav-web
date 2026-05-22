'use strict';

const CONFIG = require('./config');
const Utils = require('./utils');

/**
 * Video stream resolver - resolves m3u8 streaming URLs with quality selection.
 */
class StreamResolver {
  /**
   * @param {import('./scraper')} scraper - Scraper instance
   * @param {object} cache - Cache instance
   */
  constructor(scraper, cache = null) {
    this.scraper = scraper;
    this.cache = cache;
  }

  /**
   * Resolve streaming URLs for a video.
   *
   * @param {string} videoId - Video ID
   * @param {object} options - Options
   * @param {string} options.quality - Desired quality ('best', '720p', '1080p', 'all')
   * @returns {Promise<object>} Resolved stream info
   */
  async resolve(videoId, options = {}) {
    const quality = options.quality || 'best';
    const cacheKey = `stream:${videoId}:${quality}`;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Extract the master m3u8 URL from the video page
    const masterUrl = await this._extractMasterPlaylist(videoId);

    if (!masterUrl) {
      return { success: false, error: 'Could not extract streaming URL', videoId };
    }

    const headers = Utils.buildStreamHeaders(videoId);

    // Try to resolve specific quality if requested
    if (quality !== 'best' && quality !== 'all') {
      try {
        const specificStream = await this._resolveQuality(masterUrl, quality, headers);
        if (specificStream) {
          const result = {
            success: true,
            videoId,
            quality: specificStream.label,
            resolution: specificStream.resolution,
            url: specificStream.url,
            masterUrl,
            headers,
          };
          if (this.cache) this.cache.set(cacheKey, result);
          return result;
        }
      } catch (err) {
        console.warn(`[StreamResolver] Quality resolution failed: ${err.message}`);
      }
    }

    // Fetch all qualities if requested
    if (quality === 'all') {
      try {
        const playlistResp = await this.scraper.fetch(masterUrl, { raw: true, headers });
        const content = typeof playlistResp.data === 'string'
          ? playlistResp.data
          : playlistResp.data?.toString();
        const qualities = Utils.parseM3u8Qualities(content, masterUrl);
        if (qualities) {
          const result = {
            success: true,
            videoId,
            quality: 'all',
            qualities,
            masterUrl,
            headers,
          };
          if (this.cache) this.cache.set(cacheKey, result);
          return result;
        }
      } catch {
        // Fall through to return master
      }
    }

    const result = {
      success: true,
      videoId,
      quality: 'master',
      url: masterUrl,
      headers,
    };

    if (this.cache) this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Extract the master m3u8 playlist URL from the video page.
   */
  async _extractMasterPlaylist(videoId) {
    const path = `${CONFIG.EN}/${videoId}`;
    const response = await this.scraper.fetch(path);
    const html = response.data;

    return Utils.findM3u8Url(html);
  }

  /**
   * Resolve a specific quality from an m3u8 master playlist.
   */
  async _resolveQuality(masterUrl, targetQuality, headers) {
    const response = await this.scraper.fetch(masterUrl, {
      raw: true,
      headers,
    });

    const content = typeof response.data === 'string'
      ? response.data
      : response.data?.toString();

    const qualities = Utils.parseM3u8Qualities(content, masterUrl);
    if (!qualities || qualities.length === 0) return null;

    // Parse target quality (e.g., '720p' -> 720)
    const targetHeight = parseInt(targetQuality, 10);

    if (!isNaN(targetHeight)) {
      // Find closest match
      const sorted = [...qualities].sort((a, b) => a.height - b.height);
      return sorted.reduce((prev, curr) =>
        Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
      );
    }

    // Return highest quality
    return qualities[0];
  }
}

module.exports = StreamResolver;
