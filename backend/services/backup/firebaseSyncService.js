'use strict';

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('../../utils/logger');
const mongoBackupService = require('./mongoBackupService');
const retryQueue = require('./retryQueueService');

let firebaseApp = null;
let isInitialized = false;
let isListenerActive = false;
let unsubscribeListener = null;
let retryIntervalId = null;

// Local cache to compare document states and classify update events
const studentCache = new Map();

/**
 * Initializes the Firebase Admin SDK using Environment variables.
 */
function initFirebase() {
  if (isInitialized) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('[FirebaseSync] Firebase credentials are not fully configured in environment.');
    logger.warn('[FirebaseSync] Real-time backup sync listener is inactive. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to backend/.env');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: privateKey.trim().replace(/\\n/g, '\n'),
      }),
    }, 'backup-sync-app'); // Specify name to avoid "app already exists" conflicts if server re-runs

    isInitialized = true;
    logger.info('[FirebaseSync] Firebase Admin SDK initialized successfully.');
    return firebaseApp;
  } catch (err) {
    logger.error('[FirebaseSync] Failed to initialize Firebase Admin SDK:', { message: err.message, stack: err.stack });
    return null;
  }
}

/**
 * Utility to compare old and new student documents and determine the event type.
 * Ensures we log specific actions (SEAT_CHANGE, PAYMENT_UPDATE, etc.) to the audit log.
 * 
 * @param {object} oldData - Old student data from local cache
 * @param {object} newData - New student data from Firestore snapshot
 * @returns {string} The classified event type
 */
function classifyUpdateEvent(oldData, newData) {
  if (!oldData) return 'UPDATE';

  // 1. Seat Allocation Change
  if (oldData.seatNumber !== newData.seatNumber) {
    return 'SEAT_CHANGE';
  }

  // 2. Shift / Batch Assignment Change
  const oldBatches = JSON.stringify(oldData.batch || oldData.batchIds || oldData.assignedBatches || []);
  const newBatches = JSON.stringify(newData.batch || newData.batchIds || newData.assignedBatches || []);
  if (oldBatches !== newBatches) {
    return 'SHIFT_CHANGE';
  }

  // 3. Payment Updates
  if (
    oldData.paidAmount !== newData.paidAmount ||
    oldData.totalAmount !== newData.totalAmount ||
    oldData.paymentStatus !== newData.paymentStatus ||
    oldData.status !== newData.status
  ) {
    return 'PAYMENT_UPDATE';
  }

  // 4. Membership Changes
  if (
    oldData.validityFrom !== newData.validityFrom ||
    oldData.validityTo !== newData.validityTo ||
    oldData.validityStart !== newData.validityStart ||
    oldData.validityEnd !== newData.validityEnd ||
    oldData.membership !== newData.membership
  ) {
    return 'MEMBERSHIP_UPDATE';
  }

  // 5. Notification Updates
  const oldNotifications = JSON.stringify(oldData.notifications || oldData.notificationHistory || {});
  const newNotifications = JSON.stringify(newData.notifications || newData.notificationHistory || {});
  if (oldNotifications !== newNotifications) {
    return 'NOTIFICATION_UPDATE';
  }

  return 'UPDATE';
}

/**
 * Subscribes to real-time changes in Firestore and kicks off the retry scheduler loop.
 */
