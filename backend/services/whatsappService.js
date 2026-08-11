/**
 * whatsappService.js - Production-ready on-demand WhatsApp gateway with full diagnostics & telemetry
 */

'use strict';

const { Client, RemoteAuth, NoAuth, MessageMedia } = require('whatsapp-web.js');
const sessionStore = require('./whatsapp/sessionStore');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const puppeteer = require('puppeteer');
let browsers = null;
try {
  browsers = require('@puppeteer/browsers');
} catch (e) {
  logger.warn('[WhatsApp Diagnostics] @puppeteer/browsers could not be loaded directly:', { message: e.message });
}

// Event emitter for broadcasting real-time WhatsApp lifecycle events
class WhatsAppEventEmitter extends EventEmitter { }
const whatsappEvents = new WhatsAppEventEmitter();

// Singleton State & Strict Authentication Lock State Machine
// Flow: INITIALIZING -> QR_READY -> SCANNING -> AUTHENTICATING -> READY -> DISCONNECTED
let authState = 'DISCONNECTED';
let client = null;
let isReady = false;
let isAuthenticating = false;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATED' | 'CONNECTED'
let latestQrRaw = null;
let latestQrDataUrl = null;
let lastConnectedTime = null;
let clientInfo = null;
let activeInitPromise = null;
let lastError = null;

// --- Tracked Timer Management ---
const activeTimers = new Map();

/**
 * Starts a managed timer with detailed timestamp logging
 */
function startTrackedTimer(name, callback, delayMs) {
  clearTrackedTimer(name);
  const startTime = new Date().toISOString();
  logger.info(`[Timer] Started [${startTime}] - ${name} (${delayMs}ms)`);

  const timeoutId = setTimeout(async () => {
    activeTimers.delete(name);
    const fireTime = new Date().toISOString();
    logger.info(`[Timer] Fired [${fireTime}] - ${name}`);
    try {
      await callback();
    } catch (err) {
      logger.error(`[Timer Error] [${fireTime}] - ${name}:`, { message: err.message, stack: err.stack });
    }
  }, delayMs);

  activeTimers.set(name, { id: timeoutId, startedAt: startTime, delayMs });
  return timeoutId;
}

/**
 * Cancels a managed timer with detailed timestamp logging
 */
function clearTrackedTimer(name) {
  if (activeTimers.has(name)) {
    const timerInfo = activeTimers.get(name);
    clearTimeout(timerInfo.id);
    activeTimers.delete(name);
    logger.info(`[Timer] Cancelled [${new Date().toISOString()}] - ${name}`);
  }
}

/**
 * Cancels all authentication fallback / status check timers immediately
 */
function clearAllAuthFallbackTimers() {
  for (const [name] of activeTimers.entries()) {
    if (
      name.startsWith('fallback_') ||
      name.startsWith('qr_') ||
      name.startsWith('auth_') ||
      name.startsWith('status_check_')
    ) {
      clearTrackedTimer(name);
    }
  }
}

let currentProgress = {
  progress: 0,
  stage: 'idle',
  status: 'Idle (Disconnected)',
};

/**
 * Emits real-time progress update driven by exact backend lifecycle events
 */
function emitProgress(progress, stage, status) {
  currentProgress = {
    progress: Math.min(100, Math.max(0, Number(progress) || 0)),
    stage,
    status,
    timestamp: new Date().toISOString(),
  };
  logger.info(`[WhatsApp Progress] [${currentProgress.progress}%] [${stage}] ${status}`);
  whatsappEvents.emit('progress', currentProgress);
  whatsappEvents.emit('wa-progress', currentProgress);
  whatsappEvents.emit('status_change', getStatus());
}

/**
 * Normalizes phone number to E.164 without '+' (e.g. 9876543210 -> 919876543210)
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let clean = phone.toString().replace(/\D/g, '');
  if (clean.length === 10) {
    clean = '91' + clean;
  }
  return clean;
}

/**
 * Returns current status snapshot including last error diagnostics and progress
 */
function getStatus() {
  return {
    isReady: Boolean(isReady && client?.ready),
    status: connectionStatus,
    authState,
    progress: currentProgress,
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
    lastConnectedTime,
    clientInfo,
    lastError,
    timestamp: new Date().toISOString(),
  };
}

// Startup timing telemetry
let startupTimers = {
  start: 0,
  browserLaunched: 0,
  waPageLoaded: 0,
  qrGenerated: 0,
  ready: 0,
};

let cachedExecutablePath = null;

/**
 * Fast-resolves browser executable without redundant disk scans or reinstallations.
 */
