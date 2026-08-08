const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfService = require('../services/pdfService');
const logger = require('../utils/logger');

// Setup multer storage for local PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only PDFs
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Handles PDF Invoice Generation
 * POST /api/invoice/generate
 */
async function generateInvoice(req, res, next) {
  try {
    const { studentName, amount, seatNumber, dueDate, batch } = req.body;

    // Validation
    if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Student name is required.',
      });
    }
    if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a non-negative number.',
      });
    }

    const invoiceId = `INV-${Date.now()}`;
    const invoiceData = {
      studentName: studentName.trim(),
      amount: Number(amount),
      seatNumber: seatNumber || 'N/A',
      dueDate: dueDate || '',
      batch: batch || 'N/A',
      invoiceId,
      date: new Date().toLocaleDateString(),
    };

    const filePath = await pdfService.generateInvoicePdf(invoiceData);
    const fileName = path.basename(filePath);

    // Build downloadable URL relative to backend server
    const host = req.get('host');
    const protocol = req.protocol;
    const pdfUrl = `${protocol}://${host}/uploads/${fileName}`;

    logger.info(`Generated invoice PDF for student ${studentName}`, { invoiceId, pdfUrl });

    return res.status(200).json({
      success: true,
      invoiceId,
      pdfUrl,
      fileName,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handles PDF Invoice Upload
 * POST /api/invoice/upload
 */
function uploadInvoice(req, res, next) {
  // Use multer middleware to parse the file
  const uploadSingle = upload.single('invoice');

  uploadSingle(req, res, (err) => {
    if (err) {
      logger.error('File upload failed', { error: err.message });
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please supply a PDF file under the "invoice" key.',
      });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const pdfUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    logger.info(`Uploaded file successfully: ${req.file.filename}`, { pdfUrl });

    return res.status(200).json({
      success: true,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
      pdfUrl,
    });
  });
}

module.exports = {
  generateInvoice,
  uploadInvoice,
};
