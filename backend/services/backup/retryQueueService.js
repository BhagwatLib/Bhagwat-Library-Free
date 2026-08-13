'use strict';

const fs = require('fs-extra');
const path = require('path');
const logger = require('../../utils/logger');
const { convertTimestamps } = require('./mongoBackupService');

const queueFilePath = path.join(__dirname, '../../data/failed_sync_queue.json');

class RetryQueueService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.writePromise = Promise.resolve();
  }

  /**
   * Loads the failed sync queue from disk.
   */
  async loadQueue() {
    try {
      if (await fs.pathExists(queueFilePath)) {
        const data = await fs.readJson(queueFilePath);
        if (Array.isArray(data)) {
          this.queue = data;
        }
      }
    } catch (err) {
      logger.error('[RetryQueue] Failed to load queue from disk:', { message: err.message });
    }
  }

  /**
   * Saves the failed sync queue to disk.
   * Sequences writes using a promise chain to prevent concurrent file access corruption.
   */
  async saveQueue() {
    this.writePromise = this.writePromise.then(async () => {
      try {
        await fs.ensureDir(path.dirname(queueFilePath));
        await fs.writeJson(queueFilePath, this.queue, { spaces: 2 });
      } catch (err) {
        logger.error('[RetryQueue] Failed to save queue to disk:', { message: err.message });
      }
    });
    return this.writePromise;
  }

  /**
   * Retrieves the current list of queued tasks.
   */
  getQueue() {
    return this.queue;
  }

  /**
   * Adds a failed sync operation to the queue.
   * 
   * @param {string} type - Event type (CREATE, UPDATE, DELETE, etc.)
   * @param {string} studentId - Student identifier
   * @param {string} firebasePath - Original Firestore path
   * @param {object} data - Full student object at the time of failure
   * @param {string} errorMsg - Error reason
   */
  async enqueue(type, studentId, firebasePath, data, errorMsg) {
    await this.loadQueue();

    const task = {
      id: `${studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      studentId,
      firebasePath,
      data: data ? convertTimestamps(data) : null,
      timestamp: new Date().toISOString(),
      attempts: 0,
      lastError: errorMsg || 'Unknown Error'
    };

    this.queue.push(task);
    await this.saveQueue();
    logger.info(`[RetryQueue] Enqueued failed sync event: ${type} for student ${studentId}. Queue length: ${this.queue.length}`);
  }

  /**
   * Runs the queue, retrying operations in strict chronological (FIFO) order.
   * Pauses on first failure to preserve consistency.
   * 
   * @param {object} mongoBackupService - Direct instance of MongoDB backup module
   */
  async processQueue(mongoBackupService) {
    if (this.isProcessing) {
      logger.info('[RetryQueue] Queue is already processing. Skipping run.');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      await this.loadQueue();
      if (this.queue.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info(`[RetryQueue] Found ${this.queue.length} items in retry queue. Processing...`);

      let index = 0;
      while (index < this.queue.length) {
        const task = this.queue[index];
        logger.info(`[RetryQueue] Retrying task ${task.id} (${task.type} for student ${task.studentId}) | Attempt: ${task.attempts + 1}`);

        try {
          // Perform database operation
          if (task.type === 'DELETE') {
            await mongoBackupService.deleteStudentBackup(task.studentId, task.firebasePath, task.data, task.data?.deletionReason);
          } else {
            await mongoBackupService.saveStudentBackup(task.studentId, task.data);
          }

          // Log success in sync_logs
          try {
            await mongoBackupService.writeSyncLog({
              eventType: task.type,
              firebasePath: task.firebasePath,
              studentId: task.studentId,
              syncStatus: 'SUCCESS',
              errorDetails: `Synced successfully on retry (attempts: ${task.attempts + 1})`
            });
          } catch (logErr) {
            logger.warn(`[RetryQueue] Succeeded syncing but failed to write audit log for task ${task.id}:`, logErr.message);
          }

          logger.info(`[RetryQueue] Task ${task.id} succeeded. Removing from queue.`);
          
          // Remove from local array and save
          this.queue.splice(index, 1);
          await this.saveQueue();
          
          // Since we spliced the array, the next item has shifted to the current index. Do not increment.
        } catch (err) {
          // Task failed again
          task.attempts += 1;
          task.lastError = err.message || 'MongoDB is offline';
          await this.saveQueue();

          logger.error(`[RetryQueue] Task ${task.id} failed again: ${err.message}. Halting queue processing to preserve FIFO integrity.`);

          // Attempt to log failure in database (will fail if MongoDB is completely offline, which is fine)
          try {
            await mongoBackupService.writeSyncLog({
              eventType: task.type,
              firebasePath: task.firebasePath,
              studentId: task.studentId,
              syncStatus: 'FAILED',
              errorDetails: `Retry attempt ${task.attempts} failed: ${err.message}`
            });
          } catch (_) {}

          // Stop processing rest of queue to maintain state sequence ordering
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new RetryQueueService();