async function ensureBrowserAvailable() {
  if (cachedExecutablePath && fs.existsSync(cachedExecutablePath)) {
    logger.debug(`[Browser Resolver] Reusing cached executable: ${cachedExecutablePath}`);
    return cachedExecutablePath;
  }

  const projectCacheDir = path.join(__dirname, '../.puppeteer-cache');

  // 1. Check PUPPETEER_EXECUTABLE_PATH env var
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedExecutablePath = envPath;
    logger.info(`[Browser Resolver] Verified PUPPETEER_EXECUTABLE_PATH: "${cachedExecutablePath}"`);
    return cachedExecutablePath;
  }

  // 2. Check standard Puppeteer executablePath (backed by .puppeteerrc.cjs)
  try {
    const defaultPath = puppeteer.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      cachedExecutablePath = defaultPath;
      process.env.PUPPETEER_EXECUTABLE_PATH = cachedExecutablePath;
      logger.info(`[Browser Resolver] Verified standard Puppeteer executable: "${cachedExecutablePath}"`);
      return cachedExecutablePath;
    }
  } catch (_) {}

  // 3. Check project cache directory (.puppeteer-cache)
  if (fs.existsSync(projectCacheDir)) {
    try {
      const findExecutable = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const found = findExecutable(fullPath);
            if (found) return found;
          } else if (file === 'chrome' || file === 'chrome.exe' || file === 'chromium') {
            return fullPath;
          }
        }
        return null;
      };
      const foundInCache = findExecutable(projectCacheDir);
      if (foundInCache && fs.existsSync(foundInCache)) {
        cachedExecutablePath = foundInCache;
        process.env.PUPPETEER_EXECUTABLE_PATH = cachedExecutablePath;
        logger.info(`[Browser Resolver] Found browser in project cache: "${cachedExecutablePath}"`);
        return cachedExecutablePath;
      }
    } catch (_) {}
  }

  // 4. Check common Linux / Render / Windows system paths
  const commonSystemPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const sysPath of commonSystemPaths) {
    if (fs.existsSync(sysPath)) {
      cachedExecutablePath = sysPath;
      process.env.PUPPETEER_EXECUTABLE_PATH = cachedExecutablePath;
      logger.info(`[Browser Resolver] Found system browser: "${cachedExecutablePath}"`);
      return cachedExecutablePath;
    }
  }

  // 5. Only if absolutely missing anywhere on the system, trigger on-demand installation
  if (browsers) {
    logger.warn('[Browser Resolver] No existing browser found on disk. Installing Chrome into project cache...');
    try {
      const platform = browsers.detectBrowserPlatform();
      const buildId = '146.0.7680.31';
      const installed = await browsers.install({
        browser: browsers.Browser.CHROME,
        buildId,
        cacheDir: projectCacheDir,
      });
      if (installed?.executablePath && fs.existsSync(installed.executablePath)) {
        cachedExecutablePath = installed.executablePath;
        process.env.PUPPETEER_EXECUTABLE_PATH = cachedExecutablePath;
        logger.info(`[Browser Resolver] Dynamic browser installation completed: "${cachedExecutablePath}"`);
        return cachedExecutablePath;
      }
    } catch (installErr) {
      logger.error('[Browser Resolver] Dynamic browser install failed:', installErr);
    }
  }

  return null;
}

let memoryLogInterval = null;

/**
 * Starts 5-second interval logging of memory usage during QR and authentication
 */
function startMemoryLogging() {
  if (memoryLogInterval) return;
  memoryLogInterval = setInterval(() => {
    try {
      const mem = process.memoryUsage();
      const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(1);
      logger.info(`[Memory Diagnostics 5s] RSS: ${toMB(mem.rss)}MB | Heap: ${toMB(mem.heapUsed)}MB / ${toMB(mem.heapTotal)}MB | External: ${toMB(mem.external)}MB | Auth State: ${authState}`);
    } catch (_) {}
  }, 5000);
}

function stopMemoryLogging() {
  if (memoryLogInterval) {
    clearInterval(memoryLogInterval);
    memoryLogInterval = null;
  }
}

/**
 * Instantiates and configures single WhatsApp client instance with memory-optimized Puppeteer flags
 */
