'use strict';

/**
 * HMAC signer for the missav.ws Recombee search API.
 * The site uses HMAC-SHA1 signing with a frontend_timestamp and a hardcoded public token.
 */
class Signer {
  /**
   * @param {string} publicToken - The HMAC secret token from the site
   */
  constructor(publicToken) {
    this.publicToken = publicToken;
  }

  /**
   * Sign a request path for the missav API.
   * Mimics the site's `_sign_path` function which appends a timestamp
   * and computes an HMAC-SHA1 signature.
   *
   * @param {string} path - The API path to sign
   * @returns {{ path: string, timestamp: string, sign: string }} Signed path components
   */
  signPath(path) {
    const timestamp = Date.now().toString();
    const pathWithTimestamp = `${path}?frontend_timestamp=${timestamp}`;
    const sign = this._hmacSha1(pathWithTimestamp, this.publicToken);
    return {
      path: pathWithTimestamp,
      timestamp,
      sign,
    };
  }

  /**
   * Compute HMAC-SHA1 signature.
   * @param {string} data - Data to sign
   * @param {string} key - Secret key
   * @returns {string} Hex-encoded HMAC-SHA1 digest
   */
  _hmacSha1(data, key) {
    try {
      const crypto = require('crypto');
      return crypto.createHmac('sha1', key).update(data).digest('hex');
    } catch {
      // Fallback for environments without crypto
      const CryptoJS = require('crypto-js');
      return CryptoJS.HmacSHA1(data, key).toString(CryptoJS.enc.Hex);
    }
  }

  /**
   * Build a full signed URL for the search API.
   *
   * @param {string} baseUrl - Base URL of the site (e.g., https://missav.ws)
   * @param {string} path - API path
   * @returns {string} Full signed URL
   */
  buildSignedUrl(baseUrl, path) {
    const { path: signedPath, timestamp, sign } = this.signPath(path);
    return `${baseUrl}${signedPath}&frontend_sign=${sign}`;
  }
}

module.exports = Signer;
