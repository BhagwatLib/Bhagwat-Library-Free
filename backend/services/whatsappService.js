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

const { Client, NoAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const puppeteer = require('puppeteer');
// Event emitter for broadcasting real-time WhatsApp lifecycle events
class WhatsAppEventEmitter extends EventEmitter {}
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
 * Instantiates and configures single WhatsApp client instance with bundled Puppeteer
 */
function setupClient() {
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

  logger.info('[WhatsApp Diagnostics] Puppeteer Launch Configuration:', {
    authStrategy: 'NoAuth',
    headless: 'new',
    puppeteerArgs,
  });

 const executablePath = puppeteer.executablePath();

logger.info('[WhatsApp Diagnostics] Chrome Executable:', executablePath);

client = new Client({
  authStrategy: new NoAuth(),
  puppeteer: {
    executablePath,
    headless: 'new',
    args: puppeteerArgs,
  },
});

  client.ready = false;

  // Event: QR Code Received
  client.on('qr', async (qr) => {
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

  // Event: Authenticated
  client.on('authenticated', () => {
    logger.info('[WhatsApp Diagnostics] Authenticated! WhatsApp Web session established.');
    connectionStatus = 'AUTHENTICATED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastError = null;
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Ready
  client.on('ready', () => {
    logger.info('[WhatsApp Diagnostics] Ready! WhatsApp Web client is ready and connected!');
    isReady = true;
    client.ready = true;
    connectionStatus = 'CONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastConnectedTime = new Date().toISOString();
    lastError = null;

    try {
      clientInfo = {
        pushname: client.info?.pushname || 'Bhagwat Library Admin',
        wid: client.info?.wid?.user || '',
        platform: client.info?.platform || 'web',
      };
      logger.info('[WhatsApp Diagnostics] Connected Account Info:', clientInfo);
    } catch (_) {
      clientInfo = { pushname: 'Bhagwat Library Admin' };
    }

    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Auth Failure
  client.on('auth_failure', (msg) => {
    logger.error('[WhatsApp Diagnostics] Authentication failed', { message: msg });
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

  // Event: Disconnected
  client.on('disconnected', (reason) => {
    logger.warn('[WhatsApp Diagnostics] Disconnected. Reason:', { reason });
    isReady = false;
    client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    whatsappEvents.emit('status_change', getStatus());
    destroyClient().catch(() => {});
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

    setupClient();
    logger.info('[WhatsApp Diagnostics] Starting client.initialize()...');
    logger.info('[WhatsApp Diagnostics] Waiting for browser to launch and generate QR...');

    await client.initialize();
    logger.info('[WhatsApp Diagnostics] WhatsApp client.initialize() promise resolved successfully.');
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
    } catch (_) {}

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

/**
 * Sends text message to single recipient
 */
async function sendTextMessage(phone, message) {
  if (!isReady || !client || !client.ready) {
    throw new Error('WhatsApp client is not connected. Please scan the QR code first in Settings → WhatsApp Gateway.');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    throw new Error('Invalid phone number provided.');
  }
  if (!message) {
    throw new Error('Message content cannot be empty.');
  }

  try {
    logger.info(`Checking WhatsApp registration for: ${normalizedPhone}...`);
    const numberId = await client.getNumberId(normalizedPhone);

    if (!numberId) {
      logger.warn(`Number ${normalizedPhone} is not registered on WhatsApp.`);
      const error = new Error('This phone number is not registered on WhatsApp.');
      error.statusCode = 400;
      throw error;
    }

    const resolvedJid = numberId._serialized;
    logger.info(`Sending message to ${resolvedJid}...`);
    const response = await client.sendMessage(resolvedJid, message);

    const messageId = response?.id?.id || `msg-${Date.now()}`;
    logger.info(`Message sent successfully. ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    logger.error(`Failed to send message to ${phone}`, {
      message: error.message,
      stack: error.stack,
    });
    throw error;
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
  if (!normalizedPhone) {
    throw new Error('Invalid phone number provided.');
  }
  if (!documentUrl) {
    throw new Error('Document URL is required.');
  }

  try {
    logger.info(`Checking WhatsApp registration for: ${normalizedPhone}...`);
    const numberId = await client.getNumberId(normalizedPhone);

    if (!numberId) {
      logger.warn(`Number ${normalizedPhone} is not registered on WhatsApp.`);
      const error = new Error('This phone number is not registered on WhatsApp.');
      error.statusCode = 400;
      throw error;
    }

    const resolvedJid = numberId._serialized;
    logger.info(`Resolving media from URL: ${documentUrl}...`);
    const media = await getMediaFromUrl(documentUrl, filename);

    logger.info(`Sending document [${filename}] to ${resolvedJid}...`);
    const response = await client.sendMessage(resolvedJid, media, { caption });

    const messageId = response?.id?.id || `doc-${Date.now()}`;
    logger.info(`Document sent successfully. ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    logger.error(`Failed to send document [${filename}] to ${phone}`, {
      message: error.message,
      stack: error.stack,
    });
    throw error;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
