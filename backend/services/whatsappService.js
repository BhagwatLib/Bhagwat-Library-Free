/**
 * whatsappService.js - Production-ready on-demand WhatsApp gateway with full diagnostics
 *
 * Architecture:
 * - Idle / DISCONNECTED on server startup (0 Puppeteer memory overhead).
 * - Starts ONLY when requested via /start or /qr.
 * - Single active browser instance enforced.
 * - Uses Puppeteer bundled Chromium automatically (headless: "new").
 * - Temporary QR session (NoAuth) — fully ephemeral, zero file locks.
 * - Full cleanup on logout / destroy (frees browser & memory).
 * - Complete diagnostics & stack trace logging for Render deployment troubleshooting.
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

// Singleton State
let client = null;
let isReady = false;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATED' | 'CONNECTED'
let latestQrRaw = null;
let latestQrDataUrl = null;
let lastConnectedTime = null;
let clientInfo = null;
let isInitializing = false;
let lastError = null;

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
 * Reuses existing Chromium binary immediately.
 */
async function ensureBrowserAvailable() {
  if (cachedExecutablePath && fs.existsSync(cachedExecutablePath)) {
    logger.debug(`[Browser Resolver] Reusing cached executable: ${cachedExecutablePath}`);
    return cachedExecutablePath;
  }

  // 1. Check PUPPETEER_EXECUTABLE_PATH env var
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedExecutablePath = envPath;
    logger.info(`[Browser Resolver] Found browser via PUPPETEER_EXECUTABLE_PATH: ${cachedExecutablePath}`);
    return cachedExecutablePath;
  }

  // 2. Check standard Puppeteer executable
  try {
    const defaultPath = puppeteer.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      cachedExecutablePath = defaultPath;
      logger.info(`[Browser Resolver] Found standard Puppeteer browser: ${cachedExecutablePath}`);
      return cachedExecutablePath;
    }
  } catch (_) {}

  // 3. Fast check common Linux / Render / Windows system paths
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
      logger.info(`[Browser Resolver] Found system browser: ${cachedExecutablePath}`);
      return cachedExecutablePath;
    }
  }

  // 4. Check project cache directory (.puppeteer-cache)
  const projectCacheDir = path.join(__dirname, '../.puppeteer-cache');
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
        logger.info(`[Browser Resolver] Found cached project browser: ${cachedExecutablePath}`);
        return cachedExecutablePath;
      }
    } catch (_) {}
  }

  // 5. Only if absolutely missing anywhere on the system, trigger on-demand installation
  if (browsers) {
    logger.warn('[Browser Resolver] No existing browser found on disk. Installing Chrome via @puppeteer/browsers...');
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
        logger.info(`[Browser Resolver] Dynamic browser installation completed: ${cachedExecutablePath}`);
        return cachedExecutablePath;
      }
    } catch (installErr) {
      logger.error('[Browser Resolver] Dynamic browser install failed:', installErr);
    }
  }

  return null;
}

/**
 * Instantiates and configures single WhatsApp client instance with optimized Puppeteer flags
 */
