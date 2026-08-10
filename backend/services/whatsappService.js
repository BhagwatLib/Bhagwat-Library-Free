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
 * Returns current status snapshot including last error diagnostics
 */
function getStatus() {
  return {
    isReady: Boolean(isReady && client?.ready),
    status: connectionStatus,
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
    lastConnectedTime,
    clientInfo,
    lastError,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Ensures browser executable is resolved, logs comprehensive diagnostics,
 * and dynamically installs Chrome at runtime if missing.
 */
async function ensureBrowserAvailable() {
  logger.info('[WhatsApp Diagnostics] ========================================');
  logger.info('[WhatsApp Diagnostics] --- Puppeteer Environment Diagnostics ---');

  // 3. Ensure no PUPPETEER_EXECUTABLE_PATH environment variable overrides runtime if invalid
  const envExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envExecutablePath) {
    logger.info(`[WhatsApp Diagnostics] Found PUPPETEER_EXECUTABLE_PATH env var: "${envExecutablePath}"`);
    if (!fs.existsSync(envExecutablePath)) {
      logger.warn(`[WhatsApp Diagnostics] PUPPETEER_EXECUTABLE_PATH "${envExecutablePath}" does NOT exist on disk! Deleting env override to allow default resolution.`);
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      logger.info(`[WhatsApp Diagnostics] PUPPETEER_EXECUTABLE_PATH "${envExecutablePath}" is valid and verified on disk.`);
    }
  } else {
    logger.info('[WhatsApp Diagnostics] No PUPPETEER_EXECUTABLE_PATH override detected in environment.');
  }

  // 2. Log requested diagnostics
  let defaultExecPath = null;
  try {
    defaultExecPath = puppeteer.executablePath();
  } catch (err) {
    logger.warn('[WhatsApp Diagnostics] puppeteer.executablePath() threw error:', { message: err.message });
  }

  logger.info(`[WhatsApp Diagnostics] puppeteer.executablePath(): ${defaultExecPath}`);

  const execExists = defaultExecPath ? fs.existsSync(defaultExecPath) : false;
  logger.info(`[WhatsApp Diagnostics] fs.existsSync(executablePath): ${execExists}`);

  const renderCacheDir = '/opt/render/.cache/puppeteer';
  const renderCacheExists = fs.existsSync(renderCacheDir);
  logger.info(`[WhatsApp Diagnostics] fs.existsSync("/opt/render/.cache/puppeteer"): ${renderCacheExists}`);
  if (renderCacheExists) {
    try {
      const renderCacheContents = fs.readdirSync(renderCacheDir);
      logger.info(`[WhatsApp Diagnostics] fs.readdirSync("/opt/render/.cache/puppeteer"):`, renderCacheContents);
    } catch (err) {
      logger.warn(`[WhatsApp Diagnostics] Failed to read /opt/render/.cache/puppeteer:`, { message: err.message });
    }
  }

  if (defaultExecPath) {
    const parentDir = path.dirname(defaultExecPath);
    const parentDirExists = fs.existsSync(parentDir);
    logger.info(`[WhatsApp Diagnostics] fs.existsSync(path.dirname(executablePath)) [${parentDir}]: ${parentDirExists}`);
    if (parentDirExists) {
      try {
        const dirContents = fs.readdirSync(parentDir);
        logger.info(`[WhatsApp Diagnostics] fs.readdirSync(path.dirname(executablePath)):`, dirContents);
      } catch (err) {
        logger.warn(`[WhatsApp Diagnostics] Failed to read path.dirname(executablePath):`, { message: err.message });
      }
    }
  }

  // 4 & 5. If browser is missing at runtime, switch to using @puppeteer/browsers to install Chrome during startup
  let resolvedExecutablePath = (execExists && defaultExecPath) ? defaultExecPath : null;

  if (!resolvedExecutablePath && browsers) {
    logger.warn('[WhatsApp Diagnostics] Browser executable is missing at runtime! Attempting automatic on-demand installation via @puppeteer/browsers...');
    try {
      const platform = browsers.detectBrowserPlatform();
      const projectCacheDir = path.join(__dirname, '../.puppeteer-cache');

      let buildId = '146.0.7680.31';
      try {
        buildId = await browsers.resolveBuildId(browsers.Browser.CHROME, platform, browsers.BrowserTag.STABLE);
      } catch (e) {
        logger.warn(`[WhatsApp Diagnostics] Could not resolve latest stable buildId (${e.message}), using fallback: ${buildId}`);
      }

      logger.info(`[WhatsApp Diagnostics] Installing Chrome (build: ${buildId}, platform: ${platform}) to ${projectCacheDir}...`);
      const installedBrowser = await browsers.install({
        browser: browsers.Browser.CHROME,
        buildId,
        cacheDir: projectCacheDir,
      });

      if (installedBrowser && installedBrowser.executablePath && fs.existsSync(installedBrowser.executablePath)) {
        resolvedExecutablePath = installedBrowser.executablePath;
        logger.info(`[WhatsApp Diagnostics] Dynamic browser installation completed successfully! Executable: ${resolvedExecutablePath}`);
      } else {
        logger.warn('[WhatsApp Diagnostics] Dynamic browser install completed but executablePath could not be verified.');
      }
    } catch (installErr) {
      logger.error('[WhatsApp Diagnostics] Failed to install browser at runtime:', {
        message: installErr.message,
        stack: installErr.stack,
      });
    }
  }

  logger.info('[WhatsApp Diagnostics] ========================================');
  return resolvedExecutablePath;
}

/**
 * Instantiates and configures single WhatsApp client instance with bundled Puppeteer
 */
function setupClient(customExecutablePath = null, mongoStore = null) {
  logger.info('[WhatsApp Diagnostics] Creating WhatsApp Client...');

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
  ];

  const puppeteerOptions = {
    headless: 'new',
    dumpio: true,
    ignoreHTTPSErrors: true,
    protocolTimeout: 300000,
    args: [
      ...puppeteerArgs,
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ],
  };

  // 1. Allow Puppeteer default resolution or runtime-installed path
  if (customExecutablePath && fs.existsSync(customExecutablePath)) {
    puppeteerOptions.executablePath = customExecutablePath;
    logger.info(`[WhatsApp Diagnostics] Using resolved executablePath: ${customExecutablePath}`);
  } else {
    logger.info('[WhatsApp Diagnostics] Using default Puppeteer resolution (no custom executablePath passed).');
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

  logger.info('[WhatsApp Diagnostics] Puppeteer Launch Configuration:', {
    authStrategy: mongoStore ? `RemoteAuth (${sessionClientId})` : 'NoAuth',
    headless: 'new',
    dumpio: true,
    ignoreHTTPSErrors: true,
    protocolTimeout: 300000,
    executablePath: puppeteerOptions.executablePath || 'DEFAULT_RESOLUTION',
    puppeteerArgs: puppeteerOptions.args,
  });

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

  let loadingCheckTimeout = null;

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
    logger.info(`[WA] LOADING ${percent}% - ${message}`);

    // If loading reaches 100%, wait 10 seconds and check state
    if (Number(percent) === 100) {
      logger.info('[WA] Loading reached 100%. Scheduling 10-second state check fallback...');
      if (loadingCheckTimeout) clearTimeout(loadingCheckTimeout);
      loadingCheckTimeout = setTimeout(async () => {
        try {
          if (!client) return;
          const state = await client.getState();
          logger.info('CLIENT STATE:', state);

          if (state === 'CONNECTED' && (!isReady || !client.ready)) {
            logger.info('[WA] State is CONNECTED but ready event did not fire. Manually invoking ready handler...');
            await handleClientReady();
          }
        } catch (err) {
          logger.error('[WA] Error during 100% loading state check:', err);
        }
      }, 10000);
    }
  });

  client.on('authenticated', () => {
    logger.info('[RemoteAuth] Session restored');
    logger.info('[WA] AUTHENTICATED');
    connectionStatus = 'AUTHENTICATED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastError = null;
    whatsappEvents.emit('status_change', getStatus());
  });

  client.on('auth_failure', async (msg) => {
    logger.error('[WA] AUTH FAILURE', msg);
    logger.warn('[RemoteAuth] Authentication failed! Deleting invalid session from MongoDB...');
    try {
      await sessionStore.deleteSession();
      logger.info('[RemoteAuth] Session deleted');
    } catch (delErr) {
      logger.warn('[RemoteAuth] Failed to delete session after auth_failure:', delErr.message);
    }

    isReady = false;
    client.ready = false;
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
    logger.info('[RemoteAuth] Connected');
    logger.info('[WA] READY');

    try {
      logger.info(await client.getState());
    } catch (e) {
      logger.error(e);
    }

    await handleClientReady();
  });

  client.on('change_state', (state) => {
    logger.info('[WA] STATE:', state);
  });

  client.on('disconnected', (reason) => {
    logger.warn('[WA] DISCONNECTED:', reason);
    isReady = false;
    client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    whatsappEvents.emit('status_change', getStatus());
    destroyClient().catch(() => { });
  });

  client.on('remote_session_saved', () => {
    logger.info('[RemoteAuth] Session saved');
    logger.info('[WA] REMOTE SESSION SAVED');
  });

  client.on('message', () => {
    logger.info('[WA] MESSAGE EVENT');
  });

  // Event: QR Code Received
  client.on('qr', async (qr) => {
    logger.info('[WhatsApp Diagnostics] ===== QR CODE RECEIVED =====');
    logger.info('[WhatsApp Diagnostics] QR event received! Generating QR image...');
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
    client.ready = false;
    lastError = null;

    logger.info('[WhatsApp Diagnostics] Waiting for QR code to be scanned with mobile app...');
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
    logger.info('[WhatsApp Diagnostics] Client already connected and ready.');
    return getStatus();
  }

  if (isInitializing) {
    logger.info('[WhatsApp Diagnostics] Client initialization already in progress...');
    return getStatus();
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';
  lastError = null;
  whatsappEvents.emit('status_change', getStatus());

  try {
    if (client) {
      logger.info('[WhatsApp Diagnostics] Destroying previous client instance before new launch...');
      try {
        await client.destroy();
      } catch (err) {
        logger.warn('[WhatsApp Diagnostics] Previous client cleanup warning (ignored):', {
          message: err.message,
          stack: err.stack,
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

    // 2. Check if existing session is present in MongoDB
    const hasExistingSession = await sessionStore.sessionExists();
    if (hasExistingSession) {
      logger.info('[RemoteAuth] Existing session found in MongoDB. Initializing client to restore session without QR...');
    } else {
      logger.info('[RemoteAuth] No existing session found in MongoDB. QR generation will be required.');
    }

    // 3. Ensure browser executable is ready
    const resolvedExecutablePath = await ensureBrowserAvailable();

    // 4. Configure client with resolved browser and MongoStore
    setupClient(resolvedExecutablePath, mongoStore);
    logger.info('[WhatsApp Diagnostics] Starting client.initialize()...');
    logger.info('[WhatsApp Diagnostics] Waiting for browser to launch and generate QR / restore session...');

    await client.initialize();
    logger.info('[WhatsApp Diagnostics] WhatsApp client.initialize() promise resolved successfully.');

    // Attach Puppeteer browser and page listeners for full browser visibility
    if (client.pupBrowser) {
      logger.info('[WhatsApp Diagnostics] client.pupBrowser attached successfully.');
      client.pupBrowser.on('disconnected', () => {
        logger.error('[WhatsApp Diagnostics] Browser disconnected');
      });

      client.pupBrowser.process()?.on('exit', (code) => {
        logger.error('[WhatsApp Diagnostics] Chrome exited with code:', code);
      });
    }

    if (client.pupPage) {
      logger.info('[WhatsApp Diagnostics] client.pupPage attached successfully.');
      client.pupPage.on('console', (msg) => {
        logger.info('[Browser]', msg.text());
      });
      client.pupPage.on('pageerror', (err) => {
        logger.error('[Browser Page Error]', err);
      });
      client.pupPage.on('error', (err) => {
        logger.error('[Browser Error]', err);
      });
      client.pupPage.on('requestfailed', (req) => {
        logger.warn('[Browser Request Failed]', {
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
 * Downloads media from URL or loads local file
 */
async function getMediaFromUrl(url, filename) {
  if (url.includes('/uploads/')) {
    const parts = url.split('/uploads/');
    const localFilename = parts[parts.length - 1];
    const localPath = path.join(__dirname, '../uploads', localFilename);

    if (fs.existsSync(localPath)) {
      try {
        const data = fs.readFileSync(localPath);
        const base64Data = data.toString('base64');
        return new MessageMedia('application/pdf', base64Data, filename || localFilename);
      } catch (err) {
        logger.error(`Error reading local file: ${localPath}`, {
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
 * Ensures the WhatsApp page and injected scripts (WWebJS/Store) are fully initialized before interacting
 */
async function ensurePageReady() {
  if (!client || !client.pupPage) {
    throw new Error('Puppeteer page is not available.');
  }

  if (client.pupPage.isClosed()) {
    throw new Error('Puppeteer page has crashed or closed.');
  }

  // Check if window.WWebJS is injected; if not, inject LoadUtils to prevent Runtime.callFunctionOn timeouts
  try {
    const isWWebJSDefined = await client.pupPage.evaluate(() => typeof window.WWebJS !== 'undefined').catch(() => false);
    if (!isWWebJSDefined) {
      logger.info('[WhatsApp Diagnostics] Injecting missing WWebJS helper scripts into page...');
      const { LoadUtils } = require('whatsapp-web.js/src/util/Injected/Utils');
      await client.pupPage.evaluate(LoadUtils);
      logger.info('[WhatsApp Diagnostics] WWebJS helper scripts injected successfully.');
    }
  } catch (err) {
    logger.warn('[WhatsApp Diagnostics] Warning checking/injecting WWebJS:', { message: err.message });
  }
}

/**
 * Sends text message to single recipient
 */
async function sendTextMessage(phone, message) {
  if (!isReady || !client || !client.ready) {
    throw new Error('WhatsApp client is not connected. Please scan the QR code first in Settings → WhatsApp Gateway.');
  }

  // 1. Log original and sanitized numbers
  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  logger.info('[WhatsApp Diagnostics] === Recipient Resolution Diagnostics ===');
  logger.info('Original phone number:', phone);
  logger.info('Sanitized phone number:', normalizedPhone);
  logger.info('Final chatId:', rawChatId);

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

  logger.info('client.ready:', client.ready);
  const stateBeforeCheck = await client.getState().catch((e) => `Error: ${e.message}`);
  logger.info('await client.getState():', stateBeforeCheck);
  logger.info('connectionStatus:', connectionStatus);
  logger.info('message length:', message.length);
  logger.info('Browser connected:', Boolean(client.pupBrowser?.isConnected()));

  if (client.pupPage) {
    logger.info('Page closed:', client.pupPage.isClosed());
  }

  // Verify page readiness & ensure WWebJS helper scripts are loaded
  await ensurePageReady();

  // 3 & 4. Resolve recipient number via getNumberId before sending
  logger.info(`Executing client.getNumberId("${normalizedPhone}")...`);
  let numberId = null;
  try {
    numberId = await client.getNumberId(normalizedPhone);
    logger.info('NumberId:', numberId);
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
  logger.info(`Resolved target JID for send: "${resolvedTargetJid}"`);

  // Immediately before sendMessage(), verify state is CONNECTED
  const state = await client.getState().catch(() => null);
  logger.info('State:', state);

  if (state !== 'CONNECTED') {
    logger.error(`[WhatsApp Diagnostics] Cannot send message: Client state is "${state}", expected "CONNECTED".`);
    throw new Error(`WhatsApp client is in state "${state}", not CONNECTED.`);
  }

  const beforeScreenshotPath = path.join(__dirname, '../before-send.png');
  if (client.pupPage && !client.pupPage.isClosed()) {
    await client.pupPage.screenshot({ path: beforeScreenshotPath }).catch(() => {});
  }

  // Wrap sendMessage() with timing logs and exact error stack trace
  const start = Date.now();
  try {
    logger.info(`Sending message to ${resolvedTargetJid}...`);
    const result = await client.sendMessage(resolvedTargetJid, message);
    logger.info('Message sent successfully');
    logger.info('Duration:', Date.now() - start, 'ms');
    logger.info(result);

    const messageId = result?.id?.id || `msg-${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    logger.error('sendMessage failed');
    logger.error('Duration:', Date.now() - start, 'ms');
    logger.error(err);
    logger.error(err.stack);

    const errorScreenshotPath = path.join(__dirname, '../after-send-error.png');
    if (client.pupPage && !client.pupPage.isClosed()) {
      await client.pupPage.screenshot({ path: errorScreenshotPath }).catch(() => {});
    }

    throw err;
  }
}

/**
 * Sends PDF or image document
 */
async function sendDocument(phone, documentUrl, filename = 'invoice.pdf', caption = '') {
  if (!isReady || !client || !client.ready) {
    throw new Error('WhatsApp client is not connected. Please scan the QR code first in Settings → WhatsApp Gateway.');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  const rawChatId = normalizedPhone ? `${normalizedPhone}@c.us` : '';

  logger.info('[WhatsApp Diagnostics] === Recipient Document Resolution Diagnostics ===');
  logger.info('Original phone number:', phone);
  logger.info('Sanitized phone number:', normalizedPhone);
  logger.info('Final chatId:', rawChatId);
  logger.info('documentUrl:', documentUrl);

  if (!normalizedPhone || !/^\d{10,15}$/.test(normalizedPhone)) {
    throw new Error(`Invalid phone number provided: "${phone}". Must be 10-15 digits.`);
  }

  if (!/^\d{10,15}@c\.us$/.test(rawChatId)) {
    throw new Error(`Invalid chatId format: "${rawChatId}". Expected format: 91XXXXXXXXXX@c.us`);
  }

  if (!documentUrl) {
    throw new Error('Document URL is required.');
  }

  logger.info('client.ready:', client.ready);
  const stateBeforeCheck = await client.getState().catch((e) => `Error: ${e.message}`);
  logger.info('await client.getState():', stateBeforeCheck);
  logger.info('connectionStatus:', connectionStatus);
  logger.info('Browser connected:', Boolean(client.pupBrowser?.isConnected()));

  if (client.pupPage) {
    logger.info('Page closed:', client.pupPage.isClosed());
  }

  await ensurePageReady();

  // 3 & 4. Resolve recipient number via getNumberId before sending
  logger.info(`Executing client.getNumberId("${normalizedPhone}")...`);
  let numberId = null;
  try {
    numberId = await client.getNumberId(normalizedPhone);
    logger.info('NumberId:', numberId);
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
  logger.info(`Resolved target JID for document send: "${resolvedTargetJid}"`);

  const state = await client.getState().catch(() => null);
  logger.info('State:', state);

  if (state !== 'CONNECTED') {
    logger.error(`[WhatsApp Diagnostics] Cannot send document: Client state is "${state}", expected "CONNECTED".`);
    throw new Error(`WhatsApp client is in state "${state}", not CONNECTED.`);
  }

  logger.info(`Resolving media from URL: ${documentUrl}...`);
  const media = await getMediaFromUrl(documentUrl, filename);

  const start = Date.now();
  try {
    logger.info(`Sending document [${filename}] to ${resolvedTargetJid}...`);
    const result = await client.sendMessage(resolvedTargetJid, media, { caption });
    logger.info('Message sent successfully');
    logger.info('Duration:', Date.now() - start, 'ms');
    logger.info(result);

    const messageId = result?.id?.id || `doc-${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    logger.error('sendMessage failed');
    logger.error('Duration:', Date.now() - start, 'ms');
    logger.error(err);
    logger.error(err.stack);

    const errorScreenshotPath = path.join(__dirname, '../after-send-doc-error.png');
    if (client.pupPage && !client.pupPage.isClosed()) {
      await client.pupPage.screenshot({ path: errorScreenshotPath }).catch(() => {});
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

module.exports = {
  startClient,
  destroyClient,
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
