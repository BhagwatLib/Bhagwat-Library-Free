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
// CORS — read allowed origins from environment variable
// ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
// If not set, defaults to allow all origins in development only.
// ---------------------------------------------------------------------------
const rawOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, mobile, curl)
    if (!origin) return callback(null, true);

    // If no whitelist configured, allow all (useful for open dev environments)
    if (allowedOrigins.length === 0) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error(`CORS policy: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pre-flight for all routes

// ---------------------------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// Trust proxy headers (important for Koyeb / Render / Railway behind load balancer)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Static — serve generated invoice PDFs
// ---------------------------------------------------------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------------------------------------------------------
// Health check — required by Koyeb and other platforms
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