function setupClient(customExecutablePath = null, mongoStore = null) {
  logger.debug('[WhatsApp Diagnostics] Creating WhatsApp Client...');

  // High performance headless Chrome flags for instant launch
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
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    '--safebrowsing-disable-auto-update',
  ];

  const isDebug = process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug';

  const puppeteerOptions = {
    headless: 'new',
    dumpio: isDebug,
    ignoreHTTPSErrors: true,
    protocolTimeout: 300000,
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
      backupSyncIntervalMs: 60000,
      dataPath: path.join(__dirname, '../.wwebjs_auth'),
    });
  } else {
    logger.warn('[RemoteAuth] MongoStore is not available. Falling back to NoAuth.');
    authStrategy = new NoAuth();
  }

  client = new Client({
    authStrategy,
    puppeteer: puppeteerOptions,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018944813-alpha.html',
    },
  });

  client.ready = false;

  async function handleClientReady() {
    if (isReady && client?.ready) return;

    logger.info('[RemoteAuth] Connected');
    logger.info('[WA] READY - Transitioning connection status to CONNECTED');
    isReady = true;
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

  // --- Detailed Diagnostic Lifecycle Event Listeners ---
  client.on('loading_screen', (percent, message) => {
    if (!startupTimers.waPageLoaded) {
      startupTimers.waPageLoaded = Date.now();
      logger.info(`[Startup Metrics] ⏱️ WhatsApp Web Load Time: ${startupTimers.waPageLoaded - startupTimers.start}ms (${((startupTimers.waPageLoaded - startupTimers.start) / 1000).toFixed(1)}s)`);
    }
    logger.info(`[WA] LOADING ${percent}% - ${message}`);
    const pct = Number(percent) || 0;
    if (pct === 100) {
      emitProgress(75, 'loading_100', 'WhatsApp Web loaded 100%');
    } else if (pct > 0) {
      const calculatedProgress = Math.round(35 + (pct * 0.39));
      emitProgress(calculatedProgress, 'loading_whatsapp', `Loading WhatsApp ${pct}% - ${message || 'Syncing'}`);
    } else {
      emitProgress(10, 'qr_scanned', 'QR scanned by phone. Loading...');
    }
  });

  client.on('authenticated', async () => {
    logger.info('[RemoteAuth] authenticated');
    logger.info('[RemoteAuth] Session restored');
    logger.info('[WA] AUTHENTICATED');
    emitProgress(85, 'authenticated', 'Authentication complete');

    connectionStatus = 'AUTHENTICATED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastError = null;
    whatsappEvents.emit('status_change', getStatus());

    // Proactively backup session to MongoDB shortly after authentication
    setTimeout(async () => {
      await forceSaveRemoteSession('post_authenticated_5s');
    }, 5000);

    setTimeout(async () => {
      await forceSaveRemoteSession('post_authenticated_20s');
    }, 20000);
  });

  client.on('auth_failure', async (msg) => {
    logger.error('[WA] AUTH FAILURE', msg);
    emitProgress(currentProgress.progress, 'error', `Authentication failed: ${msg}`);

    isReady = false;
    if (client) client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastError = {
      message: `Authentication failed: ${msg}`,
      timestamp: new Date().toISOString(),
    };
    whatsappEvents.emit('status_change', getStatus());
  });

  client.on('ready', async () => {
    startupTimers.ready = Date.now();
    logger.info(`[Startup Metrics] ⏱️ Client Ready Time: ${startupTimers.ready - startupTimers.start}ms (${((startupTimers.ready - startupTimers.start) / 1000).toFixed(1)}s)`);
    logger.info('[RemoteAuth] ready');
    logger.info('[RemoteAuth] Connected');
    logger.info('[RemoteAuth] Session restored');
    logger.info('[WA] READY');
    emitProgress(100, 'ready', 'WhatsApp Connected & Ready!');

    try {
      logger.info(await client.getState());
    } catch (e) {
      logger.error(e);
    }

    await handleClientReady();

    // Trigger backup once client is fully ready and stable
    setTimeout(async () => {
      await forceSaveRemoteSession('post_ready_5s');
    }, 5000);
  });

  client.on('change_state', (state) => {
    logger.info('[WA] STATE:', state);
    if (state === 'CONNECTED' && currentProgress.progress < 95) {
      emitProgress(95, 'client_state_connected', 'Client state CONNECTED');
    }
  });

  client.on('disconnected', (reason) => {
    logger.warn('[RemoteAuth] disconnected:', reason);
    logger.warn('[WA] DISCONNECTED:', reason);
    emitProgress(0, 'disconnected', `Disconnected: ${reason}`);
    isReady = false;
    if (client) client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    whatsappEvents.emit('status_change', getStatus());
  });

  client.on('remote_session_saved', async () => {
    logger.info('[RemoteAuth] remote_session_saved');
    logger.info('[RemoteAuth] Session saved');
    logger.info('[WA] REMOTE SESSION SAVED');
    if (currentProgress.progress < 90) {
      emitProgress(90, 'remote_auth_connected', 'RemoteAuth session synced');
    }

    // Inspect MongoDB GridFS collections and verify document existence
    try {
      const details = await sessionStore.inspectSessionDetails();
      if (details && details.filesCount > 0) {
        logger.info(`[RemoteAuth] Session found in MongoDB! Collection: "${details.bucketName}.files" (${details.filesCount} file, ${details.chunksCount} chunks).`);
      } else {
        logger.warn('[RemoteAuth] No session found in MongoDB after remote_session_saved event.');
      }
    } catch (inspErr) {
      logger.debug('[RemoteAuth] Notice inspecting MongoDB session details:', inspErr.message);
    }
  });

  client.on('message', () => {
    logger.info('[WA] MESSAGE EVENT');
  });

  // Event: QR Code Received
  client.on('qr', async (qr) => {
    startupTimers.qrGenerated = Date.now();
    logger.info(`[Startup Metrics] ⏱️ QR Generation Time: ${startupTimers.qrGenerated - startupTimers.start}ms (${((startupTimers.qrGenerated - startupTimers.start) / 1000).toFixed(1)}s)`);
    logger.info('[WhatsApp Diagnostics] ===== QR CODE RECEIVED =====');
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
      logger.info('[WhatsApp Diagnostics] QR Data URL generated successfully.');
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
    emitProgress(0, 'qr_generated', 'QR code generated. Scan with phone.');

    console.log('\n--- SCAN THIS QR CODE FOR WHATSAPP AUTHENTICATION ---');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('-----------------------------------------------------\n');

    whatsappEvents.emit('qr', { qrRaw: latestQrRaw, qrDataUrl: latestQrDataUrl });
    whatsappEvents.emit('status_change', getStatus());
  });
}

