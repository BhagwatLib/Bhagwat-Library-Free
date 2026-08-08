const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// Status and Connection Management
router.get('/status', whatsappController.getStatus);
router.get('/events', whatsappController.eventsStream);
router.post('/reconnect', whatsappController.reconnectWhatsApp);
router.post('/refresh-qr', whatsappController.refreshQr);
router.post('/test-message', whatsappController.sendTestMessage);

// Messaging routes
router.post('/send', whatsappController.sendTextMessage);
router.post('/invoice', whatsappController.sendInvoiceMessage);
router.post('/reminder', whatsappController.sendReminderMessage);
router.post('/bulk', whatsappController.sendBulkMessages);

module.exports = router;

