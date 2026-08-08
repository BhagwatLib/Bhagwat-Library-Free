/**
 * whatsappService.js - Production-ready on-demand WhatsApp gateway for Render
 *
 * Architecture:
 * - Idle / DISCONNECTED on server startup (0 Puppeteer memory overhead).
 * - Starts ONLY when requested via /start or /qr.
 * - Single active browser instance enforced.
 * - Uses Puppeteer bundled Chromium automatically (headless: "new").
 * - Temporary QR session (NoAuth) — fully ephemeral, zero file locks.
 * - Full cleanup on logout / destroy (frees browser & memory).
 * - Crash-proof on Render: if Chromium is constrained, server and REST APIs stay 100% up.
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
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
    lastConnectedTime,
    clientInfo,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Instantiates and configures single WhatsApp client instance with bundled Puppeteer
 */
function setupClient() {
  logger.info('Instantiating WhatsApp client with Puppeteer bundled Chromium...');

  client = new Client({
    authStrategy: new NoAuth(), // Temporary ephemeral QR session — zero file lock issues on cloud
    puppeteer: {
      headless: 'new', // Modern headless mode
      args: [
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
      ],
    },
  });

  client.ready = false;

  // Event: QR Code Received
  client.on('qr', async (qr) => {
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
      logger.error('Error generating QR Data URL:', { error: err.message });
    }

    connectionStatus = 'QR_READY';
    isReady = false;
    client.ready = false;

    logger.info('Event: qr - New WhatsApp QR Code generated for scanning.');
    console.log('\n--- SCAN THIS QR CODE FOR WHATSAPP AUTHENTICATION ---');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('-----------------------------------------------------\n');

    whatsappEvents.emit('qr', { qrRaw: latestQrRaw, qrDataUrl: latestQrDataUrl });
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Authenticated
  client.on('authenticated', () => {
    connectionStatus = 'AUTHENTICATED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    logger.info('Event: authenticated - WhatsApp Web client authenticated successfully.');
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Ready
  client.on('ready', () => {
    isReady = true;
    client.ready = true;
    connectionStatus = 'CONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    lastConnectedTime = new Date().toISOString();

    try {
      clientInfo = {
        pushname: client.info?.pushname || 'Bhagwat Library Admin',
        wid: client.info?.wid?.user || '',
        platform: client.info?.platform || 'web',
      };
    } catch (_) {
      clientInfo = { pushname: 'Bhagwat Library Admin' };
    }

    logger.info('Event: ready - WhatsApp Web client is ready and connected!');
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Auth Failure
  client.on('auth_failure', (msg) => {
    isReady = false;
    client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    logger.error('Event: auth_failure - WhatsApp Web authentication failed:', { error: msg });
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Disconnected
  client.on('disconnected', (reason) => {
    isReady = false;
    client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    logger.warn('Event: disconnected - WhatsApp Web client disconnected:', { reason });
    whatsappEvents.emit('status_change', getStatus());
    destroyClient().catch(() => {});
  });
}

/**
 * Starts WhatsApp client on-demand (ensures only 1 active instance)
 */
async function startClient() {
  if (isReady && client && client.ready) {
    logger.info('Client already connected and ready.');
    return getStatus();
  }

  if (isInitializing) {
    logger.info('Client initialization already in progress...');
    return getStatus();
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';
  whatsappEvents.emit('status_change', getStatus());

  try {
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        logger.warn('Previous client cleanup warning (ignored):', { error: err.message });
      }
      client = null;
    }

    setupClient();
    logger.info('Initializing WhatsApp Web client on-demand...');
    await client.initialize();
  } catch (err) {
    logger.warn('WhatsApp Web initialization deferred/unavailable on this host:', { error: err.message });
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
  logger.info('Destroying WhatsApp Web client & releasing browser resources...');
  if (client) {
    try {
      await client.logout();
    } catch (_) {}

    try {
      await client.destroy();
    } catch (err) {
      logger.warn('Error during client.destroy() (ignored):', { error: err.message });
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
  logger.info('WhatsApp client completely destroyed. Memory & browser freed.');
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
      logger.warn('Error triggering on-demand QR start:', { error: err.message });
    });
  }

  return {
    status: connectionStatus,
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
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
        logger.error(`Error reading local file: ${localPath}`, { error: err.message });
      }
    }
  }

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const mimeType = response.headers['content-type'] || 'application/pdf';
    const base64Data = Buffer.from(response.data, 'binary').toString('base64');
    return new MessageMedia(mimeType, base64Data, filename || 'document.pdf');
  } catch (err) {
    logger.error(`Failed to download document from URL: ${url}`, { error: err.message });
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
    logger.error(`Failed to send message to ${phone}`, { error: error.message });
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
    logger.error(`Failed to send document [${filename}] to ${phone}`, { error: error.message });
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
      logger.error(`Bulk send error for ${phone}: ${error.message}`);
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
