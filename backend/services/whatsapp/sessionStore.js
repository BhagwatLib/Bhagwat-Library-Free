'use strict';

const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const logger = require('../../utils/logger');

let storeInstance = null;

/**
 * Returns configured session name
 */
function getSessionName() {
  return process.env.SESSION_NAME || 'library-session';
}

/**
 * Connects to MongoDB via Mongoose and returns a configured MongoStore instance
 */
async function initSessionStore() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.warn('[RemoteAuth] MONGODB_URI environment variable is not defined! Running without remote MongoDB persistence.');
    return null;
  }

  try {
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
      logger.info('[RemoteAuth] Connecting to MongoDB for WhatsApp session store...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
      });
      logger.info('[RemoteAuth] MongoDB connected successfully for WhatsApp session storage.');
    }

    if (!storeInstance) {
      storeInstance = new MongoStore({ mongoose });
      logger.info(`[RemoteAuth] MongoStore initialized for session clientId: "${getSessionName()}".`);
    }

    return storeInstance;
  } catch (err) {
    logger.error('[RemoteAuth] Error initializing MongoStore with MongoDB:', {
      message: err.message,
      stack: err.stack,
    });
    return null;
  }
}

/**
 * Checks if a saved remote session exists in MongoDB
 */
async function sessionExists(customSessionName) {
  try {
    const store = await initSessionStore();
    if (!store) return false;

    const targetSession = customSessionName || getSessionName();
    const sessionDirName = `RemoteAuth-${targetSession}`;
    const exists = await store.sessionExists({ session: sessionDirName });
    logger.info(`[RemoteAuth] Checking remote session "${sessionDirName}" in MongoDB: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    return Boolean(exists);
  } catch (err) {
    logger.error('[RemoteAuth] Error checking session existence in MongoDB:', { message: err.message });
    return false;
  }
}

/**
 * Deletes remote session from MongoDB
 */
async function deleteSession(customSessionName) {
  try {
    const store = await initSessionStore();
    if (!store) return false;

    const targetSession = customSessionName || getSessionName();
    const sessionDirName = `RemoteAuth-${targetSession}`;
    await store.delete({ session: sessionDirName });
    logger.info(`[RemoteAuth] Session deleted: "${sessionDirName}" from MongoDB.`);
    return true;
  } catch (err) {
    logger.error('[RemoteAuth] Error deleting session from MongoDB:', { message: err.message });
    return false;
  }
}

module.exports = {
  initSessionStore,
  sessionExists,
  deleteSession,
  getSessionName,
  getStoreInstance: () => storeInstance,
};
