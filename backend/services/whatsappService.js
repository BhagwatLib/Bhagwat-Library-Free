/**
 * whatsappService.js - On-demand WhatsApp gateway with MongoDB RemoteAuth
 */

'use strict';

const { Client, RemoteAuth, NoAuth, MessageMedia } = require('whatsapp-web.js');
const sessionStore = require('./whatsapp/sessionStore');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const puppeteer = require('puppeteer');

// Event emitter for broadcasting real-time WhatsApp lifecycle events
class WhatsAppEventEmitter extends EventEmitter { }
const whatsappEvents = new WhatsAppEventEmitter();

// Singleton State & Authentication Lock State Machine
// Flow: INITIALIZING -> QR_READY -> SCANNING -> AUTHENTICATING -> READY -> DISCONNECTED
let authState = 'DISCONNECTED';
let client = null;
let isReady = false;
let isAuthenticating = false;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATING' | 'CONNECTED'
let latestQrRaw = null;
let latestQrDataUrl = null;
let lastConnectedTime = null;
let clientInfo = null;
let activeInitPromise = null;
let lastError = null;
let cachedExecutablePath = null;

// --- Tracked Timer Management ---
const activeTimers = new Map();

function startTrackedTimer(name, callback, delayMs) {
  clearTrackedTimer(name);
  const startTime = new Date().toISOString();
  logger.debug(`[Timer] Started [${startTime}] - ${name} (${delayMs}ms)`);

  const timeoutId = setTimeout(async () => {
    activeTimers.delete(name);
    try {
      await callback();
    } catch (err) {
      logger.error(`[Timer Error] ${name}:`, { message: err.message, stack: err.stack });
    }
  }, delayMs);

  activeTimers.set(name, { id: timeoutId, startedAt: startTime, delayMs });
  return timeoutId;
}

function clearTrackedTimer(name) {
  if (activeTimers.has(name)) {
    const timerInfo = activeTimers.get(name);
    clearTimeout(timerInfo.id);
    activeTimers.delete(name);
  }
}

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
 * Returns current status snapshot
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

/**
 * Resolves local Google Chrome / Chromium executable path on Windows, Linux, or macOS.
 */
function findChromeExecutable() {
  if (cachedExecutablePath && fs.existsSync(cachedExecutablePath)) {
    return cachedExecutablePath;
  }

  // 1. Explicit environment variable
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedExecutablePath = envPath;
    logger.info(`[Browser Resolver] Using configured Chrome executable: "${cachedExecutablePath}"`);
    return cachedExecutablePath;
  }

  // 2. Standard Windows installations
  const winPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    // Microsoft Edge as fallback on Windows
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  // 3. Standard Linux / macOS installations
  const unixPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  const candidatePaths = process.platform === 'win32' ? winPaths : unixPaths;

  for (const candidate of candidatePaths) {
    if (candidate && fs.existsSync(candidate)) {
      cachedExecutablePath = candidate;
      logger.info(`[Browser Resolver] Detected local Chrome executable: "${cachedExecutablePath}"`);
      return cachedExecutablePath;
    }
  }

  // 4. Check standard Puppeteer executable if available
  try {
    const defaultPath = puppeteer.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      cachedExecutablePath = defaultPath;
      logger.info(`[Browser Resolver] Using Puppeteer executable: "${cachedExecutablePath}"`);
      return cachedExecutablePath;
    }
  } catch (_) {}

  logger.info('[Browser Resolver] No explicit Chrome path found; relying on default Puppeteer launch.');
  return null;
}

/**
 * Instantiates and configures WhatsApp client instance
 */