/**
 * Starts WhatsApp client on-demand (ensures only 1 active instance)
 */
async function startClient() {
  if (isReady && client && client.ready) {
    logger.info('[RemoteAuth] Client already connected and ready. Returning existing session.');
    emitProgress(100, 'ready', 'WhatsApp Connected & Ready!');
    return getStatus();
  }

  if (client && client.pupBrowser && client.pupBrowser.isConnected() && client.pupPage && !client.pupPage.isClosed()) {
    logger.info('[RemoteAuth] Browser already running and connected. Returning existing instance.');
    return getStatus();
  }

  if (isInitializing) {
    logger.info('[RemoteAuth] Client initialization already in progress. Awaiting completion...');
    return getStatus();
  }

  isInitializing = true;
  startupTimers = {
    start: Date.now(),
    browserLaunched: 0,
    waPageLoaded: 0,
    qrGenerated: 0,
    ready: 0,
  };
  connectionStatus = 'CONNECTING';
  lastError = null;
  emitProgress(20, 'browser_launching', 'Browser launching...');

  try {
    if (client) {
      logger.info('[WhatsApp Diagnostics] Destroying previous client instance before new launch...');
      try {
        await client.destroy();
      } catch (err) {
        logger.debug('[WhatsApp Diagnostics] Previous client cleanup notice:', {
          message: err.message,
        });
      }
      client = null;
    }

    // 1. Connect MongoDB and create MongoStore (fails fast if MongoDB connection fails)
    logger.info('[RemoteAuth] Initializing MongoDB connection for WhatsApp session store...');
    const mongoStore = await sessionStore.connectAndGetStore();
    if (!mongoStore) {
      throw new Error('[RemoteAuth] MongoDB connection could not be established. Startup aborted.');
    }

    const sessionClientId = sessionStore.getSessionName();
    logger.info(`[RemoteAuth] Active clientId: "${sessionClientId}" (Session Name: "RemoteAuth-${sessionClientId}")`);

    // 2. Check if existing session is present in MongoDB
    const hasExistingSession = await sessionStore.sessionExists();
    if (hasExistingSession) {
      logger.info(`[RemoteAuth] Session found in MongoDB for "${sessionClientId}". Initializing client to restore session without QR...`);
      emitProgress(25, 'restoring_session', 'Restoring session from MongoDB...');
    } else {
      logger.info(`[RemoteAuth] No session found in MongoDB for "${sessionClientId}". QR generation will be required.`);
    }

    // 3. Ensure browser executable is ready
    const resolvedExecutablePath = await ensureBrowserAvailable();

    // 4. Configure client with resolved browser and MongoStore
    setupClient(resolvedExecutablePath, mongoStore);
    logger.info('[WhatsApp Diagnostics] Starting client.initialize()...');

    await client.initialize();
    logger.info('[WhatsApp Diagnostics] WhatsApp client.initialize() promise resolved successfully.');

    // Attach Puppeteer browser and page listeners for full browser visibility
    if (client.pupBrowser) {
      startupTimers.browserLaunched = Date.now();
      logger.info(`[Startup Metrics] ⏱️ Browser Launch Time: ${startupTimers.browserLaunched - startupTimers.start}ms (${((startupTimers.browserLaunched - startupTimers.start) / 1000).toFixed(1)}s)`);
      emitProgress(35, 'browser_connected', 'Browser connected');
      client.pupBrowser.on('disconnected', () => {
        logger.error('[WhatsApp Diagnostics] Browser disconnected');
        emitProgress(0, 'browser_disconnected', 'Browser disconnected');
      });

      client.pupBrowser.process()?.on('exit', (code) => {
        logger.error('[WhatsApp Diagnostics] Chrome exited with code:', code);
      });
    }

    if (client.pupPage) {
      logger.debug('[WhatsApp Diagnostics] client.pupPage attached successfully.');
      client.pupPage.on('console', (msg) => {
        logger.debug('[Browser]', msg.text());
      });
      client.pupPage.on('pageerror', (err) => {
        logger.error('[Browser Page Error]', err);
      });
      client.pupPage.on('error', (err) => {
        logger.error('[Browser Error]', err);
      });
      client.pupPage.on('requestfailed', (req) => {
        logger.debug('[Browser Request Failed]', {
          url: req.url(),
          error: req.failure()?.errorText,
        });
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
    connectionStatus = 'DISCONNECTED';
    isReady = false;
    whatsappEvents.emit('status_change', getStatus());
  } finally {
    isInitializing = false;
  }

  return getStatus();
}

/**
 * Safely destroys client and frees all browser resources & memory
 */
async function destroyClient() {
  logger.info('[WhatsApp Diagnostics] Destroying client...');
  if (client) {
    try {
      await client.logout();
      logger.info('[WhatsApp Diagnostics] Client logged out.');
    } catch (_) { }

    try {
      await client.destroy();
      logger.info('[WhatsApp Diagnostics] Client destroyed successfully.');
    } catch (err) {
      logger.warn('[WhatsApp Diagnostics] Warning during client.destroy():', {
        message: err.message,
        stack: err.stack,
      });
    }
    client = null;
  }

  // Delete remote session on explicit logout
  try {
    await sessionStore.deleteSession();
    logger.info('[RemoteAuth] Session deleted on logout');
  } catch (err) {
    logger.warn('[RemoteAuth] Error deleting session on logout:', { message: err.message });
  }

  isReady = false;
  connectionStatus = 'DISCONNECTED';
  latestQrRaw = null;
  latestQrDataUrl = null;
  clientInfo = null;
  isInitializing = false;

  whatsappEvents.emit('status_change', getStatus());
  logger.info('[WhatsApp Diagnostics] Client destroyed. Browser process closed and memory cleared.');
  return getStatus();
}

/**
 * Gets or triggers QR code generation
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

  if (!client || connectionStatus === 'DISCONNECTED') {
    startClient().catch((err) => {
      logger.error('[WhatsApp Diagnostics] Error triggering on-demand QR start:', {
        message: err.message,
        stack: err.stack,
      });
    });
  }

  return {
    status: connectionStatus,
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
 * If the page was closed or crashed, re-initializes client automatically.
 */
async function verifyClientHealth() {
  if (!client || !isReady || !client.ready) {
    logger.warn('[WhatsApp Health] Client not ready. Triggering startClient()...');
    await startClient();
  }

  const browserConnected = Boolean(client?.pupBrowser?.isConnected());
  const pageClosed = client?.pupPage ? client.pupPage.isClosed() : true;

  logger.debug('[WhatsApp Health Check]:', {
    browserConnected,
    pageClosed,
    isReady: Boolean(isReady && client?.ready),
  });

  if (!browserConnected || pageClosed) {
    logger.warn('[WhatsApp Health] Page is closed or browser is disconnected. Recreating client from remote session...');
    isReady = false;
    if (client) client.ready = false;
    connectionStatus = 'DISCONNECTED';
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

  // 1. Log original and sanitized numbers
  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  logger.debug('[WhatsApp Diagnostics] === Recipient Resolution Diagnostics ===');
  logger.debug('Original phone number:', phone);
  logger.debug('Sanitized phone number:', normalizedPhone);
  logger.debug('Final chatId:', rawChatId);

  if (!normalizedPhone || !/^\d{10,15}$/.test(normalizedPhone)) {
    throw new Error(`Invalid phone number provided: "${phone}". Must be 10-15 digits.`);
  }

  // 2. Validate chatId format: 91XXXXXXXXXX@c.us
  if (!/^\d{10,15}@c\.us$/.test(rawChatId)) {
    throw new Error(`Invalid chatId format: "${rawChatId}". Expected format: 91XXXXXXXXXX@c.us`);
  }

  if (!message) {
    throw new Error('Message content cannot be empty.');
  }

  // Pre-send diagnostic logging
  const currentState = await client.getState().catch((e) => `Error: ${e.message}`);
  logger.debug('[WhatsApp Pre-Send Diagnostics]:', {
    state: currentState,
    'client.ready': client.ready,
    'client.pupBrowser.connected': Boolean(client.pupBrowser?.isConnected()),
    'client.pupPage.isClosed': Boolean(client.pupPage?.isClosed()),
    chatId: rawChatId,
    messageLength: message.length,
  });

  // 3 & 4. Resolve recipient number via getNumberId before sending
  logger.debug(`Executing client.getNumberId("${normalizedPhone}")...`);
  let numberId = null;
  try {
    numberId = await client.getNumberId(normalizedPhone);
    logger.debug('NumberId:', numberId);
  } catch (lookupErr) {
    logger.error('Error during client.getNumberId lookup:', lookupErr);
    logger.error(lookupErr.stack);
  }

  if (!numberId || !numberId._serialized) {
    logger.error(`[WhatsApp Diagnostics] Recipient ${normalizedPhone} is not registered on WhatsApp (NumberId is null).`);
    const error = new Error(`Recipient ${normalizedPhone} is not registered on WhatsApp.`);
    error.statusCode = 400;
    throw error;
  }

  const resolvedTargetJid = numberId._serialized;
  logger.debug(`Resolved target JID for send: "${resolvedTargetJid}"`);

  // Immediately before sendMessage(), verify state is CONNECTED
  const state = await client.getState().catch(() => null);

  if (state !== 'CONNECTED') {
    logger.error(`[WhatsApp Diagnostics] Cannot send message: Client state is "${state}", expected "CONNECTED".`);
    throw new Error(`WhatsApp client is in state "${state}", not CONNECTED.`);
  }

  const beforeScreenshotPath = path.join(__dirname, '../before-send.png');
  if (client.pupPage && !client.pupPage.isClosed()) {
    await client.pupPage.screenshot({ path: beforeScreenshotPath }).catch(() => { });
  }

  // Wrap sendMessage() with timing logs and exact error stack trace
  const start = Date.now();
  try {
    logger.info(`Sending message to ${resolvedTargetJid}...`);
    const result = await client.sendMessage(resolvedTargetJid, message);
    logger.info('Message sent successfully');
    logger.debug('Duration:', Date.now() - start, 'ms');
    logger.debug(result);

    const messageId = result?.id?.id || `msg-${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    logger.error('sendMessage failed');
    logger.error('Duration:', Date.now() - start, 'ms');
    logger.error(err);
    logger.error(err.stack);

    const errorScreenshotPath = path.join(__dirname, '../after-send-error.png');
    if (client.pupPage && !client.pupPage.isClosed()) {
      await client.pupPage.screenshot({ path: errorScreenshotPath }).catch(() => { });
    }

    throw err;
  }
}

/**
 * Sends PDF or image document
 */
async function sendDocument(phone, documentUrl, filename = 'invoice.pdf', caption = '') {
  await verifyClientHealth();

  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  logger.debug('[WhatsApp Diagnostics] === Recipient Document Resolution Diagnostics ===');
  logger.debug('Original phone number:', phone);
  logger.debug('Sanitized phone number:', normalizedPhone);
  logger.debug('Final chatId:', rawChatId);
  logger.debug('documentUrl:', documentUrl);

  if (!normalizedPhone || !/^\d{10,15}$/.test(normalizedPhone)) {
    throw new Error(`Invalid phone number provided: "${phone}". Must be 10-15 digits.`);
  }

  if (!/^\d{10,15}@c\.us$/.test(rawChatId)) {
    throw new Error(`Invalid chatId format: "${rawChatId}". Expected format: 91XXXXXXXXXX@c.us`);
  }

  if (!documentUrl) {
    throw new Error('Document URL is required.');
  }

  const currentState = await client.getState().catch((e) => `Error: ${e.message}`);
  logger.debug('[WhatsApp Pre-Send Document Diagnostics]:', {
    state: currentState,
    'client.ready': client.ready,
    'client.pupBrowser.connected': Boolean(client.pupBrowser?.isConnected()),
    'client.pupPage.isClosed': Boolean(client.pupPage?.isClosed()),
    chatId: rawChatId,
  });

  // 3 & 4. Resolve recipient number via getNumberId before sending
  logger.debug(`Executing client.getNumberId("${normalizedPhone}")...`);
  let numberId = null;
  try {
    numberId = await client.getNumberId(normalizedPhone);
    logger.debug('NumberId:', numberId);
  } catch (lookupErr) {
    logger.error('Error during client.getNumberId lookup:', lookupErr);
    logger.error(lookupErr.stack);
  }

  if (!numberId || !numberId._serialized) {
    logger.error(`[WhatsApp Diagnostics] Recipient ${normalizedPhone} is not registered on WhatsApp (NumberId is null).`);
    const error = new Error(`Recipient ${normalizedPhone} is not registered on WhatsApp.`);
    error.statusCode = 400;
    throw error;
  }

  const resolvedTargetJid = numberId._serialized;
  logger.debug(`Resolved target JID for document send: "${resolvedTargetJid}"`);

  const state = await client.getState().catch(() => null);

  if (state !== 'CONNECTED') {
    logger.error(`[WhatsApp Diagnostics] Cannot send document: Client state is "${state}", expected "CONNECTED".`);
    throw new Error(`WhatsApp client is in state "${state}", not CONNECTED.`);
  }

  logger.debug(`Resolving media from URL: ${documentUrl}...`);
  const media = await getMediaFromUrl(documentUrl, filename);

  const start = Date.now();
  try {
    logger.info(`Sending document [${filename}] to ${resolvedTargetJid}...`);
    const result = await client.sendMessage(resolvedTargetJid, media, { caption });
    logger.info('Message sent successfully');
    logger.debug('Duration:', Date.now() - start, 'ms');
    logger.debug(result);

    const messageId = result?.id?.id || `doc-${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    logger.error('sendMessage failed');
    logger.error('Duration:', Date.now() - start, 'ms');
    logger.error(err);
    logger.error(err.stack);

    const errorScreenshotPath = path.join(__dirname, '../after-send-doc-error.png');
    if (client.pupPage && !client.pupPage.isClosed()) {
      await client.pupPage.screenshot({ path: errorScreenshotPath }).catch(() => { });
    }

    throw err;
  }
}

async function sendInvoiceTemplate(phone, invoiceUrl, filename = 'invoice.pdf') {
  return sendDocument(phone, invoiceUrl, filename, 'Your Bhagwat Library Invoice');
}

async function sendReminderTemplate(phone, studentName, dueAmount, dueDate) {
  const formattedAmount = Number(dueAmount).toFixed(2);
  const msg = `Dear ${studentName},\n\nThis is a payment reminder from Bhagwat Library. You have a pending fee of INR ${formattedAmount} which is due on ${dueDate}.\n\nPlease clear the dues to ensure uninterrupted library access.\n\nThank you!`;
  return sendTextMessage(phone, msg);
}

async function sendBulkMessages(phones, message, delayMs = 1000) {
  if (!Array.isArray(phones) || phones.length === 0) {
    throw new Error('Phones list must be a non-empty array.');
  }
  if (!message) {
    throw new Error('Bulk message content cannot be empty.');
  }

  logger.info(`Starting bulk dispatch to ${phones.length} recipients...`);
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    try {
      if (i > 0) {
        await sleep(delayMs);
      }

      const res = await sendTextMessage(phone, message);
      results.push({ phone, success: true, ...res });
      successCount++;
    } catch (error) {
      results.push({ phone, success: false, error: error.message });
      failureCount++;
      logger.error(`Bulk send error for ${phone}:`, {
        message: error.message,
        stack: error.stack,
      });
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
};
