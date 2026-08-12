/**
 * routes/whatsapp.js - WhatsApp Gateway API Routes
 */

'use strict';

const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// Gateway Lifecycle & QR
router.post('/start', whatsappController.startWhatsApp);
router.get('/status', whatsappController.getStatus);
router.get('/lock', whatsappController.getGatewayLock);
router.post('/lock/release', whatsappController.releaseGatewayLock);
router.get('/qr', whatsappController.getQr);
router.post('/logout', whatsappController.logoutWhatsApp);
router.get('/events', whatsappController.eventsStream);

// Session controls & test
router.post('/reconnect', whatsappController.reconnectWhatsApp);
router.post('/refresh-qr', whatsappController.refreshQr);
router.post('/test-message', whatsappController.sendTestMessage);

// Messaging routes
router.post('/send', whatsappController.sendTextMessage);
router.post('/invoice', whatsappController.sendInvoiceMessage);
router.post('/reminder', whatsappController.sendReminderMessage);
router.post('/bulk', whatsappController.sendBulkMessages);

module.exports = router;