function setupClient(customExecutablePath = null, mongoStore = null) {
  logger.info('[WhatsApp] Initializing WhatsApp Client...');

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ];

  const isWin = process.platform === 'win32';
  const platformUserAgent = isWin
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

  const isDebug = process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug';

  const puppeteerOptions = {
    headless: 'new',
    dumpio: isDebug,
    args: puppeteerArgs,
  };

  const resolvedExecutable = customExecutablePath || findChromeExecutable();
  if (resolvedExecutable) {
    puppeteerOptions.executablePath = resolvedExecutable;
  }

  const sessionClientId = sessionStore.getSessionName();
  let authStrategy;

  if (mongoStore) {
    logger.info(`[RemoteAuth] Configuring RemoteAuth with MongoStore (clientId: "${sessionClientId}")...`);
    authStrategy = new RemoteAuth({
      clientId: sessionClientId,
      store: mongoStore,
      backupSyncIntervalMs: 300000, // 5 minutes
      dataPath: path.join(__dirname, '../.wwebjs_auth'),
    });
  } else {
    logger.warn('[RemoteAuth] MongoStore is not available. Falling back to NoAuth.');
    authStrategy = new NoAuth();
  }

  client = new Client({
    authStrategy,
    authTimeoutMs: 120000,
    qrMaxRetries: 0,
    puppeteer: puppeteerOptions,
    userAgent: platformUserAgent,
    webVersionCache: {
      type: 'none',
    },
  });

  client.ready = false;

  async function handleClientReady() {
    if (isReady && client?.ready) return;

    logger.info(`[WA Event] [${new Date().toISOString()}] READY - Connected to WhatsApp`);
    authState = 'READY';
    isReady = true;
    isAuthenticating = false;
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
      logger.info('[WhatsApp] Connected Account Info:', clientInfo);
    } catch (_) {
      clientInfo = { pushname: 'Bhagwat Library Admin' };
    }

    whatsappEvents.emit('status_change', getStatus());
  }

  // --- Diagnostic Lifecycle Event Listeners ---
  client.on('loading_screen', (percent, message) => {
    try {
      const pct = Number(percent) || 0;
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

      logger.info(`[WA Event] LOADING ${percent}% - ${message}`);

      if (pct === 100) {
        emitProgress(75, 'loading_100', 'WhatsApp Web loaded 100%');
      } else if (pct > 0) {
        emitProgress(50, 'loading_whatsapp', `WhatsApp loading ${pct}%...`);
      } else {
        emitProgress(50, 'loading_whatsapp', 'WhatsApp loading...');
      }
    } catch (err) {
      logger.error('[WA Event Error] Error in loading_screen handler:', { message: err?.message });
    }
  });

  client.on('authenticated', async (authPayload) => {
    try {
      authState = 'AUTHENTICATING';
      isAuthenticating = true;
      connectionStatus = 'AUTHENTICATING';
      clearAllAuthFallbackTimers();

      logger.info('[WA Event] AUTHENTICATED - Handshake completed');
      emitProgress(85, 'authenticated', 'Authenticated - Completing handshake...');

      latestQrRaw = null;
      latestQrDataUrl = null;
      lastError = null;
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in authenticated handler:', { message: err?.message });
    }
  });

  client.on('auth_failure', async (msg) => {
    try {
      clearAllAuthFallbackTimers();
      logger.error('[WA Event] AUTH FAILURE:', msg);
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
        timestamp: new Date().toISOString(),
      };
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in auth_failure handler:', { message: err?.message });
    }
  });

  client.on('ready', async () => {
    try {
      authState = 'READY';
      isAuthenticating = false;
      isReady = true;
      connectionStatus = 'CONNECTED';
      clearAllAuthFallbackTimers();

      logger.info('[WA Event] READY - Client connected and ready');
      emitProgress(100, 'ready', 'WhatsApp Connected & Ready!');
      await handleClientReady();
    } catch (err) {
      logger.error('[WA Event Error] Error in ready handler:', { message: err?.message });
    }
  });

  client.on('change_state', (state) => {
    try {
      logger.info(`[WA Event] CHANGE_STATE: ${state}`);
      if (state === 'CONNECTED' && currentProgress.progress < 95) {
        emitProgress(95, 'session_backup', 'Session backup syncing to MongoDB');
      }
    } catch (err) {
      logger.error('[WA Event Error] Error in change_state handler:', { message: err?.message });
    }
  });

  client.on('disconnected', (reason) => {
    try {
      clearAllAuthFallbackTimers();
      logger.warn(`[WA Event] DISCONNECTED: ${reason}`);

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
      logger.error('[WA Event Error] Error in disconnected handler:', { message: err?.message });
    }
  });

  client.on('remote_session_saved', async () => {
    try {
      logger.info('[WA Event] REMOTE_SESSION_SAVED - Session backup saved to MongoDB');
      emitProgress(95, 'session_backup', 'Session backup synced to MongoDB');
    } catch (err) {
      logger.error('[WA Event Error] Error in remote_session_saved handler:', { message: err?.message });
    }
  });

  client.on('remote_session_loaded', () => {
    try {
      logger.info('[WA Event] REMOTE_SESSION_LOADED - Session loaded from MongoDB');
    } catch (err) {
      logger.error('[WA Event Error] Error in remote_session_loaded handler:', { message: err?.message });
    }
  });

  client.on('message', () => {
    logger.debug('[WA Event] MESSAGE EVENT');
  });

  // Event: QR Code Received
  client.on('qr', async (qr) => {
    try {
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
        return;
      }

      if (latestQrRaw === qr && latestQrDataUrl) {
        return;
      }

      authState = 'QR_READY';
      logger.info('[WA Event] ===== QR CODE RECEIVED =====');
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
        logger.error('[WhatsApp] Error generating QR Data URL', { message: err.message });
      }

      connectionStatus = 'QR_READY';
      isReady = false;
      if (client) client.ready = false;
      lastError = null;
      emitProgress(70, 'qr_generated', 'QR code generated. Scan with phone.');

      // Print ASCII QR to local console for developer convenience
      try {
        console.log('\n--- SCAN THIS QR CODE FOR WHATSAPP AUTHENTICATION ---');
        qrcodeTerminal.generate(qr, { small: true });
        console.log('-----------------------------------------------------\n');
      } catch (_) {}

      whatsappEvents.emit('qr', { qrRaw: latestQrRaw, qrDataUrl: latestQrDataUrl });
      whatsappEvents.emit('status_change', getStatus());
    } catch (err) {
      logger.error('[WA Event Error] Error in qr handler:', { message: err?.message });
    }
  });
}

