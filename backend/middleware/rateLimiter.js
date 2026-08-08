const logger = require('../utils/logger');

// Simple in-memory store for rate limiting
const ipRequestMap = new Map();

// Configuration: 100 requests per 15 minutes per IP
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

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
    logger.warn(`Rate limit exceeded for IP: ${ip}`, { ip, count: clientData.count });
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
  }

  next();
}

module.exports = rateLimiter;