function setupClient(customExecutablePath = null, mongoStore = null) {
  logger.info(`[WhatsApp Diagnostics] [${new Date().toISOString()}] Instantiating new Client with RemoteAuth...`);

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    '--safebrowsing-disable-auto-update',
    '--renderer-process-limit=1',
    '--js-flags=--max-old-space-size=128',
  ];

  const isDebug = process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug';

  const puppeteerOptions = {
    headless: 'new',
    dumpio: isDebug,
    ignoreHTTPSErrors: true,
    protocolTimeout: 0, // No protocol timeout during authentication
    args: [
      ...puppeteerArgs,
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ],
  };

  if (customExecutablePath && fs.existsSync(customExecutablePath)) {
    puppeteerOptions.executablePath = customExecutablePath;
  }

  const sessionClientId = sessionStore.getSessionName();
  let authStrategy;

  if (mongoStore) {
    logger.info(`[RemoteAuth] Configuring RemoteAuth with MongoStore (clientId: "${sessionClientId}")...`);
    authStrategy = new RemoteAuth({
      clientId: sessionClientId,
      store: mongoStore,
      backupSyncIntervalMs: 300000, // 5 minutes (prevent premature backup during initial handshake)
      dataPath: path.join(__dirname, '../.wwebjs_auth'),
    });
  } else {
    logger.warn('[RemoteAuth] MongoStore is not available. Falling back to NoAuth.');
    authStrategy = new NoAuth();
  }

  client = new Client({
    authStrategy,
    authTimeoutMs: 300000, // 5 minutes - eliminates 30s default timeout
    qrMaxRetries: 0,
    takeoverOnConflict: false,
    takeoverTimeoutMs: 0,
    bypassCSP: true,
    puppeteer: puppeteerOptions,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018944883-alpha.html',
    },
  });

  client.ready = false;

  async function handleClientReady() {
    if (isReady && client?.ready) return;

    logger.info(`[WA Event] [${new Date().toISOString()}] READY - Transitioning connection status to CONNECTED`);
    authState = 'READY';
    isReady = true;
    isAuthenticating = false;
    stopMemoryLogging();
    if (client) client.ready = true;
    connectionStatus = 'CONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastConnectedTime = new Date().toISOString();
    lastError = null;

    try {
      clientInfo = {
        pushname: client?.info?.pushname || 'Bhagwat Library Admin',
        wid: client?.info?.wid?.user || '',
        platform: client?.info?.platform || 'web',
      };
      logger.info('[WhatsApp Diagnostics] Connected Account Info:', clientInfo);
    } catch (_) {
      clientInfo = { pushname: 'Bhagwat Library Admin' };
    }

    whatsappEvents.emit('status_change', getStatus());
  }

  // --- Detailed Diagnostic Lifecycle Event Listeners with Safe Try/Catch ---
  client.on('loading_screen', (percent, message) => {
    try {
      const timestamp = new Date().toISOString();
      const pct = Number(percent) || 0;

      // Strict Lock: Transition to SCANNING / AUTHENTICATING and cancel all timers
      if (pct > 0) {
        authState = 'AUTHENTICATING';
        isAuthenticating = true;
        connectionStatus = 'AUTHENTICATING';
      } else {
        authState = 'SCANNING';
        isAuthenticating = true;
        connectionStatus = 'AUTHENTICATING';
      }
      clearAllAuthFallbackTimers();
      startMemoryLogging();

      if (!startupTimers.waPageLoaded) {
        startupTimers.waPageLoaded = Date.now();
        logger.info(`[Startup Metrics] [${timestamp}] ⏱️ WhatsApp Web Load Time: ${startupTimers.waPageLoaded - startupTimers.start}ms (${((startupTimers.waPageLoaded - startupTimers.start) / 1000).toFixed(1)}s)`);
      }
      logger.info(`[WA Event] [${timestamp}] [Auth Lock State: ${authState}] LOADING ${percent}% - ${message}`);

      if (pct === 100) {
        emitProgress(75, 'loading_100', 'WhatsApp Web loaded 100%');
      } else if (pct > 0) {
        emitProgress(50, 'loading_whatsapp', `WhatsApp loading ${pct}%...`);
      } else {
        emitProgress(50, 'loading_whatsapp', 'WhatsApp loading...');
      }
    } catch (err) {
      logger.error('[WA Event Error] Error in loading_screen handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('authenticated', async (authPayload) => {
    try {
      const timestamp = new Date().toISOString();
      authState = 'AUTHENTICATING';
      isAuthenticating = true;
      connectionStatus = 'AUTHENTICATING';
      startMemoryLogging();

      // Strict Lock: Cancel all timers and suppress any further initialization
      clearAllAuthFallbackTimers();

      logger.info(`[WA Event] [${timestamp}] [Auth Lock State: ${authState}] AUTHENTICATED`, { authPayload: authPayload ? 'PRESENT' : 'DEFAULT' });
      logger.info(`[RemoteAuth] [${timestamp}] Session handshake authenticated. Waiting for client ready event...`);
      emitProgress(85, 'authenticated', 'Authenticated - Completing handshake...');

      latestQrRaw = null;
      latestQrDataUrl = null;
      lastError = null;
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in authenticated handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('auth_failure', async (msg) => {
    try {
      const timestamp = new Date().toISOString();
      clearAllAuthFallbackTimers();
      stopMemoryLogging();
      logger.error(`[WA Event] [${timestamp}] [Auth Lock State: ${authState}] AUTH FAILURE:`, msg);
      emitProgress(currentProgress.progress, 'error', `Authentication failed: ${msg}`);

      authState = 'DISCONNECTED';
      isReady = false;
      isAuthenticating = false;
      if (client) client.ready = false;
      connectionStatus = 'DISCONNECTED';
      latestQrRaw = null;
      latestQrDataUrl = null;
      lastError = {
        message: `Authentication failed: ${msg}`,
        timestamp,
      };
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in auth_failure handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('ready', async () => {
    try {
      const timestamp = new Date().toISOString();
      authState = 'READY';
      isAuthenticating = false;
      isReady = true;
      connectionStatus = 'CONNECTED';
      stopMemoryLogging();

      // Immediately cancel any fallback / status check timers
      clearAllAuthFallbackTimers();

      startupTimers.ready = Date.now();
      logger.info(`[Startup Metrics] [${timestamp}] ⏱️ Client Ready Time: ${startupTimers.ready - startupTimers.start}ms (${((startupTimers.ready - startupTimers.start) / 1000).toFixed(1)}s)`);
      logger.info(`[WA Event] [${timestamp}] [Auth Lock State: ${authState}] READY`);
      emitProgress(100, 'ready', 'WhatsApp Connected & Ready!');

      try {
        logger.info(`[WA State] [${timestamp}]:`, await client.getState());
      } catch (e) {
        logger.error(`[WA State Error] [${timestamp}]:`, e.message);
      }

      await handleClientReady();

      // Trigger backup once client is fully ready and stable
      startTrackedTimer('post_ready_backup_5s', async () => {
        await forceSaveRemoteSession('post_ready_5s');
      }, 5000);
    } catch (err) {
      logger.error('[WA Event Error] Error in ready handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('change_state', (state) => {
    try {
      const timestamp = new Date().toISOString();
      logger.info(`[WA Event] [${timestamp}] [Auth Lock State: ${authState}] CHANGE_STATE:`, state);
      if (state === 'CONNECTED' && currentProgress.progress < 95) {
        emitProgress(95, 'session_backup', 'Session backup syncing to MongoDB');
      }
    } catch (err) {
      logger.error('[WA Event Error] Error in change_state handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('disconnected', (reason) => {
    try {
      const timestamp = new Date().toISOString();
      clearAllAuthFallbackTimers();
      stopMemoryLogging();

      if (authState === 'SCANNING' || authState === 'AUTHENTICATING') {
        logger.error(`[WA Disconnected during Auth] [${timestamp}] Disconnected while in state "${authState}". Reason:`, reason);
      } else {
        logger.warn(`[WA Event] [${timestamp}] DISCONNECTED:`, reason);
      }

      emitProgress(0, 'disconnected', `Disconnected: ${reason}`);
      authState = 'DISCONNECTED';
      isReady = false;
      isAuthenticating = false;
      if (client) client.ready = false;
      connectionStatus = 'DISCONNECTED';
      latestQrRaw = null;
      latestQrDataUrl = null;
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in disconnected handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('remote_session_saved', async () => {
    try {
      const timestamp = new Date().toISOString();
      logger.info(`[WA Event] [${timestamp}] REMOTE_SESSION_SAVED`);
      emitProgress(95, 'session_backup', 'Session backup synced to MongoDB');

      try {
        const details = await sessionStore.inspectSessionDetails();
        if (details && details.filesCount > 0) {
          logger.info(`[RemoteAuth] [${timestamp}] Session found in MongoDB! Collection: "${details.bucketName}.files" (${details.filesCount} file, ${details.chunksCount} chunks).`);
        } else {
          logger.warn(`[RemoteAuth] [${timestamp}] No session found in MongoDB after remote_session_saved event.`);
        }
      } catch (inspErr) {
        logger.debug(`[RemoteAuth] [${timestamp}] Notice inspecting MongoDB session details:`, inspErr.message);
      }
    } catch (err) {
      logger.error('[WA Event Error] Error in remote_session_saved handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('remote_session_loaded', () => {
    try {
      const timestamp = new Date().toISOString();
      logger.info(`[WA Event] [${timestamp}] REMOTE_SESSION_LOADED`);
    } catch (err) {
      logger.error('[WA Event Error] Error in remote_session_loaded handler:', { message: err?.message, stack: err?.stack });
    }
  });

  client.on('message', () => {
    logger.debug('[WA Event] MESSAGE EVENT');
  });

  // Event: QR Code Received
  client.on('qr', async (qr) => {
    try {
      const timestamp = new Date().toISOString();

      // 1. Strict Lock: NEVER emit or process QR code during SCANNING, AUTHENTICATING, or READY
      if (
        authState === 'SCANNING' ||
        authState === 'AUTHENTICATING' ||
        authState === 'READY' ||
        isReady ||
        isAuthenticating ||
        connectionStatus === 'AUTHENTICATED' ||
        connectionStatus === 'CONNECTED' ||
        currentProgress.progress > 70
      ) {
        logger.info(`[Auth Lock] [${timestamp}] Suppressing QR emission during active state: "${authState}" (isAuthenticating: ${isAuthenticating}). Handshake in progress.`);
        return;
      }

      // 2. Ignore identical duplicate QR string if already generated
      if (latestQrRaw === qr && latestQrDataUrl) {
        return;
      }

      authState = 'QR_READY';
      startMemoryLogging();
      startupTimers.qrGenerated = Date.now();
      logger.info(`[Startup Metrics] [${timestamp}] ⏱️ QR Generation Time: ${startupTimers.qrGenerated - startupTimers.start}ms (${((startupTimers.qrGenerated - startupTimers.start) / 1000).toFixed(1)}s)`);
      logger.info(`[WA Event] [${timestamp}] ===== QR CODE RECEIVED =====`);
      latestQrRaw = qr;
      try {
        latestQrDataUrl = await QRCode.toDataURL(qr, {
          margin: 2,
          width: 320,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
      } catch (err) {
        logger.error('[WhatsApp Diagnostics] Error generating QR Data URL', {
          message: err.message,
          stack: err.stack,
        });
      }

      connectionStatus = 'QR_READY';
      isReady = false;
      if (client) client.ready = false;
      lastError = null;
      emitProgress(70, 'qr_generated', 'QR code generated. Scan with phone.');

      console.log('\n--- SCAN THIS QR CODE FOR WHATSAPP AUTHENTICATION ---');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('-----------------------------------------------------\n');

      whatsappEvents.emit('qr', { qrRaw: latestQrRaw, qrDataUrl: latestQrDataUrl });
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in qr handler:', { message: err?.message, stack: err?.stack });
    }
  });
}

/**
 * Starts WhatsApp client on-demand (idempotent, single active instance with promise lock)
 */
async function startClient() {
  console.log("Initialize requested from:", new Error().stack);

  // 1. Return immediately if already fully connected and ready
  if (isReady && client && client.ready) {
    logger.info('[RemoteAuth] Client already connected and ready. Returning existing session.');
    emitProgress(100, 'ready', 'WhatsApp Connected & Ready!');
    return getStatus();
  }

  // 2. Return active in-flight initialization promise to prevent double-initialization
  if (activeInitPromise) {
    logger.info('[RemoteAuth] Client initialization already in flight. Awaiting existing promise...');
    return activeInitPromise;
  }

  // 3. Strict Lock: NEVER restart or create another client if authentication is in progress
  if (authState === 'SCANNING' || authState === 'AUTHENTICATING' || isAuthenticating || connectionStatus === 'AUTHENTICATED') {
    logger.info(`[Auth Lock] [${new Date().toISOString()}] startClient() ignored: Authentication actively in progress (State: ${authState}, Status: ${connectionStatus}). Waiting for handshake.`);
    return getStatus();
  }

  // 4. Create and lock initialization promise (state-driven, never aborted by browser connection check)
  activeInitPromise = (async () => {
    authState = 'INITIALIZING';
    startupTimers = {
      start: Date.now(),
      browserLaunched: 0,
      waPageLoaded: 0,
      qrGenerated: 0,
      ready: 0,
    };
    connectionStatus = 'CONNECTING';
    lastError = null;
    emitProgress(10, 'mongo_connected', 'MongoDB connected');

    try {
      if (client && !isAuthenticating && authState !== 'SCANNING' && authState !== 'AUTHENTICATING') {
        logger.info('[WhatsApp Diagnostics] Cleaning up previous client before startup...');
        console.log("Destroy requested from:", new Error().stack);
        try {
          await client.destroy();
        } catch (err) {
          logger.debug('[WhatsApp Diagnostics] Cleanup notice:', { message: err.message });
        }
        client = null;
      }

      // Connect MongoDB and create MongoStore
      logger.info('[RemoteAuth] Initializing MongoDB connection for WhatsApp session store...');
      const mongoStore = await sessionStore.connectAndGetStore();
      if (!mongoStore) {
        throw new Error('[RemoteAuth] MongoDB connection could not be established. Startup aborted.');
      }
      emitProgress(10, 'mongo_connected', 'MongoDB connected');

      const sessionClientId = sessionStore.getSessionName();
      logger.info(`[RemoteAuth] Active clientId: "${sessionClientId}" (Session Name: "RemoteAuth-${sessionClientId}")`);

      // Check if existing session is present in MongoDB
      const hasExistingSession = await sessionStore.sessionExists();
      if (hasExistingSession) {
        logger.info(`[RemoteAuth] Session found in MongoDB for "${sessionClientId}". Restoring session without QR...`);
        emitProgress(25, 'restoring_session', 'Restoring session from MongoDB...');
      } else {
        logger.info(`[RemoteAuth] No session found in MongoDB for "${sessionClientId}". QR generation will be required.`);
      }

      // Resolve browser executable
      emitProgress(20, 'browser_launching', 'Browser launching...');
      const resolvedExecutablePath = await ensureBrowserAvailable();

      // Configure client with resolved browser and MongoStore
      setupClient(resolvedExecutablePath, mongoStore);
      logger.info(`[client.initialize() Invocation] [${new Date().toISOString()}] Executing client.initialize()...`);
      console.log("Initialize requested from:", new Error().stack);

      await client.initialize();
      logger.info(`[client.initialize() Resolved] [${new Date().toISOString()}] WhatsApp client.initialize() promise resolved successfully.`);

      if (client.pupBrowser) {
        startupTimers.browserLaunched = Date.now();
        logger.info(`[Startup Metrics] ⏱️ Browser Launch Time: ${startupTimers.browserLaunched - startupTimers.start}ms (${((startupTimers.browserLaunched - startupTimers.start) / 1000).toFixed(1)}s)`);
        emitProgress(35, 'browser_connected', 'Browser connected');

        client.pupBrowser.on('disconnected', () => {
          const timestamp = new Date().toISOString();
          logger.warn(`[WA Browser Event] [${timestamp}] Browser disconnected`);
          emitProgress(0, 'browser_disconnected', 'Browser disconnected');
        });
      }

      if (client.pupPage) {
        client.pupPage.on('close', () => {
          const timestamp = new Date().toISOString();
          logger.warn(`[WA Page Event] [${timestamp}] Page closed`);
        });

        client.pupPage.on('console', (msg) => {
          logger.debug('[Browser]', msg.text());
        });

        client.pupPage.on('pageerror', (err) => {
          logger.debug('[Browser Page Error]', err.message);
        });
      }
    } catch (err) {
      lastError = {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      };
      logger.error('[WhatsApp Diagnostics] WhatsApp initialization failed', {
        message: err.message,
        stack: err.stack,
      });
      authState = 'DISCONNECTED';
      connectionStatus = 'DISCONNECTED';
      isReady = false;
      isAuthenticating = false;
      whatsappEvents.emit('status_change', getStatus());
    } finally {
      activeInitPromise = null;
    }

    return getStatus();
  })();

  return activeInitPromise;
}

/**
 * Gracefully destroys client and frees memory on explicit user logout
 */
async function destroyClient() {
  console.log("Destroy requested from:", new Error().stack);

  // Strict Lock: NEVER destroy client while SCANNING or AUTHENTICATING
  if (authState === 'SCANNING' || authState === 'AUTHENTICATING' || isAuthenticating) {
    logger.warn(`[Auth Lock] [${new Date().toISOString()}] BLOCKED destroyClient() during active authentication (State: ${authState}). Handshake protected.`);
    return getStatus();
  }

  // Cancel all active managed timers
  for (const name of activeTimers.keys()) {
    clearTrackedTimer(name);
  }

  if (client) {
    try {
      console.log("Logout requested from:", new Error().stack);
      await client.logout();
      logger.info('[WhatsApp Diagnostics] Client logged out.');
    } catch (_) { }

    try {
      console.log("Browser close requested from:", new Error().stack);
      await client.destroy();
      logger.info('[WhatsApp Diagnostics] Client destroyed successfully.');
    } catch (err) {
      logger.warn('[WhatsApp Diagnostics] Warning during client.destroy():', {
        message: err.message,
      });
    }
    client = null;
  }

  // Delete remote session on explicit logout
  try {
    await sessionStore.deleteSession();
    logger.info('[RemoteAuth] Session deleted on explicit logout');
  } catch (err) {
    logger.warn('[RemoteAuth] Error deleting session on logout:', { message: err.message });
  }

  authState = 'DISCONNECTED';
  isReady = false;
  isAuthenticating = false;
  connectionStatus = 'DISCONNECTED';
  latestQrRaw = null;
  latestQrDataUrl = null;
  clientInfo = null;
  activeInitPromise = null;

  whatsappEvents.emit('status_change', getStatus());
  logger.info('[WhatsApp Diagnostics] Client destroyed. Browser process closed and memory cleared.');
  return getStatus();
}

/**
 * Gets or triggers QR code generation (safe and idempotent)
 */
async function getQr() {
  if (isReady && client?.ready) {
    return {
      status: 'CONNECTED',
      qrCode: null,
      rawQr: null,
      message: 'WhatsApp is already connected.',
    };
  }

  if (authState === 'SCANNING' || authState === 'AUTHENTICATING' || connectionStatus === 'AUTHENTICATED' || isAuthenticating) {
    return {
      status: 'AUTHENTICATING',
      qrCode: null,
      rawQr: null,
      message: 'Authentication in progress...',
    };
  }

  if (!client && connectionStatus === 'DISCONNECTED' && !activeInitPromise) {
    startClient().catch((err) => {
      logger.error('[WhatsApp Diagnostics] Error triggering on-demand QR start:', {
        message: err.message,
      });
    });
  }

  return {
    status: connectionStatus,
    authState,
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
    lastError,
  };
}

/**
 * Returns active WhatsApp client instance
 */
function getClient() {
  return client;
}

/**
 * Downloads media from URL and converts to base64 MessageMedia
 */
async function getMediaFromUrl(url, filename) {
  if (url.startsWith('/uploads/') || url.includes('/uploads/')) {
    const localRelative = url.startsWith('/uploads/') ? url.replace('/uploads/', '') : url.split('/uploads/')[1];
    const localPath = path.join(__dirname, '../uploads', localRelative);
    if (fs.existsSync(localPath)) {
      try {
        const fileData = fs.readFileSync(localPath);
        const base64Data = fileData.toString('base64');
        return new MessageMedia('application/pdf', base64Data, filename || 'invoice.pdf');
      } catch (err) {
        logger.error(`Failed to read local file: ${localPath}`, {
          message: err.message,
          stack: err.stack,
        });
      }
    }
  }

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mimeType = response.headers['content-type'] || 'application/pdf';
    const base64Data = Buffer.from(response.data, 'binary').toString('base64');
    return new MessageMedia(mimeType, base64Data, filename || 'document.pdf');
  } catch (err) {
    logger.error(`Failed to download document from URL: ${url}`, {
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verifies that the WhatsApp client, browser, and page are healthy and open.
 */
async function verifyClientHealth() {
  if (isReady && client && client.ready && client.pupBrowser?.isConnected() && client.pupPage && !client.pupPage.isClosed()) {
    return;
  }

  if (activeInitPromise) {
    logger.info('[WhatsApp Health] Waiting for in-flight initialization...');
    await activeInitPromise;
  } else if (!client || !isReady || !client.ready) {
    logger.info('[WhatsApp Health] Client not ready. Triggering startClient()...');
    await startClient();
  }

  if (!client || !client.pupPage || client.pupPage.isClosed()) {
    throw new Error('WhatsApp browser page is closed or unavailable. Please retry shortly.');
  }
}

/**
 * Sends text message to single recipient
 */
async function sendTextMessage(phone, message) {
  await verifyClientHealth();

  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  logger.debug('[WhatsApp Dispatch] Starting send process:', {
    originalPhone: phone,
    sanitizedPhone: normalizedPhone,
    chatId: rawChatId,
    messageLength: message ? message.length : 0,
  });

  if (!normalizedPhone || normalizedPhone.length < 10) {
    const err = new Error(`Invalid sanitized phone number: "${normalizedPhone}" (original: "${phone}"). Must be at least 10 digits.`);
    logger.error('[WhatsApp Dispatch Error]', { message: err.message });
    throw err;
  }

  if (!rawChatId.endsWith('@c.us') || rawChatId.length < 15) {
    const err = new Error(`Invalid chatId format: "${rawChatId}". Must match 91XXXXXXXXXX@c.us format.`);
    logger.error('[WhatsApp Dispatch Error]', { message: err.message });
    throw err;
  }

  let resolvedChatId = rawChatId;
  try {
    const numberId = await client.getNumberId(normalizedPhone);
    if (numberId && numberId._serialized) {
      resolvedChatId = numberId._serialized;
    } else {
      logger.warn(`[WhatsApp Dispatch] client.getNumberId("${normalizedPhone}") returned null. Fallback to constructed chatId "${rawChatId}".`);
    }
  } catch (lookupErr) {
    logger.warn(`[WhatsApp Dispatch] getNumberId failed for "${normalizedPhone}": ${lookupErr.message}. Fallback to constructed chatId "${rawChatId}".`);
  }

  const startTime = Date.now();
  try {
    const result = await client.sendMessage(resolvedChatId, message);
    const duration = Date.now() - startTime;
    logger.info(`[WhatsApp Dispatch] Message sent successfully to ${resolvedChatId} in ${duration}ms (Message ID: ${result.id?.id || result.id?._serialized})`);
    return {
      success: true,
      messageId: result.id?.id || result.id?._serialized,
      chatId: resolvedChatId,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`[WhatsApp Dispatch Failed] sendMessage failed after ${duration}ms:`, {
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Sends document/media attachment to single recipient
 */
async function sendDocument(phone, fileUrl, filename, caption = '') {
  await verifyClientHealth();

  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error(`Invalid phone number: "${phone}".`);
  }

  let resolvedChatId = rawChatId;
  try {
    const numberId = await client.getNumberId(normalizedPhone);
    if (numberId && numberId._serialized) {
      resolvedChatId = numberId._serialized;
    }
  } catch (_) {}

  logger.info(`[WhatsApp Dispatch] Downloading media attachment from ${fileUrl}...`);
  const media = await getMediaFromUrl(fileUrl, filename);

  const startTime = Date.now();
  try {
    const result = await client.sendMessage(resolvedChatId, media, { caption });
    const duration = Date.now() - startTime;
    logger.info(`[WhatsApp Dispatch] Document sent successfully to ${resolvedChatId} in ${duration}ms (Message ID: ${result.id?.id || result.id?._serialized})`);
    return {
      success: true,
      messageId: result.id?.id || result.id?._serialized,
      chatId: resolvedChatId,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`[WhatsApp Dispatch Failed] sendDocument failed after ${duration}ms:`, {
      message: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Helper: Sends Invoice Template Message with PDF Attachment
 */
async function sendInvoiceTemplate(phone, invoiceData) {
  const { studentName, invoiceNumber, amount, dueDate, pdfUrl } = invoiceData;
  const message = `🧾 *BHAGWAT LIBRARY — INVOICE*\n\nDear *${studentName}*,\nYour fee invoice *#${invoiceNumber}* for INR *${amount}* has been generated.\n\n📅 Due Date: ${dueDate}\n\nPlease find your official invoice PDF attached.\nThank you!`;

  if (pdfUrl) {
    return sendDocument(phone, pdfUrl, `Invoice_${invoiceNumber || 'receipt'}.pdf`, message);
  }
  return sendTextMessage(phone, message);
}

/**
 * Helper: Sends Validity/Fee Reminder Template Message
 */
async function sendReminderTemplate(phone, reminderData) {
  const { studentName, validityDate, seatNumber, dueDays } = reminderData;
  let urgency = 'due soon';
  if (dueDays === 0) urgency = 'expires TODAY';
  else if (dueDays === 1) urgency = 'expires TOMORROW';
  else if (dueDays < 0) urgency = `is OVERDUE by ${Math.abs(dueDays)} days`;

  const seatText = seatNumber ? ` (Seat #${seatNumber})` : '';
  const message = `📚 *BHAGWAT LIBRARY — MEMBERSHIP REMINDER*\n\nDear *${studentName}*,\nYour monthly library membership validity${seatText} *${urgency}* on *${validityDate}*.\n\nPlease renew your membership to continue uninterrupted seat access.\n\nThank you!\n*Bhagwat Library*`;
  return sendTextMessage(phone, message);
}

/**
 * Sends batch of text messages sequentially with delay
 */
async function sendBulkMessages(phones, message, delayMs = 1500) {
  await verifyClientHealth();

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    try {
      const res = await sendTextMessage(phone, message);
      results.push({ phone, success: true, ...res });
      successCount++;
    } catch (err) {
      results.push({ phone, success: false, error: err.message });
      failureCount++;
    }

    if (i < phones.length - 1) {
      await sleep(delayMs);
    }
  }

  return {
    success: true,
    totalCount: phones.length,
    successCount,
    failureCount,
    results,
  };
}

/**
 * Explicitly triggers RemoteAuth session compression and upload to MongoDB
 */
async function forceSaveRemoteSession(trigger = 'manual') {
  if (!client || !client.authStrategy || typeof client.authStrategy.storeRemoteSession !== 'function') {
    logger.debug(`[RemoteAuth] Cannot execute forceSaveRemoteSession (${trigger}): RemoteAuth strategy is not active.`);
    return false;
  }

  logger.info(`[RemoteAuth] Triggering forceSaveRemoteSession (trigger: "${trigger}")...`);
  try {
    await client.authStrategy.storeRemoteSession({ emit: true });
    const details = await sessionStore.inspectSessionDetails();
    if (details && details.filesCount > 0) {
      logger.info(`[RemoteAuth] Verification confirmed: Session document exists in MongoDB!`, {
        trigger,
        database: details.databaseName,
        collection: `${details.bucketName}.files`,
        filesCount: details.filesCount,
        latestFileId: details.files[0]?.id,
        uploadDate: details.files[0]?.uploadDate,
      });
      return true;
    } else {
      logger.warn(`[RemoteAuth] Notice: Session store inspected after "${trigger}" but 0 files found.`);
      return false;
    }
  } catch (err) {
    logger.error(`[RemoteAuth] Session backup failed during trigger "${trigger}":`, {
      message: err.message,
      stack: err.stack,
    });
    return false;
  }
}

/**
 * Saves current session before graceful server shutdown
 */
async function persistSessionBeforeExit() {
  logger.info('[RemoteAuth] Flushing and saving WhatsApp session to MongoDB before shutdown...');
  await forceSaveRemoteSession('graceful_shutdown');
}

module.exports = {
  startClient,
  destroyClient,
  forceSaveRemoteSession,
  persistSessionBeforeExit,
  getQr,
  getStatus,
  sendTextMessage,
  sendWhatsAppMessage: sendTextMessage,
  sendDocument,
  sendInvoiceTemplate,
  sendReminderTemplate,
  sendBulkMessages,
  reconnect: startClient,
  refreshQr: startClient,
  events: whatsappEvents,
  get ready() {
    return Boolean(isReady && client && client.ready);
  },
  get authState() {
    return authState;
  },
};
