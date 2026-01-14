/**
 * Metrics HTTP Endpoint
 *
 * Simple HTTP endpoint to expose metrics as JSON.
 * Can be integrated into Express, Next.js, or standalone HTTP server.
 *
 * Usage (Express):
 *   app.get('/metrics', metricsHandler);
 *
 * Usage (Next.js API route):
 *   export async function GET(request) {
 *     return metricsHandler(request);
 *   }
 *
 * Usage (Standalone HTTP):
 *   http.createServer((req, res) => {
 *     if (req.url === '/metrics') {
 *       metricsHandler(req, res);
 *     }
 *   });
 */

import { getMetricsSummary } from './metrics.js';

/**
 * Handle metrics request
 *
 * @param {object} request - HTTP request object
 * @param {object} response - HTTP response object (optional, for Express)
 * @returns {object|void} - Response object (for Next.js) or void (for Express)
 */
export function metricsHandler(request, response) {
  try {
    // Parse query parameters
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const sinceMs = url.searchParams.get('since');
    
    const options = {};
    if (sinceMs) {
      const since = parseInt(sinceMs, 10);
      if (!isNaN(since)) {
        options.sinceMs = Date.now() - since;
      }
    }
    
    // Get metrics summary
    const summary = getMetricsSummary(options);
    
    // Format response
    const jsonResponse = {
      status: 'ok',
      metrics: summary
    };
    
    // Handle different frameworks
    if (response) {
      // Express-style
      response.setHeader('Content-Type', 'application/json');
      response.status(200).json(jsonResponse);
    } else {
      // Next.js-style (return Response object)
      return new Response(JSON.stringify(jsonResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    const errorResponse = {
      status: 'error',
      error: error.message
    };
    
    if (response) {
      response.setHeader('Content-Type', 'application/json');
      response.status(500).json(errorResponse);
    } else {
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  }
}

/**
 * Create Next.js API route handler
 *
 * @param {Request} request - Next.js Request object
 * @returns {Promise<Response>} - Next.js Response object
 */
export async function GET(request) {
  return metricsHandler(request);
}
