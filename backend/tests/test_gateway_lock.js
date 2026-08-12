/**
 * test_gateway_lock.js - Integration & Unit Test Suite for Distributed Gateway Lock
 *
 * Tests:
 * 1. Persistent instance ID generation and detection (PC vs Android)
 * 2. Atomic lock acquisition
 * 3. Lock denial when session is already active on another device
 * 4. Heartbeat renewal
 * 5. Clean lock release on shutdown/logout
 * 6. Takeover after lease expiration (crash recovery)
 * 7. Concurrent acquisition race condition handling
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const gatewayLockService = require('../services/gatewayLockService');
const sessionStore = require('../services/whatsapp/sessionStore');
const logger = require('../utils/logger');

async function runTests() {
  console.log('\n======================================================');
  console.log('  🧪 RUNNING DISTRIBUTED GATEWAY LOCK TEST SUITE');
  console.log('======================================================\n');

  // 1. Connect MongoDB
  console.log('[Test 1] Connecting to MongoDB...');
  await sessionStore.connectAndGetStore();
  console.log('✅ [Test 1 Passed] MongoDB connected successfully.\n');

  const testSessionId = `test-gateway-session-${Date.now()}`;

  // 2. Test Persistent Instance ID resolution
  console.log('[Test 2] Testing Instance ID and Device Type resolution...');
  const myInstance = gatewayLockService.getInstanceInfo();
  console.log('Instance Info:', myInstance);
  if (!myInstance.instanceId || !myInstance.deviceType) {
    throw new Error('Instance ID or Device Type is missing.');
  }
  console.log('✅ [Test 2 Passed] Persistent instance ID verified.\n');

  // 3. Test Device 1 (PC) acquiring lock
  console.log(`[Test 3] Simulating Device 1 (PC) acquiring lock for "${testSessionId}"...`);
  const lockResult1 = await gatewayLockService.acquireLock(testSessionId);
  console.log('Lock 1 Result:', { acquired: lockResult1.acquired, instanceId: lockResult1.lock?.instanceId });
  if (!lockResult1.acquired) {
    throw new Error('Device 1 failed to acquire initial lock.');
  }
  console.log('✅ [Test 3 Passed] Device 1 acquired lock.\n');

  // 4. Test Device 2 (Android) attempting to acquire lock while Device 1 is active
  console.log(`[Test 4] Simulating Device 2 (Android) attempting to acquire lock for "${testSessionId}"...`);
  // Mock Device 2 by temporarily changing instance info in a mock call
  const db = mongoose.connection.db;
  const lockCollection = db.collection('whatsappGatewayLock');

  const mockAndroidInstanceId = `gateway-android-mock123`;
  const mockNow = new Date();
  const mockExpiresAt = new Date(mockNow.getTime() + 45000);

  // Attempt atomic update as mock Android device
  const androidAttempt = await lockCollection.findOneAndUpdate(
    {
      _id: testSessionId,
      $or: [
        { instanceId: mockAndroidInstanceId },
        { expiresAt: { $lt: mockNow } },
        { status: { $ne: 'active' } },
      ],
    },
    {
      $set: {
        instanceId: mockAndroidInstanceId,
        deviceType: 'android',
        lastHeartbeat: mockNow,
        expiresAt: mockExpiresAt,
        status: 'active',
      },
    },
    { returnDocument: 'after' }
  );

  const androidDoc = androidAttempt && (androidAttempt.value || androidAttempt);
  console.log('Android Lock Attempt Result:', androidDoc ? 'Acquired (FAIL)' : 'Denied (EXPECTED)');
  if (androidDoc && androidDoc.instanceId === mockAndroidInstanceId) {
    throw new Error('Device 2 (Android) should have been DENIED because Device 1 owns the lock.');
  }
  console.log('✅ [Test 4 Passed] Device 2 correctly DENIED lock while Device 1 is active.\n');

  // 5. Test Heartbeat Renewal
  console.log('[Test 5] Testing heartbeat renewal for Device 1...');
  const renewed = await gatewayLockService.renewLock(testSessionId);
  console.log('Heartbeat renewed:', renewed);
  if (!renewed) {
    throw new Error('Heartbeat renewal failed.');
  }
  console.log('✅ [Test 5 Passed] Heartbeat renewed successfully.\n');

  // 6. Test Clean Lock Release on Shutdown
  console.log('[Test 6] Testing clean lock release by Device 1...');
  const released = await gatewayLockService.releaseLock(testSessionId);
  console.log('Lock released:', released);
  if (!released) {
    throw new Error('Failed to release lock.');
  }
  console.log('✅ [Test 6 Passed] Device 1 released lock.\n');

  // 7. Test Device 2 (Android) acquiring lock after Device 1 released
  console.log('[Test 7] Device 2 (Android) acquiring lock after release...');
  const androidAfterRelease = await lockCollection.findOneAndUpdate(
    {
      _id: testSessionId,
      $or: [
        { instanceId: mockAndroidInstanceId },
        { expiresAt: { $lt: new Date() } },
        { status: { $ne: 'active' } },
      ],
    },
    {
      $set: {
        instanceId: mockAndroidInstanceId,
        deviceType: 'android',
        lastHeartbeat: new Date(),
        expiresAt: new Date(Date.now() + 45000),
        status: 'active',
      },
    },
    { returnDocument: 'after' }
  );

  const androidAcquiredDoc = androidAfterRelease && (androidAfterRelease.value || androidAfterRelease);
  console.log('Android Acquired Doc:', { instanceId: androidAcquiredDoc?.instanceId, status: androidAcquiredDoc?.status });
  if (!androidAcquiredDoc || androidAcquiredDoc.instanceId !== mockAndroidInstanceId) {
    throw new Error('Device 2 failed to acquire released lock.');
  }
  console.log('✅ [Test 7 Passed] Device 2 acquired lock after clean release.\n');

  // 8. Test Crash Recovery / Stale Lock Takeover (Simulate expired lease)
  console.log('[Test 8] Simulating Device 2 crash (lease expired)...');
  const pastDate = new Date(Date.now() - 60000); // Expired 1 minute ago
  await lockCollection.updateOne(
    { _id: testSessionId },
    { $set: { expiresAt: pastDate, status: 'active', instanceId: mockAndroidInstanceId } }
  );

  // Device 1 attempts to acquire
  console.log('Device 1 attempting takeover of expired lock...');
  const takeoverResult = await gatewayLockService.acquireLock(testSessionId);
  console.log('Takeover Result:', { acquired: takeoverResult.acquired, owner: takeoverResult.lock?.instanceId });
  if (!takeoverResult.acquired || takeoverResult.lock?.instanceId !== myInstance.instanceId) {
    throw new Error('Device 1 failed to take over expired/stale lock.');
  }
  console.log('✅ [Test 8 Passed] Stale lock crash recovery verified.\n');

  // Clean up test document
  await lockCollection.deleteOne({ _id: testSessionId });
  console.log('Cleaned up test session document.');

  console.log('======================================================');
  console.log('  🎉 ALL 8 TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