async function startSyncListener() {
  const app = initFirebase();
  if (!app) {
    logger.warn('[FirebaseSync] Cannot start sync listener: Firebase not initialized.');
    return;
  }

  try {
    const db = getFirestore(app);
    logger.info('[FirebaseSync] Subscribing to Firestore "students" collection snapshots...');

    // Load existing items from file-backed queue
    await retryQueue.loadQueue();

    // Setup periodic automated retry scheduler (defaults to every 30 seconds)
    const retryIntervalMs = Number(process.env.BACKUP_RETRY_INTERVAL_MS) || 30000;
    if (retryIntervalId) clearInterval(retryIntervalId);
    
    retryIntervalId = setInterval(async () => {
      try {
        await retryQueue.processQueue(mongoBackupService);
      } catch (err) {
        logger.error('[FirebaseSync] Error in automated queue retry processor:', { message: err.message });
      }
    }, retryIntervalMs);

    isListenerActive = true;

    // Attach real-time collection observer
    unsubscribeListener = db.collection('students').onSnapshot(
      async (snapshot) => {
        logger.info(`[FirebaseSync] Received Firestore change event. Documents affected: ${snapshot.docChanges().length}`);

        for (const change of snapshot.docChanges()) {
          const studentId = change.doc.id;
          const firebasePath = `students/${studentId}`;
          const newData = change.doc.data();

          if (change.type === 'added') {
            // Store current snapshot state in local comparison cache
            studentCache.set(studentId, newData);

            // Execute Backup
            try {
              await mongoBackupService.saveStudentBackup(studentId, newData);
              await mongoBackupService.writeSyncLog({
                eventType: 'CREATE',
                firebasePath,
                studentId,
                syncStatus: 'SUCCESS'
              });
              logger.info(`[FirebaseSync] Sync SUCCESS [CREATE] for student: ${studentId}`);
            } catch (err) {
              logger.error(`[FirebaseSync] Sync FAILED [CREATE] for student: ${studentId}. Queueing...`, { message: err.message });
              await retryQueue.enqueue('CREATE', studentId, firebasePath, newData, err.message);
            }

          } else if (change.type === 'modified') {
            const oldData = studentCache.get(studentId);
            const eventType = classifyUpdateEvent(oldData, newData);

            // Update cache
            studentCache.set(studentId, newData);

            // Execute Backup
            try {
              await mongoBackupService.saveStudentBackup(studentId, newData);
              await mongoBackupService.writeSyncLog({
                eventType,
                firebasePath,
                studentId,
                syncStatus: 'SUCCESS'
              });
              logger.info(`[FirebaseSync] Sync SUCCESS [${eventType}] for student: ${studentId}`);
            } catch (err) {
              logger.error(`[FirebaseSync] Sync FAILED [${eventType}] for student: ${studentId}. Queueing...`, { message: err.message });
              await retryQueue.enqueue(eventType, studentId, firebasePath, newData, err.message);
            }

          } else if (change.type === 'removed') {
            const oldData = studentCache.get(studentId);
            
            // Delete from cache
            studentCache.delete(studentId);

            // Execute Backup Soft Delete
            try {
              await mongoBackupService.deleteStudentBackup(studentId, firebasePath, oldData, oldData?.deletionReason);
              await mongoBackupService.writeSyncLog({
                eventType: 'DELETE',
                firebasePath,
                studentId,
                syncStatus: 'SUCCESS'
              });
              logger.info(`[FirebaseSync] Sync SUCCESS [DELETE] for student: ${studentId}`);
            } catch (err) {
              logger.error(`[FirebaseSync] Sync FAILED [DELETE] for student: ${studentId}. Queueing...`, { message: err.message });
              await retryQueue.enqueue('DELETE', studentId, firebasePath, oldData, err.message);
            }
          }
        }
      },
      (err) => {
        logger.error('[FirebaseSync] Firestore snapshot listener subscription error:', { message: err.message, stack: err.stack });
        isListenerActive = false;
        
        // Attempt listener restart after 10 seconds
        logger.info('[FirebaseSync] Attempting to reconnect Firestore listener in 10s...');
        setTimeout(startSyncListener, 10000);
      }
    );
  } catch (err) {
    logger.error('[FirebaseSync] Error starting sync service listener:', { message: err.message, stack: err.stack });
    isListenerActive = false;
  }
}

/**
 * Clean up subscriptions and timers.
 */
function stopSyncListener() {
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
    logger.info('[FirebaseSync] Unsubscribed Firestore listener.');
  }
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
    logger.info('[FirebaseSync] Stopped retry scheduler loop.');
  }
  isListenerActive = false;
}

module.exports = {
  startSyncListener,
  stopSyncListener,
  isInitialized: () => isInitialized,
  isListenerActive: () => isListenerActive,
  getQueue: () => retryQueue.getQueue(),
  triggerQueueProcessing: () => retryQueue.processQueue(mongoBackupService),
};
