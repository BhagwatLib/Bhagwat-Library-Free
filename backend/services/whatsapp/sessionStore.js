'use strict';

const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const logger = require('../../utils/logger');

let mongoStoreInstance = null;

/**
 * Returns configured session name
 */
function getSessionName() {
  return process.env.SESSION_NAME || 'library-session';
}

/**
 * Validates MONGODB_URI, connects Mongoose/MongoDB, creates and returns MongoStore.
 * Throws an explicit error if MongoDB fails to connect so startup does NOT proceed silently.
 */
async function connectAndGetStore() {
  const uri = process.env.MONGODB_URI;

  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    const errMsg = '[RemoteAuth] MONGODB_URI is not configured in environment variables. Remote session storage requires a valid MongoDB connection string.';
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  const cleanUri = uri.trim();

  // If already connected and store is created, return cached instance
  if (mongoose.connection.readyState === 1 && mongoStoreInstance) {
    return mongoStoreInstance;
  }

  logger.info('[RemoteAuth] Connecting to MongoDB...');
  // Mask credentials in logs for security
  const maskedUri = cleanUri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)/, '$1******$3');
  logger.info(`[RemoteAuth] Target MongoDB: ${maskedUri}`);

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(cleanUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      });
    }

    logger.info('[RemoteAuth] MongoDB connection established successfully.');

    // Create MongoStore instance with verified Mongoose connection
    mongoStoreInstance = new MongoStore({ mongoose });
    logger.info(`[RemoteAuth] MongoStore created successfully for session "${getSessionName()}".`);

    return mongoStoreInstance;
  } catch (err) {
    logger.error('[RemoteAuth] MongoDB connection failed:', {
      name: err.name,
      message: err.message,
    });

    if (err.message && err.message.includes('bad auth')) {
      logger.error('[RemoteAuth] HINT: "bad auth: authentication failed" means the username or password in MONGODB_URI is incorrect or contains unencoded special characters. In MongoDB connection strings, special characters like @, :, /, ?, # in passwords must be URL-encoded (e.g., %40 for @, %23 for #).');
    }

    // Reset state
    mongoStoreInstance = null;
    throw err;
  }
}

/**
 * Checks if a saved remote session exists in MongoDB
 */
async function sessionExists(customSessionName) {
  try {
    const store = await connectAndGetStore();
    const targetSession = customSessionName || getSessionName();
    const sessionDirName = `RemoteAuth-${targetSession}`;
    const exists = await store.sessionExists({ session: sessionDirName });
    logger.info(`[RemoteAuth] Checking remote session "${sessionDirName}" in MongoDB: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    return Boolean(exists);
  } catch (err) {
    logger.error('[RemoteAuth] Error checking session existence in MongoDB:', { message: err.message });
    throw err;
  }
}

/**
 * Deletes remote session from MongoDB
 */
async function deleteSession(customSessionName) {
  try {
    const store = await connectAndGetStore();
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
  connectAndGetStore,
  initSessionStore: connectAndGetStore,
  sessionExists,
  deleteSession,
  getSessionName,
  getStoreInstance: () => mongoStoreInstance,
};
