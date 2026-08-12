/**
 * gatewayLockService.js - Distributed WhatsApp Gateway Instance Lock & Lease Manager
 *
 * Ensures that between multiple installations (e.g. PC vs. Android/Termux),
 * only ONE gateway instance actively operates the whatsapp-web.js session at a time.
 * Uses atomic MongoDB operations with automatic heartbeat lease renewal.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mongoose = require('mongoose');
const EventEmitter = require('events');
const logger = require('../utils/logger');

// Lock configuration
const LOCK_COLLECTION_NAME = 'whatsappGatewayLock';
const DEFAULT_SESSION_ID = process.env.SESSION_NAME || 'library-session';
const LEASE_DURATION_MS = 45000; // 45 seconds lease TTL
const HEARTBEAT_INTERVAL_MS = 15000; // Heartbeat renewed every 15 seconds

class GatewayLockEvents extends EventEmitter {}
const lockEvents = new GatewayLockEvents();

// Cached instance metadata
let instanceMetadata = null;
let heartbeatTimer = null;
let currentOwnedSessionId = null;

/**
 * Detects whether the current environment is Android/Termux or PC/Server
 */
function detectDeviceType() {
  if (process.env.DEVICE_TYPE) {
    const envType = process.env.DEVICE_TYPE.toLowerCase().trim();
    if (envType === 'android' || envType === 'termux') return 'android';
    if (envType === 'pc' || envType === 'desktop' || envType === 'server') return 'pc';
  }

  const isAndroidPlatform = process.platform === 'android' || os.platform() === 'android';
  const isTermux = Boolean(
    process.env.TERMUX_VERSION ||
    (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) ||
    (process.env.HOME && process.env.HOME.includes('com.termux'))
  );

  return (isAndroidPlatform || isTermux) ? 'android' : 'pc';
}

/**
 * Loads or initializes a persistent instance ID for this installation.
 * The instance ID is stored in `.gateway_instance.json` and does NOT change on restarts.
 */
function getInstanceInfo() {
  if (instanceMetadata) {
    return instanceMetadata;
  }

  const instanceFilePath = path.join(__dirname, '../.gateway_instance.json');

  try {
    if (fs.existsSync(instanceFilePath)) {
      const raw = fs.readFileSync(instanceFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.instanceId && parsed.deviceType) {
        instanceMetadata = {
          instanceId: parsed.instanceId,
          deviceType: parsed.deviceType,
          hostname: os.hostname() || 'unknown-host',
          createdAt: parsed.createdAt || new Date().toISOString(),
        };
        logger.info(`[Gateway Lock] Loaded persistent instance ID: "${instanceMetadata.instanceId}" (${instanceMetadata.deviceType})`);
        return instanceMetadata;
      }
    }
  } catch (err) {
    logger.warn('[Gateway Lock] Could not read existing instance file:', { message: err.message });
  }

  // Generate new persistent instance ID
  const deviceType = detectDeviceType();
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const instanceId = `gateway-${deviceType}-${randomSuffix}`;
  const nowStr = new Date().toISOString();

  instanceMetadata = {
    instanceId,
    deviceType,
    hostname: os.hostname() || 'unknown-host',
    createdAt: nowStr,
  };

  try {
    fs.writeFileSync(
      instanceFilePath,
      JSON.stringify(instanceMetadata, null, 2),
      'utf8'
    );
    logger.info(`[Gateway Lock] Generated and saved persistent instance ID: "${instanceId}" (${deviceType})`);
  } catch (err) {
    logger.error('[Gateway Lock] Failed to persist instance ID file:', { message: err.message });
  }

  return instanceMetadata;
}

/**
 * Returns the MongoDB collection for gateway locks
 */
function getLockCollection() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('[Gateway Lock] MongoDB connection is not active.');
  }
  return db.collection(LOCK_COLLECTION_NAME);
}

/**
 * Ensures MongoDB connection is ready
 */
async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) {
    const sessionStore = require('./whatsapp/sessionStore');
    await sessionStore.connectAndGetStore();
  }
}

/**
 * Starts periodic heartbeat to renew lease while this instance owns the lock
 */
function startHeartbeat(sessionId) {
  stopHeartbeat();
  currentOwnedSessionId = sessionId;

  heartbeatTimer = setInterval(async () => {
    try {
      await renewLock(sessionId);
    } catch (err) {
      logger.error('[Gateway Lock] Heartbeat renewal error:', { message: err.message });
    }
  }, HEARTBEAT_INTERVAL_MS);

  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }
}

/**
 * Stops periodic heartbeat
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  currentOwnedSessionId = null;
}

/**
 * Renews the lock lease for the current owner
 */
