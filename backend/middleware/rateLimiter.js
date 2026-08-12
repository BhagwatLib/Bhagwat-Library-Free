const logger = require('../utils/logger');

// Simple in-memory store for rate limiting
const ipRequestMap = new Map();

// Configuration: 100 requests per 15 minutes per IP for general endpoints
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;
const MAX_TRACKED_IPS = 10000;

// Excluded paths: Real-time WhatsApp status polling, SSE event stream, QR checks, and health probes
const EXCLUDED_PATTERNS = [
  /^\/api\/whatsapp\/status/,
  /^\/api\/whatsapp\/events/,
  /^\/api\/whatsapp\/qr/,
  /^\/health/,
  /^\/$/,
];

function rateLimiter(req, res, next) {
  const reqPath = req.originalUrl || req.url || '';

  // Exclude WhatsApp real-time polling and event streaming from the global rate limiter
  if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(reqPath))) {
    return next();
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (ipRequestMap.size >= MAX_TRACKED_IPS) {
    for (const [trackedIp, data] of ipRequestMap) {
      if (now - data.startTime > WINDOW_MS) ipRequestMap.delete(trackedIp);
    }
  }

  let clientData = ipRequestMap.get(ip);

  if (!clientData) {
    clientData = {
      startTime: now,
      count: 0,
    };
    ipRequestMap.set(ip, clientData);
  }

  // Reset window if it has expired
  if (now - clientData.startTime > WINDOW_MS) {
    clientData.startTime = now;
    clientData.count = 0;
  }

  clientData.count++;

  if (clientData.count > MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for IP: ${ip} on path: ${reqPath}`, {
      method: req.method,
      path: reqPath,
      ip,
      count: clientData.count,
      timestamp: new Date().toISOString(),
    });
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
  }

  next();
}

module.exports = rateLimiter;
