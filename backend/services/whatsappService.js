const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../utils/logger');

// Event emitter for broadcasting WhatsApp lifecycle events
class WhatsAppEventEmitter extends EventEmitter {}
const whatsappEvents = new WhatsAppEventEmitter();

let client = null;
let isReady = false;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATED' | 'CONNECTED'
let latestQrRaw = null;
let latestQrDataUrl = null;
let lastConnectedTime = null;
let clientInfo = null;
let isInitializing = false;

// Normalize phone number to E.164 without '+' (e.g. 8789366398 -> 918789366398)
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  let clean = phone.toString().replace(/\D/g, '');
  if (clean.length === 10) {
    clean = '91' + clean;
  }
  return clean;
};

// LocalAuth session folder — configurable via WHATSAPP_SESSION_PATH env var
const authPath = process.env.WHATSAPP_SESSION_PATH
  ? path.resolve(process.env.WHATSAPP_SESSION_PATH)
  : path.join(__dirname, '../.wwebjs_auth');


// Function to clean LocalAuth folder ONLY when explicitly requested or severe auth failure
function cleanAuthFolder() {
  if (fs.existsSync(authPath)) {
    try {
      logger.warn('Clearing LocalAuth session folder...');
      fs.rmSync(authPath, { recursive: true, force: true });
      logger.info('Successfully cleared LocalAuth folder.');
    } catch (err) {
      logger.error('Failed to remove LocalAuth folder:', { error: err.message });
    }
  }
}

// Function to setup Client instance
function setupClient() {
  logger.info('Setting up whatsapp-web.js client instance...');
  connectionStatus = 'CONNECTING';
  whatsappEvents.emit('status_change', getStatus());

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: authPath,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
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

    logger.info('Event: qr - New QR code generated from WhatsApp Web.');
    console.log('\n--- SCAN THIS QR CODE FOR WHATSAPP AUTHENTICATION ---');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('-----------------------------------------------------\n');

    whatsappEvents.emit('qr', { qrRaw: latestQrRaw, qrDataUrl: latestQrDataUrl });
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Authenticated (Session saved)
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
    } catch (e) {
      clientInfo = { pushname: 'Bhagwat Library Admin' };
    }

    logger.info('Event: ready - WhatsApp Web client is ready and connected!');
    whatsappEvents.emit('status_change', getStatus());
  });

  // Event: Auth Failure (Token expired or revoked by mobile app)
  client.on('auth_failure', (msg) => {
    isReady = false;
    client.ready = false;
    connectionStatus = 'DISCONNECTED';
    latestQrRaw = null;
    latestQrDataUrl = null;
    logger.error('Event: auth_failure - WhatsApp Web authentication failure:', { error: msg });
    cleanAuthFolder();
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

    // Do NOT wipe auth directory. Attempt graceful reconnect to restore saved session.
    logger.info('Auto-attempting client reconnection preserving saved session in 5 seconds...');
    setTimeout(() => {
      initializeClient().catch((err) => {
        logger.error('Auto-reconnect failed:', { error: err.message });
      });
    }, 5000);
  });
}

// Function to initialize the client
async function initializeClient() {
  if (isInitializing) {
    logger.info('Client initialization already in progress...');
    return;
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';
  whatsappEvents.emit('status_change', getStatus());

  try {
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        logger.warn('Previous client destroy error (ignored):', { error: err.message });
      }
      client = null;
    }

    setupClient();
    logger.info('Initializing WhatsApp Web client...');
    await client.initialize();
  } catch (err) {
    logger.error('Error during WhatsApp Web client initialization:', { error: err.message });
    connectionStatus = 'DISCONNECTED';
    isReady = false;
    whatsappEvents.emit('status_change', getStatus());
  } finally {
    isInitializing = false;
  }
}

// Start initialization on startup
initializeClient();

// Reconnect helper
async function reconnect() {
  logger.info('Manual Reconnect requested by admin.');
  return initializeClient();
}

// Force Refresh QR / Reset Session helper
async function refreshQr(forceCleanSession = false) {
  logger.info(`Refresh QR requested (forceClean: ${forceCleanSession})...`);
  if (forceCleanSession) {
    cleanAuthFolder();
  }
  return initializeClient();
}

// Get current state snapshot
function getStatus() {
  return {
    isReady: isReady && !!client?.ready,
    status: connectionStatus,
    qrCode: latestQrDataUrl,
    rawQr: latestQrRaw,
    lastConnectedTime,
    clientInfo,
    timestamp: new Date().toISOString(),
  };
}

// Helper to fetch media from URL or load local file
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

async function sendTextMessage(phone, message) {
  if (!isReady || !client || !client.ready) {
    throw new Error('WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    throw new Error('Invalid phone number provided');
  }
  if (!message) {
    throw new Error('Message content is empty');
  }

  try {
    logger.info(`Checking if number is registered: ${normalizedPhone}...`);
    const numberId = await client.getNumberId(normalizedPhone);
    logger.info(`getNumberId result for ${normalizedPhone}:`, { numberId });

    if (!numberId) {
      logger.warn(`Number ${normalizedPhone} is not registered on WhatsApp.`);
      const error = new Error('This phone number is not registered on WhatsApp.');
      error.statusCode = 400;
      throw error;
    }

    const resolvedJid = numberId._serialized;
    logger.info(`Sending WhatsApp message to ${resolvedJid}...`);
    const response = await client.sendMessage(resolvedJid, message);

    const messageId = response?.id?.id || `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logger.info(`Message sent successfully. ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    logger.error(`Failed to send message to ${phone}`, { error: error.message });
    throw error;
  }
}

async function sendWhatsAppMessage(phone, message) {
  return sendTextMessage(phone, message);
}

async function sendDocument(phone, documentUrl, filename = 'invoice.pdf', caption = '') {
  if (!isReady || !client || !client.ready) {
    throw new Error('WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.');
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    throw new Error('Invalid phone number provided');
  }
  if (!documentUrl) {
    throw new Error('Document URL is required');
  }

  try {
    logger.info(`Checking if number is registered: ${normalizedPhone}...`);
    const numberId = await client.getNumberId(normalizedPhone);

    if (!numberId) {
      logger.warn(`Number ${normalizedPhone} is not registered on WhatsApp.`);
      const error = new Error('This phone number is not registered on WhatsApp.');
      error.statusCode = 400;
      throw error;
    }

    const resolvedJid = numberId._serialized;
    logger.info(`Resolving media for document send from URL: ${documentUrl}...`);
    const media = await getMediaFromUrl(documentUrl, filename);

    logger.info(`Sending document [${filename}] to ${resolvedJid}...`);
    const response = await client.sendMessage(resolvedJid, media, { caption });

    const messageId = response?.id?.id || `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    throw new Error('Phones list must be a non-empty array');
  }
  if (!message) {
    throw new Error('Bulk message content is empty');
  }

  logger.info(`Starting bulk message sending to ${phones.length} recipients...`);
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
      logger.error(`Bulk send error for recipient ${phone}: ${error.message}`);
    }
  }

  logger.info(`Bulk message sending finished. Success: ${successCount}, Failures: ${failureCount}`);
  return {
    success: true,
    totalCount: phones.length,
    successCount,
    failureCount,
    results,
  };
}

module.exports = {
  sendTextMessage,
  sendWhatsAppMessage,
  sendDocument,
  sendInvoiceTemplate,
  sendReminderTemplate,
  sendBulkMessages,
  getStatus,
  reconnect,
  refreshQr,
  events: whatsappEvents,
  get ready() {
    return isReady && client && client.ready;
  },
};