async function renewLock(sessionId = DEFAULT_SESSION_ID) {
  const { instanceId } = getInstanceInfo();
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  try {
    await ensureDbConnected();
    const collection = getLockCollection();

    const result = await collection.findOneAndUpdate(
      {
        _id: sessionId,
        instanceId: instanceId,
        status: 'active',
      },
      {
        $set: {
          lastHeartbeat: now,
          expiresAt: newExpiresAt,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    const doc = result && (result.value || result);
    if (!doc || doc.instanceId !== instanceId) {
      logger.warn(`[Gateway Lock] Heartbeat failed: Lock ownership for "${sessionId}" was lost or taken by another device.`);
      stopHeartbeat();
      lockEvents.emit('lock_lost', { sessionId, instanceId });
      return false;
    }

    logger.debug(`[Gateway Lock] Heartbeat renewed for instance "${instanceId}". Lease valid until: ${newExpiresAt.toISOString()}`);
    return true;
  } catch (err) {
    logger.error('[Gateway Lock] Failed to renew lock lease:', { message: err.message });
    return false;
  }
}

/**
 * Atomically acquires or re-acquires the gateway lock for this instance.
 *
 * Rules:
 * 1. If no lock exists or status is not 'active' -> Acquire.
 * 2. If existing lock belongs to this instance -> Re-acquire and extend lease.
 * 3. If existing lock has expired (expiresAt < now) -> Acquire (stale lock recovery).
 * 4. If existing lock belongs to another active instance and lease is valid -> Deny.
 *
 * @returns {Promise<{ acquired: boolean, lock: Object, message?: string }>}
 */
async function acquireLock(sessionId = DEFAULT_SESSION_ID) {
  const { instanceId, deviceType, hostname } = getInstanceInfo();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  logger.info(`[Gateway Lock] Attempting to acquire lock for session: "${sessionId}" | Instance: "${instanceId}" (${deviceType})`);

  try {
    await ensureDbConnected();
    const collection = getLockCollection();

    // 1. First attempt atomic update on matching criteria (self-owned, expired, or released)
    const updateResult = await collection.findOneAndUpdate(
      {
        _id: sessionId,
        $or: [
          { instanceId: instanceId }, // Re-acquiring our own lock
          { expiresAt: { $lt: now } }, // Previous lease expired (crash recovery / takeover)
          { status: { $ne: 'active' } }, // Cleanly released by previous owner
        ],
      },
      {
        $set: {
          sessionId,
          instanceId,
          deviceType,
          hostname,
          lastHeartbeat: now,
          expiresAt,
          status: 'active',
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    let updatedDoc = updateResult && (updateResult.value || updateResult);

    // 2. If no document was updated, it could be either because:
    //    a) No document exists in the collection yet (first-time init)
    //    b) Another instance holds an active, unexpired lock
    if (!updatedDoc) {
      const existingDoc = await collection.findOne({ _id: sessionId });

      if (!existingDoc) {
        // First-time insert
        try {
          const insertResult = await collection.insertOne({
            _id: sessionId,
            sessionId,
            instanceId,
            deviceType,
            hostname,
            lastHeartbeat: now,
            expiresAt,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          });
          if (insertResult.acknowledged) {
            updatedDoc = {
              _id: sessionId,
              sessionId,
              instanceId,
              deviceType,
              hostname,
              lastHeartbeat: now,
              expiresAt,
              status: 'active',
            };
          }
        } catch (insertErr) {
          // If concurrent insert occurred, re-query
          logger.debug('[Gateway Lock] Concurrent insert caught, inspecting current owner...');
          const currentDoc = await collection.findOne({ _id: sessionId });
          if (currentDoc && currentDoc.instanceId === instanceId) {
            updatedDoc = currentDoc;
          }
        }
      }
    }

    // 3. Verify if we are the owner
    if (updatedDoc && updatedDoc.instanceId === instanceId && updatedDoc.status === 'active') {
      logger.info(`[Gateway Lock] ✅ Lock ACQUIRED for session: "${sessionId}" | Owner: "${instanceId}" (${deviceType}) | Lease expires: ${expiresAt.toISOString()}`);
      startHeartbeat(sessionId);
      lockEvents.emit('lock_acquired', { sessionId, instanceId, lock: updatedDoc });
      return {
        acquired: true,
        lock: updatedDoc,
      };
    }

    // 4. Lock belongs to another active instance
    const activeLock = await collection.findOne({ _id: sessionId });
    const isStillActive = activeLock && activeLock.status === 'active' && new Date(activeLock.expiresAt) > now;

    if (isStillActive) {
      const remainingSec = Math.max(0, Math.ceil((new Date(activeLock.expiresAt).getTime() - now.getTime()) / 1000));
      logger.warn(`[Gateway Lock] ❌ Lock DENIED for "${sessionId}". Currently owned by "${activeLock.instanceId}" (${activeLock.deviceType} on ${activeLock.hostname || 'unknown'}). Lease expires in ${remainingSec}s.`);
      return {
        acquired: false,
        lock: activeLock,
        message: `WhatsApp gateway is currently active on another device (${activeLock.deviceType || 'other'} / ${activeLock.instanceId}).`,
      };
    }

    // Edge case: Lock expired during evaluation, retry once
    return await acquireLock(sessionId);
  } catch (err) {
    logger.error('[Gateway Lock] Lock acquisition error:', { message: err.message, stack: err.stack });
    return {
      acquired: false,
      lock: null,
      message: `Failed to acquire gateway lock: ${err.message}`,
    };
  }
}

/**
 * Releases the lock if and only if the current instance is the active owner
 */
async function releaseLock(sessionId = DEFAULT_SESSION_ID) {
  const { instanceId } = getInstanceInfo();
  const now = new Date();

  stopHeartbeat();
  logger.info(`[Gateway Lock] Releasing lock for session: "${sessionId}" | Instance: "${instanceId}"`);

  try {
    await ensureDbConnected();
    const collection = getLockCollection();

    const result = await collection.updateOne(
      {
        _id: sessionId,
        instanceId: instanceId,
      },
      {
        $set: {
          status: 'released',
          expiresAt: now,
          releasedAt: now,
          updatedAt: now,
        },
      }
    );

    if (result.matchedCount > 0) {
      logger.info(`[Gateway Lock] Lock released successfully for session: "${sessionId}".`);
      lockEvents.emit('lock_released', { sessionId, instanceId });
      return true;
    } else {
      logger.debug(`[Gateway Lock] No active lock held by "${instanceId}" to release for "${sessionId}".`);
      return false;
    }
  } catch (err) {
    logger.error('[Gateway Lock] Error releasing lock:', { message: err.message });
    return false;
  }
}

/**
 * Checks if the current instance is currently the verified active lock owner
 */
async function isLockOwner(sessionId = DEFAULT_SESSION_ID) {
  const { instanceId } = getInstanceInfo();
  const now = new Date();

  // Fast memory check if we haven't even acquired it
  if (currentOwnedSessionId !== sessionId && !heartbeatTimer) {
    // Verify against DB in case of initial check
  }

  try {
    await ensureDbConnected();
    const collection = getLockCollection();
    const lockDoc = await collection.findOne({ _id: sessionId });

    if (
      lockDoc &&
      lockDoc.instanceId === instanceId &&
      lockDoc.status === 'active' &&
      new Date(lockDoc.expiresAt) > now
    ) {
      return true;
    }

    return false;
  } catch (err) {
    logger.error('[Gateway Lock] Error checking lock ownership:', { message: err.message });
    return false;
  }
}

/**
 * Returns comprehensive lock diagnostic details for API status endpoints
 */
async function getLockStatus(sessionId = DEFAULT_SESSION_ID) {
  const { instanceId, deviceType, hostname } = getInstanceInfo();
  const now = new Date();

  try {
    await ensureDbConnected();
    const collection = getLockCollection();
    const lockDoc = await collection.findOne({ _id: sessionId });

    if (!lockDoc) {
      return {
        gateway: 'idle',
        instanceId,
        deviceType,
        hostname,
        sessionOwner: null,
        ownerDeviceType: null,
        ownerHostname: null,
        isLockOwner: false,
        lockExpiresAt: null,
        lastHeartbeat: null,
        status: 'available',
      };
    }

    const isOwner = lockDoc.instanceId === instanceId && lockDoc.status === 'active';
    const isExpired = new Date(lockDoc.expiresAt) <= now;
    const isActive = lockDoc.status === 'active' && !isExpired;

    let gatewayState;
    if (isOwner && isActive) {
      gatewayState = 'active';
    } else if (isActive) {
      gatewayState = 'locked';
    } else {
      gatewayState = 'idle';
    }

    return {
      gateway: gatewayState,
      instanceId,
      deviceType,
      hostname,
      sessionOwner: isActive ? lockDoc.instanceId : null,
      ownerDeviceType: isActive ? lockDoc.deviceType : null,
      ownerHostname: isActive ? lockDoc.hostname : null,
      isLockOwner: isOwner && isActive,
      lockExpiresAt: lockDoc.expiresAt,
      lastHeartbeat: lockDoc.lastHeartbeat,
      status: isActive ? lockDoc.status : 'expired',
      message: (!isOwner && isActive)
        ? `WhatsApp gateway is currently active on another device (${lockDoc.deviceType || 'other'} / ${lockDoc.instanceId}).`
        : undefined,
    };
  } catch (err) {
    logger.error('[Gateway Lock] Error retrieving lock status:', { message: err.message });
    return {
      gateway: 'unknown',
      instanceId,
      deviceType,
      hostname,
      sessionOwner: null,
      isLockOwner: false,
      error: err.message,
    };
  }
}

module.exports = {
  getInstanceInfo,
  acquireLock,
  renewLock,
  releaseLock,
  isLockOwner,
  getLockStatus,
  events: lockEvents,
  detectDeviceType,
  LEASE_DURATION_MS,
  HEARTBEAT_INTERVAL_MS,
};
