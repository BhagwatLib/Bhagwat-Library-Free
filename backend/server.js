/**
 * server.js - Production entrypoint
 *
 * Separates Express app configuration (app.js) from the HTTP server startup.
 * This allows app.js to be imported in tests without binding a port.
 *
 * Start: npm start (node server.js)
 * Dev:   npm run dev (nodemon server.js)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`🚀 Bhagwat Library Backend running on ${HOST}:${PORT}`);
  logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Health Check: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`);
});

// Graceful shutdown — finish open connections before exit
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

// Catch uncaught exceptions — log and exit so the process manager can restart
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — forcing process restart', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason: String(reason) });
  process.exit(1);
});

module.exports = server;
