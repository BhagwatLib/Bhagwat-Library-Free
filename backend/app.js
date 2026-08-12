/**
 * app.js - Express application factory
 *
 * Configures middleware, routes, and error handling.
 * HTTP server binding is done in server.js to keep this testable in isolation.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const logger = require('./utils/logger');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const whatsappRoutes = require('./routes/whatsapp');
const invoiceRoutes = require('./routes/invoice');
const reminderRoutes = require('./routes/reminders');
const schedulerService = require('./services/schedulerService');

const app = express();

// ---------------------------------------------------------------------------
// CORS Configuration & Dynamic Whitelist
// Explicitly supports Vercel production & preview, Cloudflare Tunnel, and Localhost
// ---------------------------------------------------------------------------
const rawOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawOrigins
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const clean = origin.trim().replace(/\/+$/, '').toLowerCase();

  // 1. Explicitly configured origins from .env
  if (allowedOrigins.some((o) => o.toLowerCase() === clean || o === '*')) {
    return true;
  }

  // 2. All Vercel deployments (production + preview domains)
  if (/^https:\/\/[a-z0-9-_.]+\.vercel\.app$/i.test(clean)) {
    return true;
  }

  // 3. All Cloudflare Tunnel hostnames
  if (/^https:\/\/[a-z0-9-_.]+\.trycloudflare\.com$/i.test(clean)) {
    return true;
  }

  // 4. Localhost and local network IPs
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(clean)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    logger.warn(`[CORS Notice] Blocked request from origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Range',
    'Cache-Control',
    'Pragma',
  ],
  exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Type'],
  maxAge: 86400,
};

// ---------------------------------------------------------------------------
// Global Preflight & CORS Safety Middleware
// Ensures every request and response (including errors) has proper CORS headers
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, Accept, Origin, X-Requested-With');
  }

  // Log incoming requests with origin and IP
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logger.info(`[HTTP ${req.method}] ${req.originalUrl || req.url} | Origin: ${origin || 'none'} | IP: ${ip}`);

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// ---------------------------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// Trust proxy headers (for Cloudflare Tunnel / reverse proxy)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Static — serve generated invoice PDFs
// ---------------------------------------------------------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------------------------------------------------------
// Root status endpoint
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bhagwat Library Backend Running 🚀',
  });
});

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Bhagwat Library Backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Optional API Key middleware (activated only when API_KEY is set in .env)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const apiKey = process.env.API_KEY;
  if (apiKey && apiKey !== 'your_optional_api_key_here') {
    const clientKey = req.headers['x-api-key'] || req.query.apiKey;
    if (clientKey !== apiKey) {
      logger.warn(`Unauthorized access attempt to: ${req.originalUrl}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid API Key',
      });
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
app.use('/api', rateLimiter);

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/reminders', reminderRoutes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const error = new Error(`Route Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// ---------------------------------------------------------------------------
// Centralized error handler
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start background scheduler
// ---------------------------------------------------------------------------
schedulerService.initScheduler();

logger.info(`App configured | NODE_ENV=${process.env.NODE_ENV || 'development'}`);

module.exports = app;
