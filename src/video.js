'use strict';

const cheerio = require('cheerio');
const CONFIG = require('./config');
const Utils = require('./utils');

/**
 * Video page scraper - extracts video metadata and streaming URLs.
 */
class VideoScraper {
  /**
   * @param {import('./scraper')} scraper - Scraper instance
   * @param {object} cache - Cache instance (from Utils.createCache)
   */
  constructor(scraper, cache = null) {
    this.scraper = scraper;
    this.cache = cache;
  }

  /**
   * Scrape a single video page for all metadata.
   *
   * @param {string} videoId - Video ID (e.g., 'SSIS-406')
   * @returns {Promise<object>} Parsed video data
   */
  async getVideo(videoId) {
    const cacheKey = `video:${videoId}`;

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const path = `${CONFIG.EN}/${videoId}`;
    const response = await this.scraper.fetch(path);
    const html = response.data;
    const $ = cheerio.load(html);

    // Validate we actually got a video page
    const title = this._extractTitle($, html);
    const code = this._extractVideoCode($, html);

    if (!title && !code) {
      // Check if this is a 404/redirect page
      const pageTitle = $('title').text().toLowerCase();
      if (pageTitle.includes('not found') || pageTitle.includes('404') || pageTitle.includes('error')) {
        throw new Error(`Video '${videoId}' not found`);
      }
      // Some pages may have minimal info - still return what we can
    }

    const video = {
      id: videoId,
      title: title || code || videoId,
      code,
      description: this._extractDescription($, html),
      thumbnail: this._extractThumbnail($, html),
      publishDate: this._extractPublishDate($, html),
      duration: this._extractDuration($, html),
      genres: this._extractGenres($),
      actresses: this._extractActresses($),
      manufacturer: this._extractManufacturer($, html),
      series: this._extractSeries($, html),
      url: `${CONFIG.BASE_URL}${CONFIG.EN}/${videoId}`,
      streamingUrls: null,
      relatedVideos: this._extractRelatedVideos($, html, videoId),
    };

    // Cache the result
    if (this.cache) {
      this.cache.set(cacheKey, video);
    }

    return video;
  }

  /**
   * Extract M3U8 streaming URLs from a video page.
   */
  async getStreamingUrls(videoId) {
    const cacheKey = `stream:${videoId}`;

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const path = `${CONFIG.EN}/${videoId}`;
    const response = await this.scraper.fetch(path);
    const html = response.data;

    const m3u8Url = Utils.findM3u8Url(html);

    if (!m3u8Url) {
      return null;
    }

    // Try to fetch the m3u8 playlist for quality options
    let qualities = null;
    try {
      const headers = Utils.buildStreamHeaders(videoId);
      const playlistResp = await this.scraper.fetch(m3u8Url, {
        raw: true,
        headers,
      });
      const content = typeof playlistResp.data === 'string'
        ? playlistResp.data
        : playlistResp.data?.toString();
      qualities = Utils.parseM3u8Qualities(content, m3u8Url);
    } catch (err) {
      console.warn(`[VideoScraper] Could not fetch playlist qualities for ${videoId}: ${err.message}`);
    }

    const result = {
      url: m3u8Url,
      headers: Utils.buildStreamHeaders(videoId),
      qualities,
    };

    if (this.cache) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Get complete video data including streaming URLs.
   */
  async getVideoWithStreams(videoId) {
    const [video, streamInfo] = await Promise.all([
      this.getVideo(videoId),
      this.getStreamingUrls(videoId).catch(() => null),
    ]);
    video.streamingUrls = streamInfo;
    return video;
  }

  // ---- Private extraction methods ----

  _extractTitle($, html) {
    const match = html.match(CONFIG.REGEX.TITLE);
    if (match && match[1]) return match[1].trim();
    const title = $('h1').first().text().trim();
    if (title) return title;
    return $('meta[property="og:title"]').attr('content')?.trim() || '';
  }

  _extractVideoCode($, html) {
    const match = html.match(CONFIG.REGEX.VIDEO_CODE);
    if (match && match[1]) return match[1].trim();
    const spans = $('span.font-medium, span:contains("-")');
    for (let i = 0; i < spans.length; i++) {
      const text = $(spans[i]).text().trim();
      if (/^[A-Z0-9]+-\d+$/.test(text)) return text;
    }
    return '';
  }

  _extractThumbnail($, html) {
    const match = html.match(CONFIG.REGEX.THUMBNAIL);
    if (match && match[1]) return match[1].trim();
    return $('meta[property="og:image"]').attr('content')?.trim() || '';
  }

  _extractPublishDate($, html) {
    const match = html.match(CONFIG.REGEX.PUBLISH_DATE);
    if (match && match[1]) return match[1].trim();
    return $('time').first().text().trim();
  }

  _extractDescription($, html) {
    const match = html.match(CONFIG.REGEX.DESCRIPTION);
    if (match && match[1]) return match[1].trim();
    return $('meta[property="og:description"]').attr('content')?.trim() || '';
  }

  _extractDuration($, html) {
    const bodyText = $('body').text();
    const durationMatch = bodyText.match(/(\d+)\s*(?:min|minutes|мин)/i);
    if (durationMatch) return parseInt(durationMatch[1], 10);
    return null;
  }

  _extractGenres($) {
    const genres = [];
    $(CONFIG.SELECTORS.GENRE_TAGS).each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const slug = href.split('/genres/')?.[1]?.replace(/\/$/, '') || '';
      if (name) {
        genres.push({ name, slug, url: href });
      }
    });
    return genres;
  }

  _extractActresses($) {
    const actresses = [];
    $(CONFIG.SELECTORS.ACTRESS_LINKS).each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const slug = href.split('/actresses/')?.[1]?.replace(/\/$/, '') || '';
      if (name) {
        actresses.push({ name, slug, url: href });
      }
    });
    return actresses;
  }

  _extractManufacturer($, html) {
    const bodyText = $('body').text();
    const match = bodyText.match(/(?:manufacturer|studio|maker|制作)\s*:?\s*([^\n]+)/i);
    return match?.[1]?.trim() || '';
  }

  _extractSeries($, html) {
    const bodyText = $('body').text();
    const match = bodyText.match(/(?:series|シリーズ)\s*:?\s*([^\n]+)/i);
    return match?.[1]?.trim() || '';
  }

  _extractRelatedVideos($, html, currentVideoId) {
    const videos = [];
    const seen = new Set();

    $(`a[href^="${CONFIG.EN}/"]`).each((i, el) => {
      if (videos.length >= 30) return false;
      const href = $(el).attr('href') || '';
      const idMatch = href.match(/\/en\/([A-Za-z0-9-]+)/);
      if (!idMatch) return;

      const id = idMatch[1];
      if (id === currentVideoId || seen.has(id)) return;
      if (id.includes('genres') || id.includes('actresses') || id.includes('search') || id.includes('/')) return;

      seen.add(id);
      const img = $(el).find('img').first();
      const title = $(el).find('[class*="text-nord6"], [class*="title"]').first().text().trim()
        || img.attr('alt') || '';
      const thumbnail = img.attr('src') || '';
      const durationEl = $(el).find('[class*="duration"], [class*="time"]').first().text().trim();
      const duration = durationEl.match(/\d+:\d+/)?.[0] || '';

      videos.push({
        id, title, thumbnail, duration,
        url: `${CONFIG.BASE_URL}${href}`,
      });
    });

    return videos;
  }
}

module.exports = VideoScraper;
