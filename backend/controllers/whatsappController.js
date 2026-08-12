/**
 * whatsappController.js - Request handlers for WhatsApp Gateway endpoints
 */

'use strict';

const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

const isValidPhone = (phone) => {
  if (!phone) return false;
  const digits = phone.toString().replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

const isValidUrl = (urlStr) => {
  try {
    new URL(urlStr);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Handles POST /api/whatsapp/start
 * Starts client and begins QR generation on-demand
 */
async function startWhatsApp(req, res) {
  try {
    logger.info('[WhatsApp Start Controller] Entered:', {
      origin: req.headers.origin || 'none',
      method: req.method,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      path: req.originalUrl || req.url,
    });

    whatsappService.startClient().catch((error) => {
      logger.error('Background WhatsApp startup failed:', { error: error.message });
    });

    const status = whatsappService.getStatus();
    return res.status(200).json({
      success: true,
      message: 'WhatsApp gateway startup initiated',
      data: status,
    });
  } catch (error) {
    logger.error('Error starting WhatsApp gateway:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to start WhatsApp gateway',
      error: error.message,
    });
  }
}

/**
 * Handles GET /api/whatsapp/status
 */
function getStatus(req, res) {
  try {
    const status = whatsappService.getStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve status',
      error: error.message,
    });
  }
}

/**
 * Handles GET /api/whatsapp/qr
 * Returns current QR code or triggers on-demand generation
 */
