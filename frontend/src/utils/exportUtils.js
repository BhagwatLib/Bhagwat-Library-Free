import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

/**
 * Export data to Excel file
 */
export const exportToExcel = (data, filename = "library_report.xlsx", sheetName = "Report") => {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
    return true;
  } catch (error) {
    console.error("Failed to export Excel:", error);
    return false;
  }
};

/**
 * Export report to PDF file
 */
export const exportToPDF = (title, headers, rows, filename = "library_report.pdf") => {
  try {
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    // Header
    doc.setFillColor(15, 23, 42); // Dark bg
    doc.rect(0, 0, 210, 28, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bhagwat Library", 14, 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${today}`, 150, 15);

    // Subtitle
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 38);

    // Table rendering
    let startY = 46;
    const cellWidth = Math.floor(180 / headers.length);

    // Draw header row
    doc.setFillColor(241, 245, 249);
    doc.rect(14, startY, 182, 8, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);

    headers.forEach((h, i) => {
      doc.text(String(h), 16 + i * cellWidth, startY + 5.5);
    });

    startY += 10;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);

    rows.forEach((row, rowIndex) => {
      if (startY > 270) {
        doc.addPage();
        startY = 20;
      }

      if (rowIndex % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, startY - 4, 182, 8, "F");
      }

      row.forEach((cell, cellIndex) => {
        const cellText = String(cell || "-");
        doc.text(cellText.length > 20 ? cellText.substring(0, 18) + "..." : cellText, 16 + cellIndex * cellWidth, startY + 1.5);
      });

      startY += 8;
    });

    doc.save(filename);
    return true;
  } catch (error) {
    console.error("Failed to export PDF:", error);
    return false;
  }
};
