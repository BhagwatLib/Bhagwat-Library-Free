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
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins (plug-and-play for frontend client integration)
app.use(cors({ origin: '*' }));

// Request body parsing with payload limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static route to serve generated invoice PDFs from the local uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root status check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Library Management System API is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Middleware for API Key verification (optional, activated if API_KEY is set in .env)
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

// Apply rate limiting middleware to protect endpoints
app.use('/api', rateLimiter);

// Mount API routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/reminders', reminderRoutes);

// Catch-all 404 handler for unmatched routes
app.use((req, res, next) => {
  const error = new Error(`Route Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Centralized error handling middleware
app.use(errorHandler);

// Start Scheduler on app startup
schedulerService.initScheduler();

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server successfully started on port ${PORT}`);
  });
}

module.exports = app;

