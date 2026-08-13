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

  // Initialize and start the Firebase -> MongoDB real-time backup sync listener
  (async () => {
    try {
      const firebaseSyncService = require('./services/backup/firebaseSyncService');
      logger.info('[BackupSync] Starting real-time Firebase to MongoDB backup sync service...');
      await firebaseSyncService.startSyncListener();
    } catch (err) {
      logger.error('[BackupSync] Failed to start real-time backup sync service:', { message: err.message });
    }
  })();
});

// Handle server startup errors (e.g. port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`[SERVER ERROR] Port ${PORT} is already in use by another running Node process.`);
    logger.error(`[FIX] Stop other running backend instances or run: npx kill-port ${PORT}`);
    process.exit(1);
  } else {
    logger.error('[SERVER ERROR]', err);
    process.exit(1);
  }
});

// Graceful shutdown — save active session and finish open connections before exit
let shuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[PROCESS] ${signal} received; beginning graceful shutdown.`);
  logger.info(`${signal} received — shutting down gracefully...`);
  try {
    const firebaseSyncService = require('./services/backup/firebaseSyncService');
    firebaseSyncService.stopSyncListener();
  } catch (_) {}

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
process.on('exit', (code) => console.error(`[PROCESS] Exiting with code ${code}.`));

// Catch uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  logger.error('[PROCESS] Uncaught exception:', {
    message: err?.message,
    name: err?.name,
    stack: err?.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('[PROCESS] Unhandled rejection:', {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

module.exports = server;