/**
 * Starts WhatsApp client on-demand (idempotent, single active instance with promise lock)
 */
async function startClient() {
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
    logger.info(`[Auth Lock] startClient() ignored: Authentication actively in progress (State: ${authState}).`);
    return getStatus();
  }

  // 4. Create and lock initialization promise
  activeInitPromise = (async () => {
    authState = 'INITIALIZING';
    connectionStatus = 'CONNECTING';
    lastError = null;
    emitProgress(10, 'mongo_connected', 'MongoDB connected');

    try {
      if (client && !isAuthenticating && authState !== 'SCANNING' && authState !== 'AUTHENTICATING') {
        logger.info('[WhatsApp] Cleaning up previous client before startup...');
        try {
          await client.destroy();
        } catch (err) {
          logger.debug('[WhatsApp] Cleanup notice:', { message: err.message });
        }
        client = null;
      }

      // Connect MongoDB and create MongoStore
      logger.info('[RemoteAuth] Connecting to MongoDB for WhatsApp session store...');
      const mongoStore = await sessionStore.connectAndGetStore();
      if (!mongoStore) {
        throw new Error('[RemoteAuth] MongoDB connection could not be established.');
      }
      emitProgress(10, 'mongo_connected', 'MongoDB connected');

      const sessionClientId = sessionStore.getSessionName();
      logger.info(`[RemoteAuth] Active clientId: "${sessionClientId}"`);

      // Check if existing session is present in MongoDB
      const hasExistingSession = await sessionStore.sessionExists();
      if (hasExistingSession) {
        logger.info(`[RemoteAuth] Session found in MongoDB for "${sessionClientId}". Restoring session...`);
        emitProgress(25, 'restoring_session', 'Restoring session from MongoDB...');
      } else {
        logger.info(`[RemoteAuth] No session found in MongoDB for "${sessionClientId}". QR scan will be required.`);
      }

      // Resolve browser executable
      emitProgress(20, 'browser_launching', 'Launching Chrome browser...');
      const resolvedExecutablePath = findChromeExecutable();

      // Configure client with resolved browser and MongoStore
      setupClient(resolvedExecutablePath, mongoStore);
      logger.info('[WhatsApp] Executing client.initialize()...');

      const initStartTime = Date.now();
      await client.initialize();
      const initDuration = Date.now() - initStartTime;
      logger.info(`[WhatsApp] client.initialize() completed in ${initDuration}ms.`);
      emitProgress(35, 'browser_connected', 'Browser connected');

      if (client.pupBrowser) {
        client.pupBrowser.on('disconnected', () => {
          logger.warn('[WhatsApp] Browser disconnected');
          emitProgress(0, 'browser_disconnected', 'Browser disconnected');
        });
      }

      if (client.pupPage) {
        client.pupPage.on('close', () => {
          logger.warn('[WhatsApp] Browser page closed');
        });
      }
    } catch (err) {
      lastError = {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      };
      logger.error('[WhatsApp] Initialization failed:', {
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
  if (authState === 'SCANNING' || authState === 'AUTHENTICATING' || isAuthenticating) {
    logger.warn(`[Auth Lock] BLOCKED destroyClient() during active authentication (State: ${authState}).`);
    return getStatus();
  }

  for (const name of activeTimers.keys()) {
    clearTrackedTimer(name);
  }

  if (client) {
    try {
      await client.logout();
      logger.info('[WhatsApp] Client logged out.');
    } catch (_) { }

    try {
      await client.destroy();
      logger.info('[WhatsApp] Client destroyed.');
    } catch (err) {
      logger.warn('[WhatsApp] Warning during client.destroy():', { message: err.message });
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
  logger.info('[WhatsApp] Client destroyed. Local resources released.');
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
      logger.error('[WhatsApp] Error triggering on-demand QR start:', { message: err.message });
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
      logger.info(`[RemoteAuth] Session verified in MongoDB (${details.filesCount} file, ${details.chunksCount} chunks).`);
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[RemoteAuth] Session backup failed during "${trigger}":`, {
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