async function getQr(req, res) {
  try {
    const qrData = await whatsappService.getQr();
    return res.status(200).json({
      success: true,
      data: qrData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get QR code',
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/whatsapp/logout
 * Logs out, destroys browser, and frees all memory
 */
async function logoutWhatsApp(req, res) {
  try {
    logger.info('WhatsApp logout requested via API');
    const status = await whatsappService.destroyClient();
    return res.status(200).json({
      success: true,
      message: 'WhatsApp client logged out and destroyed',
      data: status,
    });
  } catch (error) {
    logger.error('Error during logout:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to logout WhatsApp client',
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/whatsapp/reconnect
 */
async function reconnectWhatsApp(req, res) {
  try {
    logger.info('Received reconnect request');
    const status = await whatsappService.startClient();
    return res.status(200).json({
      success: true,
      message: 'Reconnection initiated',
      data: status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Reconnection failed',
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/whatsapp/refresh-qr
 */
async function refreshQr(req, res) {
  try {
    logger.info('Received refresh-qr request');
    const status = await whatsappService.startClient();
    return res.status(200).json({
      success: true,
      message: 'QR code refresh initiated',
      data: status,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'QR refresh failed',
      error: error.message,
    });
  }
}

/**
 * Handles GET /api/whatsapp/events (SSE)
 */
function eventsStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial state
  const initialData = JSON.stringify(whatsappService.getStatus());
  res.write(`event: status\ndata: ${initialData}\n\n`);

  const onStatusChange = (status) => {
    try {
      res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
    } catch (_) {}
  };

  const onQr = (qrData) => {
    try {
      res.write(`event: qr\ndata: ${JSON.stringify(qrData)}\n\n`);
    } catch (_) {}
  };

  const onProgress = (progressData) => {
    try {
      res.write(`event: wa-progress\ndata: ${JSON.stringify(progressData)}\n\n`);
      res.write(`event: progress\ndata: ${JSON.stringify(progressData)}\n\n`);
    } catch (_) {}
  };

  whatsappService.events.on('status_change', onStatusChange);
  whatsappService.events.on('qr', onQr);
  whatsappService.events.on('progress', onProgress);
  whatsappService.events.on('wa-progress', onProgress);

  req.on('close', () => {
    whatsappService.events.off('status_change', onStatusChange);
    whatsappService.events.off('qr', onQr);
    whatsappService.events.off('progress', onProgress);
    whatsappService.events.off('wa-progress', onProgress);
    res.end();
  });
}

/**
 * Handles POST /api/whatsapp/send (Standard Text Send)
 */
async function sendTextMessage(req, res, next) {
  try {
    const { phone, message } = req.body;

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid phone number (at least 10 digits) is required.',
        error: 'Invalid phone number',
      });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty.',
        error: 'Empty message',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not connected. Please scan the QR code first.',
        error: 'WhatsApp not ready',
      });
    }

    const result = await whatsappService.sendTextMessage(phone, message.trim());
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles POST /api/whatsapp/test-message
 */
async function sendTestMessage(req, res, next) {
  try {
    const { phone, message } = req.body;

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid phone number (at least 10 digits) is required.',
        error: 'Invalid phone number',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not connected. Please scan the QR code first.',
        error: 'WhatsApp not ready',
      });
    }

    const testMsg =
      message && typeof message === 'string' && message.trim().length > 0
        ? message.trim()
        : '👋 Hello! This is a test message from Bhagwat Library WhatsApp Gateway. System is active & connected! ✅';

    const result = await whatsappService.sendTextMessage(phone, testMsg);
    return res.status(200).json({
      success: true,
      message: 'Test message sent successfully!',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handles POST /api/whatsapp/invoice
 */
async function sendInvoiceMessage(req, res, next) {
  try {
    const { phone, invoiceUrl } = req.body;

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid phone number is required.',
        error: 'Invalid phone number',
      });
    }
    if (!invoiceUrl || !isValidUrl(invoiceUrl)) {
      return res.status(400).json({
        success: false,
        message: 'A valid invoice URL is required.',
        error: 'Invalid URL',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not connected. Please scan the QR code in Settings.',
        error: 'WhatsApp not ready',
      });
    }

    let filename = 'invoice.pdf';
    try {
      const urlPath = new URL(invoiceUrl).pathname;
      const base = urlPath.substring(urlPath.lastIndexOf('/') + 1);
      if (base && base.endsWith('.pdf')) {
        filename = base;
      }
    } catch (_) {}

    const result = await whatsappService.sendDocument(
      phone,
      invoiceUrl,
      filename,
      'Your Bhagwat Library Invoice'
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles POST /api/whatsapp/reminder
 */
async function sendReminderMessage(req, res, next) {
  try {
    const { phone, studentName, dueAmount, dueDate } = req.body;

    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid phone number is required.',
        error: 'Invalid phone number',
      });
    }
    if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Student name is required.',
        error: 'Invalid student name',
      });
    }
    if (dueAmount === undefined || isNaN(Number(dueAmount))) {
      return res.status(400).json({
        success: false,
        message: 'Due amount must be a number.',
        error: 'Invalid amount',
      });
    }
    if (!dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Due date is required.',
        error: 'Invalid due date',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not connected. Please scan the QR code in Settings.',
        error: 'WhatsApp not ready',
      });
    }

    const formattedAmount = Number(dueAmount).toFixed(2);
    const generatedMessage = `Dear ${studentName.trim()},\n\nThis is a payment reminder from Bhagwat Library. You have a pending fee of INR ${formattedAmount} which is due on ${dueDate}.\n\nPlease clear the dues to ensure uninterrupted library access.\n\nThank you!`;

    const result = await whatsappService.sendTextMessage(phone, generatedMessage);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles POST /api/whatsapp/bulk
 */
async function sendBulkMessages(req, res, next) {
  try {
    const { phones, message } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A non-empty list of phone numbers is required.',
        error: 'Empty phones list',
      });
    }

    const validPhones = phones.filter((p) => isValidPhone(p));
    if (validPhones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid phone numbers found in list.',
        error: 'Invalid phone numbers',
      });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty.',
        error: 'Empty message',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp client is not connected. Please scan the QR code in Settings.',
        error: 'WhatsApp not ready',
      });
    }

    const result = await whatsappService.sendBulkMessages(validPhones, message.trim(), 1000);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  startWhatsApp,
  getStatus,
  getQr,
  logoutWhatsApp,
  reconnectWhatsApp,
  refreshQr,
  eventsStream,
  sendTestMessage,
  sendTextMessage,
  sendInvoiceMessage,
  sendReminderMessage,
  sendBulkMessages,
};
