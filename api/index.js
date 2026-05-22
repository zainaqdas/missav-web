'use strict';

/**
 * Vercel Serverless Entry Point
 *
 * Wraps the MissAV Scraper API Express app as a Vercel serverless function.
 * Environment variables (FLARESOLVERR_URL, SCRAPER_BACKEND, etc.) are set
 * in the Vercel dashboard under Settings → Environment Variables.
 */

const Server = require('../src/server');

// Create the server instance (initializes Express app, cache, services)
// Vercel injects FLARESOLVERR_URL and SCRAPER_BACKEND via environment variables
const server = new Server({
  verbose: process.env.VERCEL_ENV === 'production' ? false : !!process.env.VERBOSE,
});

// Export the Express app — Vercel detects Express and handles it natively
module.exports = server.app;
