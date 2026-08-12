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

  // Auto-restore existing WhatsApp session on server boot
  (async () => {
    try {
      if (process.env.MONGODB_URI) {
        const sessionStore = require('./services/whatsapp/sessionStore');
        const whatsappService = require('./services/whatsappService');
        logger.info('[RemoteAuth] Checking for existing WhatsApp session in MongoDB on startup...');
        const hasSession = await sessionStore.sessionExists();
        if (hasSession) {
          logger.info('[RemoteAuth] Found existing session in MongoDB. Restoring RemoteAuth session...');
          whatsappService.startClient().catch((err) => {
            logger.error('[RemoteAuth] Auto-restore session error on startup:', { message: err.message });
          });
        } else {
          logger.info('[RemoteAuth] No session found in MongoDB. QR scan will be required when requested.');
        }
      }
    } catch (err) {
      logger.warn('[RemoteAuth] Startup session check notice:', { message: err.message });
    }
  })();
});

// Graceful shutdown — save active session and finish open connections before exit
async function handleGracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  try {
    const whatsappService = require('./services/whatsappService');
    await whatsappService.persistSessionBeforeExit();
  } catch (_) {}

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Log fatal exceptions, then allow Node/process manager to restart a clean
// worker instead of continuing with a corrupted Puppeteer session.
process.on('uncaughtExceptionMonitor', (err) => {
  console.error('[PROCESS CRITICAL] Uncaught exception:', err);
  logger.error('[PROCESS] Uncaught exception:', {
    message: err?.message,
    name: err?.name,
    stack: err?.stack,
  });
});

module.exports = server;
