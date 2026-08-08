const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

// Simple validation helpers
const isValidPhone = (phone) => {
  if (!phone) return false;
  const digits = phone.toString().replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

const isValidUrl = (urlStr) => {
  try {
    new URL(urlStr);
    return true;
  } catch (err) {
    return false;
  }
};

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
    // Fire and do not block the response
    whatsappService.reconnect().catch((err) => {
      logger.error('Error during reconnect:', { error: err.message });
    });

    return res.status(200).json({
      success: true,
      message: 'Reconnection initiated',
      data: whatsappService.getStatus(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles POST /api/whatsapp/refresh-qr
 */
async function refreshQr(req, res) {
  try {
    const { resetSession } = req.body || {};
    logger.info(`Received refresh-qr request (resetSession: ${resetSession})`);
    
    whatsappService.refreshQr(Boolean(resetSession)).catch((err) => {
      logger.error('Error during refreshQr:', { error: err.message });
    });

    return res.status(200).json({
      success: true,
      message: 'QR code refresh initiated',
      data: whatsappService.getStatus(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handles GET /api/whatsapp/events (Server-Sent Events)
 */
function eventsStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial state immediately
  const initialData = JSON.stringify(whatsappService.getStatus());
  res.write(`event: status\ndata: ${initialData}\n\n`);

  const onStatusChange = (status) => {
    try {
      res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
    } catch (e) {}
  };

  const onQr = (qrData) => {
    try {
      res.write(`event: qr\ndata: ${JSON.stringify(qrData)}\n\n`);
    } catch (e) {}
  };

  whatsappService.events.on('status_change', onStatusChange);
  whatsappService.events.on('qr', onQr);

  req.on('close', () => {
    whatsappService.events.off('status_change', onStatusChange);
    whatsappService.events.off('qr', onQr);
    res.end();
  });
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
        error: 'A valid phone number (at least 10 digits) is required.',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not connected. Please scan the QR code first.',
      });
    }

    const testMsg =
      message && typeof message === 'string' && message.trim().length > 0
        ? message.trim()
        : `👋 Hello! This is a test message from Bhagwat Library Management System WhatsApp service. System is active & connected! ✅`;

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
 * Handles POST /api/whatsapp/send
 */
async function sendTextMessage(req, res, next) {
  try {
    const { phone, message } = req.body;

    // Validation
    if (!phone || !isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'A valid phone number (with country code) is required.',
      });
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message content cannot be empty.',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.',
      });
    }

    const result = await whatsappService.sendWhatsAppMessage(phone, message.trim());
    return res.status(200).json(result);
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
        error: 'A valid phone number (with country code) is required.',
      });
    }
    if (!invoiceUrl || !isValidUrl(invoiceUrl)) {
      return res.status(400).json({
        success: false,
        error: 'A valid invoice URL is required.',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.',
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

    logger.info(`Attempting standard document send for invoice to ${phone}...`);
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
        error: 'A valid phone number (with country code) is required.',
      });
    }
    if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Student name is required.',
      });
    }
    if (dueAmount === undefined || isNaN(Number(dueAmount))) {
      return res.status(400).json({
        success: false,
        error: 'Due amount must be a number.',
      });
    }
    if (!dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Due date is required.',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.',
      });
    }

    const formattedAmount = Number(dueAmount).toFixed(2);
    const generatedMessage = `Dear ${studentName.trim()},\n\nThis is a payment reminder from Bhagwat Library. You have a pending fee of INR ${formattedAmount} which is due on ${dueDate}.\n\nPlease clear the dues to ensure uninterrupted library access.\n\nThank you!`;

    logger.info(`Attempting standard text send for reminder to ${phone}...`);
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
        error: 'A non-empty list of phone numbers (phones) is required.',
      });
    }

    const validPhones = phones.filter((p) => isValidPhone(p));
    if (validPhones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid phone numbers found in the provided list.',
      });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message content cannot be empty.',
      });
    }

    if (!whatsappService.ready) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client is not connected. Please scan the QR code in Settings → WhatsApp Scanner.',
      });
    }

    const result = await whatsappService.sendBulkMessages(validPhones, message.trim(), 1000);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus,
  reconnectWhatsApp,
  refreshQr,
  eventsStream,
  sendTestMessage,
  sendTextMessage,
  sendInvoiceMessage,
  sendReminderMessage,
  sendBulkMessages,
};

