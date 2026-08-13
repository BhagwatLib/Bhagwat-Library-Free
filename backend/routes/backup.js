'use strict';

const express = require('express');
const router = express.Router();
const firebaseSyncService = require('../services/backup/firebaseSyncService');
const mongoose = require('mongoose');

/**
 * GET /api/backup/status
 * Returns sync status, initialization info, MongoDB connection state, and current queue info.
 */
router.get('/status', async (req, res, next) => {
  try {
    const queue = firebaseSyncService.getQueue();
    const mongoConnected = mongoose.connection && mongoose.connection.readyState === 1;

    let recentLogs = [];
    if (mongoConnected && mongoose.connection.db) {
      const logsColName = process.env.MONGODB_LOGS_COLLECTION || 'sync_logs';
      recentLogs = await mongoose.connection.db
        .collection(logsColName)
        .find()
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();
    }

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      status: {
        firebaseInitialized: firebaseSyncService.isInitialized(),
        firestoreListenerActive: firebaseSyncService.isListenerActive(),
        mongoConnected: mongoConnected,
        queueLength: queue.length
      },
      queue: queue.map((task) => ({
        id: task.id,
        type: task.type,
        studentId: task.studentId,
        firebasePath: task.firebasePath,
        attempts: task.attempts,
        lastError: task.lastError,
        timestamp: task.timestamp
      })),
      recentLogs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/backup/retry
 * Manually triggers execution of the failed sync queue.
 */
router.post('/retry', async (req, res, next) => {
  try {
    // Trigger in the background so request completes immediately
    firebaseSyncService.triggerQueueProcessing().catch((err) => {
      console.error('[BackupRoute] Error during manual queue processing:', err.message);
    });

    res.status(200).json({
      success: true,
      message: 'Queue processing triggered in background.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/backup/logs
 * Fetches last 50 logs from the sync_logs collection.
 */
router.get('/logs', async (req, res, next) => {
  try {
    const mongoConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!mongoConnected || !mongoose.connection.db) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB is unavailable.'
      });
    }

    const logsColName = process.env.MONGODB_LOGS_COLLECTION || 'sync_logs';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    
    const logs = await mongoose.connection.db
      .collection(logsColName)
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/backup/deleted
 * Fetches recently deleted student archives from the deleted_students collection.
 */
router.get('/deleted', async (req, res, next) => {
  try {
    const mongoConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!mongoConnected || !mongoose.connection.db) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB is unavailable.'
      });
    }

    const deletedColName = process.env.MONGODB_DELETED_COLLECTION || 'deleted_students';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const deletedStudents = await mongoose.connection.db
      .collection(deletedColName)
      .find()
      .sort({ deletedAt: -1 })
      .limit(limit)
      .toArray();

    res.status(200).json({
      success: true,
      count: deletedStudents.length,
      data: deletedStudents
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
