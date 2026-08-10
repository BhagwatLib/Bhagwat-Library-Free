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
      if (!db) {
        logger.warn(`[RemoteAuth] MongoDB connection is not active when checking session "${sessionName}".`);
        return false;
      }

      const dbName = db.databaseName || this.mongoose.connection.name;
      const collectionName = `whatsapp-${sessionName}.files`;
      const filesCollection = db.collection(collectionName);

      logger.info(`[RemoteAuth] Checking session existence in Database: "${dbName}" | Collection: "${collectionName}"...`);
      const existingDoc = await filesCollection.findOne({ filename: `${sessionName}.zip` });

      if (existingDoc) {
        logger.info(`[RemoteAuth] Session found: Document exists in MongoDB!`, {
          database: dbName,
          collection: collectionName,
          documentId: existingDoc._id,
          filename: existingDoc.filename,
          length: `${(existingDoc.length / 1024 / 1024).toFixed(2)} MB`,
          uploadDate: existingDoc.uploadDate,
        });
        return true;
      } else {
        logger.info(`[RemoteAuth] No session found: No document with filename "${sessionName}.zip" in Database: "${dbName}", Collection: "${collectionName}".`);
        return false;
      }
    } catch (err) {
      logger.error(`[RemoteAuth] Error checking session existence for ${sessionName}:`, {
        message: err.message,
        stack: err.stack,
      });
      return false;
    }
  }

  async save(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    if (!db) {
      throw new Error('[RemoteAuth] Cannot save session: MongoDB connection is not active.');
    }

    const dbName = db.databaseName || this.mongoose.connection.name;
    const bucketName = `whatsapp-${sessionName}`;
    const collectionName = `${bucketName}.files`;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, { bucketName });

    logger.info(`[RemoteAuth] === Initiating Session Save to MongoDB ===`);
    logger.info(`[RemoteAuth] Target Database: "${dbName}"`);
    logger.info(`[RemoteAuth] Target GridFS Bucket: "${bucketName}" (Collections: "${collectionName}", "${bucketName}.chunks")`);

    // Dynamically locate the zip file created by RemoteAuth.compressSession()
    const candidatePaths = [
      options.path,
      path.resolve('.wwebjs_auth', `${sessionName}.zip`),
      path.resolve(process.cwd(), '.wwebjs_auth', `${sessionName}.zip`),
      path.resolve(__dirname, '../../.wwebjs_auth', `${sessionName}.zip`),
      path.resolve(__dirname, '../../../.wwebjs_auth', `${sessionName}.zip`),
      path.resolve(process.cwd(), `${sessionName}.zip`),
      path.resolve(`${sessionName}.zip`),
    ].filter(Boolean);

    let zipPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        zipPath = p;
        break;
      }
    }

    // Fallback: search recursively inside any .wwebjs_auth directory
    if (!zipPath) {
      const searchDirs = [
        path.resolve('.wwebjs_auth'),
        path.resolve(process.cwd(), '.wwebjs_auth'),
        path.resolve(__dirname, '../../.wwebjs_auth'),
      ];
      for (const sDir of searchDirs) {
        if (fs.existsSync(sDir)) {
          try {
            const files = fs.readdirSync(sDir);
            const match = files.find((f) => f.endsWith('.zip') && f.includes(sessionName));
            if (match) {
              zipPath = path.join(sDir, match);
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!zipPath) {
      const err = new Error(`[RemoteAuth] Cannot find session zip file for "${sessionName}". Searched paths: ${candidatePaths.join(', ')}`);
      logger.error('[RemoteAuth] Session upload aborted: Local ZIP file not found.', { error: err.message });
      throw err;
    }

    const fileSize = fs.statSync(zipPath).size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    logger.info(`[RemoteAuth] Local session zip found at "${zipPath}" (${fileSizeMB} MB). Uploading to GridFS bucket "${bucketName}"...`);

    try {
      const uploadStream = bucket.openUploadStream(`${sessionName}.zip`, {
        metadata: {
          sessionName,
          uploadedAt: new Date().toISOString(),
          app: 'bhagwat-library',
        },
      });

      const insertedDocId = uploadStream.id;

      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(zipPath);

        readStream
          .pipe(uploadStream)
          .on('error', (err) => {
            logger.error('[RemoteAuth] Error streaming session zip to MongoDB GridFS:', err);
            reject(err);
          })
          .on('finish', () => {
            logger.info(`[RemoteAuth] Session zip write stream finished for document ID: ${insertedDocId}`);
            resolve();
          });
      });

      // Query and verify the document was actually saved in MongoDB
      const filesCollection = db.collection(collectionName);
      const savedDoc = await filesCollection.findOne({ _id: insertedDocId });

      if (savedDoc) {
        logger.info(`[RemoteAuth] ✅ RemoteAuth session successfully persisted to MongoDB!`, {
          database: dbName,
          collection: collectionName,
          documentId: savedDoc._id,
          filename: savedDoc.filename,
          size: `${(savedDoc.length / 1024 / 1024).toFixed(2)} MB`,
          uploadDate: savedDoc.uploadDate,
        });
      } else {
        logger.warn(`[RemoteAuth] ⚠️ Session zip uploaded with ID "${insertedDocId}" but findOne verification returned null.`);
      }

      // Cleanup older backup versions so only the latest valid session is retained
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
        logger.debug('[RemoteAuth] Notice during old session cleanup:', cleanErr.message);
      }
    } catch (uploadErr) {
      logger.error('[RemoteAuth] ❌ Session upload failed with exception:', {
        message: uploadErr.message,
        stack: uploadErr.stack,
      });
      throw uploadErr;
    }
  }

  async extract(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const dbName = db?.databaseName || this.mongoose.connection.name;
    const bucketName = `whatsapp-${sessionName}`;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, { bucketName });

    const targetPath = options.path;
    logger.info(`[RemoteAuth] Session found: Downloading session zip from Database "${dbName}", Collection "${bucketName}.files" to ${targetPath}...`);

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
          logger.info(`[RemoteAuth] Session restored: Downloaded session zip from MongoDB successfully.`);
          resolve();
        });
    });
  }

  async delete(options) {
    const sessionName = options.session;
    const db = this.mongoose.connection.db;
    const bucketName = `whatsapp-${sessionName}`;
    const bucket = new this.mongoose.mongo.GridFSBucket(db, { bucketName });

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
    if (!db) return null;

    const dbName = db.databaseName || this.mongoose.connection.name;
    const filesCollection = db.collection(`whatsapp-${sessionName}.files`);
    const chunksCollection = db.collection(`whatsapp-${sessionName}.chunks`);

    const files = await filesCollection.find().toArray();
    const chunkCount = await chunksCollection.countDocuments();

    return {
      databaseName: dbName,
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

  logger.info('[RemoteAuth] Connecting to MongoDB for WhatsApp session persistence...');
  const maskedUri = cleanUri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)/, '$1******$3');
  logger.info(`[RemoteAuth] Target MongoDB URI: ${maskedUri}`);

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(cleanUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      });
    }

    const db = mongoose.connection.db;
    const dbName = db?.databaseName || mongoose.connection.name;
    const clientId = getSessionName();
    const collectionName = `whatsapp-RemoteAuth-${clientId}.files`;

    logger.info(`[RemoteAuth] MongoDB connection established successfully.`);
    logger.info(`[RemoteAuth] Database Name: "${dbName}"`);
    logger.info(`[RemoteAuth] Target Collection: "${collectionName}"`);

    mongoStoreInstance = new RobustMongoStore({ mongoose });
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
