const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Generates an invoice PDF using pdfkit.
 * @param {object} data - invoice details (studentName, amount, seatNumber, date, transactionId, etc.)
 * @returns {Promise<string>} path to the generated PDF file
 */
function generateInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const {
        studentName = 'Student',
        amount = 0,
        seatNumber = 'N/A',
        dueDate = '',
        invoiceId = `INV-${Date.now()}`,
        date = new Date().toLocaleDateString(),
        batch = 'N/A',
      } = data;

      const fileName = `${invoiceId}.pdf`;
      const filePath = path.join(uploadsDir, fileName);
      
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // --- Color Palette ---
      const primaryColor = '#1e3a8a'; // Navy Blue
      const secondaryColor = '#475569'; // Slate Gray
      const darkColor = '#0f172a'; // Dark Slate
      const lightColor = '#f8fafc'; // Off White
      const dividerColor = '#cbd5e1'; // Light Gray

      // --- Header Banner ---
      doc.rect(0, 0, 595.28, 120).fill(primaryColor);
      
      // Header Text
      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(24)
         .text('BHAGWAT LIBRARY', 50, 40);
      
      doc.fontSize(10)
         .font('Helvetica')
         .text('Premium Study Spaces & Resources', 50, 70);
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('INVOICE / RECEIPT', 400, 45, { align: 'right', width: 145 });

      // --- Invoice Details (Left Side / Right Side Layout) ---
      doc.fillColor(darkColor).y = 150;
      
      // Left side: Student Info
      doc.font('Helvetica-Bold').fontSize(11).text('BILLED TO:', 50, 150);
      doc.font('Helvetica').fontSize(10).text(`Name: ${studentName}`, 50, 170);
      doc.text(`Seat Number: ${seatNumber}`, 50, 185);
      doc.text(`Batch: ${batch}`, 50, 200);

      // Right side: Invoice Info
      doc.font('Helvetica-Bold').fontSize(11).text('INVOICE DETAILS:', 350, 150);
      doc.font('Helvetica').fontSize(10).text(`Invoice No: ${invoiceId}`, 350, 170);
      doc.text(`Date: ${date}`, 350, 185);
      if (dueDate) {
        doc.text(`Due Date: ${dueDate}`, 350, 200);
      }

      // --- Divider ---
      doc.strokeColor(dividerColor)
         .lineWidth(1)
         .moveTo(50, 230)
         .lineTo(545, 230)
         .stroke();

      // --- Item Table Header ---
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('Description', 50, 250)
         .text('Qty', 350, 250, { width: 50, align: 'center' })
         .text('Rate', 400, 250, { width: 60, align: 'right' })
         .text('Amount', 470, 250, { width: 75, align: 'right' });

      // Table Header Divider
      doc.strokeColor(primaryColor)
         .lineWidth(1.5)
         .moveTo(50, 265)
         .lineTo(545, 265)
         .stroke();

      // --- Item Table Body ---
      doc.fillColor(darkColor)
         .font('Helvetica')
         .fontSize(10)
         .text('Library Membership Access Fee', 50, 280)
         .text('1', 350, 280, { width: 50, align: 'center' })
         .text(`INR ${amount.toFixed(2)}`, 400, 280, { width: 60, align: 'right' })
         .text(`INR ${amount.toFixed(2)}`, 470, 280, { width: 75, align: 'right' });

      // Table Body Divider
      doc.strokeColor(dividerColor)
         .lineWidth(1)
         .moveTo(50, 305)
         .lineTo(545, 305)
         .stroke();

      // --- Summary / Totals ---
      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .text('Subtotal:', 350, 325, { width: 100, align: 'right' })
         .fillColor(darkColor)
         .font('Helvetica')
         .text(`INR ${amount.toFixed(2)}`, 450, 325, { width: 95, align: 'right' });

      doc.fillColor(secondaryColor)
         .font('Helvetica-Bold')
         .text('Tax (0%):', 350, 340, { width: 100, align: 'right' })
         .fillColor(darkColor)
         .font('Helvetica')
         .text('INR 0.00', 450, 340, { width: 95, align: 'right' });

      // Total Box Background
      doc.rect(350, 360, 195, 30).fill(lightColor);

      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(12)
         .text('TOTAL:', 360, 369)
         .text(`INR ${amount.toFixed(2)}`, 430, 369, { width: 105, align: 'right' });

      // --- Footer ---
      doc.fillColor(secondaryColor)
         .font('Helvetica')
         .fontSize(8)
         .text('Note: This is a system-generated receipt. No signature is required.', 50, 700, { align: 'center', width: 495 });
      
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text('Thank you for studying with us!', 50, 720, { align: 'center', width: 495 });

      doc.end();

      stream.on('finish', () => {
        logger.info(`Invoice PDF generated successfully: ${fileName}`);
        resolve(filePath);
      });

      stream.on('error', (err) => {
        logger.error(`Error writing PDF file: ${err.message}`);
        reject(err);
      });
    } catch (error) {
      logger.error(`Failed to generate PDF: ${error.message}`);
      reject(error);
    }
  });
}

module.exports = {
  generateInvoicePdf,
};
