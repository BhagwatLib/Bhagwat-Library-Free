'use strict';

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

let mongoStoreInstance = null;

/**
 * Returns configured session name
 */
function getSessionName() {
  return process.env.SESSION_NAME || 'library-session';
}

/**
 * Robust MongoDB Store implementation for whatsapp-web.js RemoteAuth.
 * Resolves the path mismatch where RemoteAuth saves to .wwebjs_auth/ but wwebjs-mongo looks in process.cwd().
 */
class RobustMongoStore {
  constructor({ mongoose: mongooseInstance } = {}) {
    if (!mongooseInstance) {
      throw new Error('A valid Mongoose instance is required for MongoStore.');
    }
    this.mongoose = mongooseInstance;
  }

  async sessionExists(options) {
    const sessionName = options.session;
    try {
      const db = this.mongoose.connection.db;
      if (!db) return false;
      const filesCollection = db.collection(`whatsapp-${sessionName}.files`);
      const count = await filesCollection.countDocuments({ filename: `${sessionName}.zip` });
      return count > 0;
    } catch (err) {
      logger.error(`[RemoteAuth] Error checking session existence for ${sessionName}:`, err.message);
      return false;
    }
  }

  async save(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, {
      bucketName: `whatsapp-${sessionName}`,
    });

    // Resolve zip file location dynamically
    const candidatePaths = [
      options.path,
      path.join(process.cwd(), '.wwebjs_auth', `${sessionName}.zip`),
      path.join(__dirname, '../../.wwebjs_auth', `${sessionName}.zip`),
      path.join(process.cwd(), `${sessionName}.zip`),
    ].filter(Boolean);

    let zipPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        zipPath = p;
        break;
      }
    }

    if (!zipPath) {
      throw new Error(`[RemoteAuth] Cannot find session zip file for "${sessionName}". Checked candidate paths: ${candidatePaths.join(', ')}`);
    }

    const fileSize = fs.statSync(zipPath).size;
    logger.info(`[RemoteAuth] Uploading session zip (${(fileSize / 1024 / 1024).toFixed(2)} MB) from ${zipPath} to MongoDB GridFS (bucket: whatsapp-${sessionName})...`);

    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(zipPath);
      const uploadStream = bucket.openUploadStream(`${sessionName}.zip`);

      readStream
        .pipe(uploadStream)
        .on('error', (err) => {
          logger.error('[RemoteAuth] Error piping zip stream to GridFS:', err);
          reject(err);
        })
        .on('finish', () => {
          logger.info(`[RemoteAuth] Session zip successfully written to MongoDB GridFS.`);
          resolve();
        });
    });

    // Delete older sessions in this bucket so only the latest valid session is retained
    try {
      const documents = await bucket.find({ filename: `${sessionName}.zip` }).toArray();
      if (documents.length > 1) {
        documents.sort((a, b) => new Date(a.uploadDate) - new Date(b.uploadDate));
        const oldDocs = documents.slice(0, documents.length - 1);
        for (const oldDoc of oldDocs) {
          await bucket.delete(oldDoc._id).catch(() => {});
        }
        logger.info(`[RemoteAuth] Cleaned up ${oldDocs.length} older session backup(s) from MongoDB.`);
      }
    } catch (cleanErr) {
      logger.warn('[RemoteAuth] Notice during old session cleanup:', cleanErr.message);
    }
  }

  async extract(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, {
      bucketName: `whatsapp-${sessionName}`,
    });

    const targetPath = options.path;
    logger.info(`[RemoteAuth] Downloading session zip from MongoDB GridFS into ${targetPath}...`);

    // Ensure parent directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStreamByName(`${sessionName}.zip`);
      const writeStream = fs.createWriteStream(targetPath);

      downloadStream
        .pipe(writeStream)
        .on('error', (err) => {
          logger.error('[RemoteAuth] Error downloading session zip from GridFS:', err);
          reject(err);
        })
        .on('finish', () => {
          logger.info('[RemoteAuth] Session zip download complete.');
          resolve();
        });
    });
  }

  async delete(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, {
      bucketName: `whatsapp-${sessionName}`,
    });

    try {
      const documents = await bucket.find({ filename: `${sessionName}.zip` }).toArray();
      for (const doc of documents) {
        await bucket.delete(doc._id).catch(() => {});
      }
      logger.info(`[RemoteAuth] Deleted ${documents.length} session file(s) for "${sessionName}" from MongoDB.`);
    } catch (err) {
      logger.warn(`[RemoteAuth] Notice deleting session files for ${sessionName}:`, err.message);
    }
  }

  async inspectSession(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const filesCollection = db.collection(`whatsapp-${sessionName}.files`);
    const chunksCollection = db.collection(`whatsapp-${sessionName}.chunks`);

    const files = await filesCollection.find().toArray();
    const chunkCount = await chunksCollection.countDocuments();

    return {
      bucketName: `whatsapp-${sessionName}`,
      filesCount: files.length,
      chunksCount: chunkCount,
      files: files.map((f) => ({
        id: f._id,
        filename: f.filename,
        length: f.length,
        uploadDate: f.uploadDate,
      })),
    };
  }
}

/**
 * Validates MONGODB_URI, connects Mongoose/MongoDB, creates and returns RobustMongoStore.
 */
async function connectAndGetStore() {
  const uri = process.env.MONGODB_URI;

  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    const errMsg = '[RemoteAuth] MONGODB_URI is not configured in environment variables. Remote session storage requires a valid MongoDB connection string.';
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  const cleanUri = uri.trim();

  if (mongoose.connection.readyState === 1 && mongoStoreInstance) {
    return mongoStoreInstance;
  }

  logger.info('[RemoteAuth] Connecting to MongoDB...');
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

    mongoStoreInstance = new RobustMongoStore({ mongoose });
    logger.info(`[RemoteAuth] RobustMongoStore created successfully for session "${getSessionName()}".`);

    return mongoStoreInstance;
  } catch (err) {
    logger.error('[RemoteAuth] MongoDB connection failed:', {
      name: err.name,
      message: err.message,
    });

    if (err.message && err.message.includes('bad auth')) {
      logger.error('[RemoteAuth] HINT: "bad auth: authentication failed" means credentials in MONGODB_URI are incorrect or contain unencoded special characters.');
    }

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
 * Inspects MongoDB GridFS collections and returns diagnostic metadata
 */
async function inspectSessionDetails(customSessionName) {
  try {
    const store = await connectAndGetStore();
    const targetSession = customSessionName || getSessionName();
    const sessionDirName = `RemoteAuth-${targetSession}`;
    return await store.inspectSession({ session: sessionDirName });
  } catch (err) {
    logger.error('[RemoteAuth] Error inspecting session in MongoDB:', { message: err.message });
    return null;
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
  inspectSessionDetails,
  deleteSession,
  getSessionName,
  getStoreInstance: () => mongoStoreInstance,
  RobustMongoStore,
};
