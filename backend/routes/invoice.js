const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

// Define invoice/PDF routes
router.post('/generate', invoiceController.generateInvoice);
router.post('/upload', invoiceController.uploadInvoice);

module.exports = router;
