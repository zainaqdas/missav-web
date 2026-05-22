'use strict';

const CONFIG = {
  // Base URL for the target website
  BASE_URL: 'https://missav.ws',
  EN: '/en',

  // The HMAC public token extracted from the site's JS - used for API signing
  PUBLIC_TOKEN: 'Ikkg568nlM51RHvldlPvc2GzZPE9R4XGzaH9Qj4zK9npbbbTly1gj9K4mgRn0QlV',

  // Recombee search API endpoint
  SEARCH_API_PATH: '/search/users/anonymous/items/',

  // Default headers to mimic a real browser
  HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },

  // Regex patterns for scraping
  REGEX: {
    // Video page patterns
    TITLE: /<h1[^>]*class="[^"]*text-base[^"]*lg:text-lg[^"]*text-nord6[^"]*"[^>]*>([^<]+)<\/h1>/i,
    VIDEO_CODE: /<span[^>]*class="[^"]*font-medium[^"]*"[^>]*>([^<]+)<\/span>/i,
    PUBLISH_DATE: /<time[^>]*class="[^"]*font-medium[^"]*"[^>]*>([^<]+)<\/time>/i,
    THUMBNAIL: /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*\/?>/i,
    DESCRIPTION: /<meta[^>]*property="og:description"[^>]*content="([^"]+)"[^>]*\/?>/i,
    // m3u8 extraction - looks for the obfuscated m3u8 URL in JavaScript
    M3U8_JS: /'m3u8(.*?)video/i,
    // Video page URL pattern
    VIDEO_ID: /\/en\/([^\/\?]+)/,
  },

  // Selectors for Cheerio-based parsing
  SELECTORS: {
    // Video page
    VIDEO_TITLE: 'h1.text-base.text-nord6, h1:contains("text-nord6")',
    VIDEO_INFO_ITEMS: '.space-y-2 .text-secondary, [class*="text-secondary"]',
    GENRE_TAGS: 'a[href*="/en/genres/"]',
    ACTRESS_LINKS: 'a[href*="/en/actresses/"]',
    RELATED_VIDEOS: 'a[href*="/en/"][href*="-"]',
    VIDEO_CARD: '[class*="group"] a[href*="/en/"]',
    VIDEO_CARD_IMG: 'img[alt]',
    VIDEO_CARD_TITLE: '[class*="text-nord6"]',
    VIDEO_CARD_DURATION: '[class*="duration"], [class*="time"]',

    // Homepage sections
    LATEST_VIDEOS: '[class*="grid"] a[href*="/en/"]',
    CATEGORY_LINKS: 'a[href*="/en/genres/"]',

    // Search results
    SEARCH_RESULTS: '[class*="grid"] a[href*="/en/"]',

    // Actress page
    ACTRESS_GRID: 'a[href*="/en/actresses/"] img[alt]',
    ACTRESS_NAME: 'img[alt]',

    // Pagination
    NEXT_PAGE: 'a[rel="next"], a:contains("Next"), .pagination a:last-child',
    PAGE_INFO: '[class*="pagination"], [class*="page"]',
  },

  // CSS classes commonly used in the site (for Cheerio)
  CSS_CLASSES: {
    CONTAINER: '[class*="container"]',
    GRID: '[class*="grid"]',
    VIDEO_LINK: 'a[href*="/en/"]',
  },

  // Default timeout for HTTP requests
  TIMEOUT: 30000,

  // Cache TTL in seconds
  CACHE_TTL: 300,
};

module.exports = CONFIG;
