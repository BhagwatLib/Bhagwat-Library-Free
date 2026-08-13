'use strict';

const mongoose = require('mongoose');
const logger = require('../../utils/logger');

/**
 * Ensures MongoDB connection is active.
 * Reuse the global Mongoose connection if connected, otherwise initiate a new connection.
 */
async function ensureConnected() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection.db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  const cleanUri = uri.trim();
  logger.info('[MongoBackup] MongoDB not connected. Initiating connection...');
  
  await mongoose.connect(cleanUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });

  if (!mongoose.connection.db) {
    throw new Error('Failed to retrieve MongoDB database reference after connection.');
  }

  logger.info('[MongoBackup] MongoDB connection established successfully.');
  return mongoose.connection.db;
}

/**
 * Recursively converts Firestore Timestamp instances and date-like strings to standard Date objects.
 * Also parses numeric strings for specific fields.
 * 
 * @param {any} obj - The object to convert
 * @param {string} [key] - The current key of the field
 * @returns {any} Converted object
 */
function convertTimestamps(obj, key = null) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if it's a Firestore Timestamp instance
  if (typeof obj.toDate === 'function') {
    return obj.toDate();
  }
  
  // Alternative detection for Firestore BSON Timestamp shapes
  if (obj.constructor && obj.constructor.name === 'Timestamp') {
    return new Date(obj.seconds * 1000 + Math.round(obj.nanoseconds / 1000000));
  }

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    
    // Parse ISO 8601 Date string, e.g. "2026-08-13T06:52:08.167Z"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d;
    }
    
    // Parse Date-only string, e.g. "2026-08-13"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d;
    }
    
    // Parse numbers for known numeric fields
    if (key && ['seatNumber', 'paidAmount', 'totalAmount'].includes(key)) {
      const num = Number(trimmed);
      if (!isNaN(num)) return num;
    }

    return obj;
  }

  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => convertTimestamps(item, key));
    }
    const result = {};
    for (const k of Object.keys(obj)) {
      result[k] = convertTimestamps(obj[k], k);
    }
    return result;
  }

  return obj;
}

/**
 * Saves a student's full mirror object into the MongoDB 'students' collection.
 * Uses replaceOne with upsert:true to mirror changes perfectly, including deleted attributes.
 * 
 * @param {string} studentId - Firestore document ID
 * @param {object} studentData - Complete student details
 */
async function saveStudentBackup(studentId, studentData) {
  if (!studentId) {
    throw new Error('Cannot save student backup: Student ID is required.');
  }
  if (!studentData) {
    throw new Error('Cannot save student backup: Student data is required.');
  }

  const db = await ensureConnected();
  const collectionName = process.env.MONGODB_STUDENTS_COLLECTION || 'students';
  const collection = db.collection(collectionName);

  // Clean data and prepare copy
  const cleanData = convertTimestamps(studentData);
  const record = {
    ...cleanData,
    _id: studentId,
    updatedAt: cleanData.updatedAt || new Date()
  };

  // Remove client-side database ID to prevent duplication
  delete record.id;

  logger.info(`[MongoBackup] Writing mirror document for student: ${studentId}`);
  const result = await collection.replaceOne({ _id: studentId }, record, { upsert: true });
  return result;
}

/**
 * Handles soft-deletion of student documents.
 * Archives the record into the 'deleted_students' collection and removes it from 'students'.
 * 
 * @param {string} studentId - Firestore document ID
 * @param {string} firebasePath - Original Firestore path (e.g. 'students/id')
 * @param {object} fallbackData - Last known student data if not present in MongoDB
 * @param {string} deletionReason - Custom reason for deletion
 */
async function deleteStudentBackup(studentId, firebasePath, fallbackData = null, deletionReason = null) {
  if (!studentId) {
    throw new Error('Cannot delete student backup: Student ID is required.');
  }

  const db = await ensureConnected();
  const studentsColName = process.env.MONGODB_STUDENTS_COLLECTION || 'students';
  const deletedColName = process.env.MONGODB_DELETED_COLLECTION || 'deleted_students';

  const studentsCol = db.collection(studentsColName);
  const deletedCol = db.collection(deletedColName);

  // 1. Fetch current backup record to preserve exact history
  let recordToMove = await studentsCol.findOne({ _id: studentId });

  // 2. Fall back to Firestore snapshot if not found in MongoDB
  if (!recordToMove && fallbackData) {
    recordToMove = convertTimestamps(fallbackData);
  }

  // 3. Fallback schema if document is completely missing from both caches
  if (!recordToMove) {
    recordToMove = {
      name: 'Unknown Student (Sync Gap)',
      phone: 'N/A'
    };
  }

  // Remove primary key to prevent duplicate key constraints in the archive
  delete recordToMove._id;

  const deletedRecord = {
    ...recordToMove,
    originalId: studentId,
    deletedAt: new Date(),
    originalFirebasePath: firebasePath || `students/${studentId}`,
    deletionReason: deletionReason || recordToMove.deletionReason || null
  };

  logger.info(`[MongoBackup] Archiving student ${studentId} to ${deletedColName}...`);
  // Insert with a timestamped unique ID so a student can be deleted multiple times and all occurrences kept
  await deletedCol.insertOne({
    ...deletedRecord,
    _id: `${studentId}_${Date.now()}`
  });

  logger.info(`[MongoBackup] Removing student ${studentId} from mirror collection ${studentsColName}...`);
  await studentsCol.deleteOne({ _id: studentId });
}

/**
 * Writes an event log entry into the 'sync_logs' collection.
 * 
 * @param {object} logData - Audit metadata
 * @param {string} logData.eventType - Event identifier (CREATE, UPDATE, DELETE, etc.)
 * @param {string} logData.firebasePath - Path of document
 * @param {string} logData.studentId - ID of student
 * @param {string} logData.syncStatus - 'SUCCESS' or 'FAILED'
 * @param {string} [logData.errorDetails] - Exception details
 */
async function writeSyncLog(logData) {
  const db = await ensureConnected();
  const logsColName = process.env.MONGODB_LOGS_COLLECTION || 'sync_logs';
  const collection = db.collection(logsColName);

  const logRecord = {
    eventType: logData.eventType || 'UPDATE',
    firebasePath: logData.firebasePath || 'unknown',
    studentId: logData.studentId || 'unknown',
    syncStatus: logData.syncStatus || 'SUCCESS',
    timestamp: new Date(),
    errorDetails: logData.errorDetails || null
  };

  await collection.insertOne(logRecord);
}

module.exports = {
  saveStudentBackup,
  deleteStudentBackup,
  writeSyncLog,
  ensureConnected,
  convertTimestamps
};
