import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";

const HISTORY_COLLECTION = "messageHistory";

/**
 * Logs message dispatch to Firestore messageHistory collection and updates student summary
 */
const logMessageHistory = async (studentId, phone, messageType, status = "success") => {
  try {
    const historyRef = collection(db, HISTORY_COLLECTION);
    const logData = {
      studentId,
      phone,
      messageType,
      sentAt: serverTimestamp(),
      status,
    };
    
    // Add entry to history collection
    await addDoc(historyRef, logData);

    // Update lastMessageSent summary directly on student document
    const studentDocRef = doc(db, "students", studentId);
    await updateDoc(studentDocRef, {
      lastMessageSent: {
        type: messageType,
        sentAt: new Date().toISOString(),
        status,
      },
    });
  } catch (error) {
    console.error("Error logging message history:", error);
  }
};

/**
 * Clean phone numbers to international standard
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return "";
  const cleaned = phone.toString().replace(/\D/g, "");
  // Default to India country code 91 if length is 10 digits
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  return cleaned;
};

/**
 * Triggers invoice WhatsApp message
 */
export const sendWhatsAppInvoice = async (student) => {
  try {
    const message = `Hello ${student.name},\n\nThank you for the payment at Bhagwat Library.\n\n📄 *INVOICE DETAILS*\nSeat Number: Seat #${student.seatNumber || "N/A"}\nPaid Amount: ₹${student.paidAmount}\nTotal Fee: ₹${student.totalAmount}\nValidity: ${student.validityFrom || "N/A"} to ${student.validityTo || "N/A"}\nPayment Status: Paid ✅\n\nFor any queries, contact administration.`;
    const formattedPhone = formatPhoneNumber(student.phone);

    // Later: Plug Meta WhatsApp Cloud API call here:
    // await callMetaWhatsAppCloudAPI(formattedPhone, message);
    
    // Fallback: Open WhatsApp API Link
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");

    // Log the message status in Firestore
    await logMessageHistory(student.id, student.phone, "invoice", "success");
    return true;
  } catch (err) {
    console.error("Failed to send WhatsApp invoice:", err);
    await logMessageHistory(student.id, student.phone, "invoice", "failed");
    throw err;
  }
};

/**
 * Triggers payment due reminder WhatsApp message
 */
export const sendWhatsAppReminder = async (student) => {
  try {
    const balance = Math.max(0, (student.totalAmount || 0) - (student.paidAmount || 0));
    const message = `Hello ${student.name},\n\nThis is a friendly reminder from Bhagwat Library regarding your pending fees.\n\n📌 *DUE PAYMENT DETAILS*\nSeat Number: Seat #${student.seatNumber || "N/A"}\nPending Balance: ₹${balance}\nTotal Fee: ₹${student.totalAmount}\nValidity Expiring On: ${student.validityTo || "N/A"}\nPayment Status: ${student.paidAmount > 0 ? "Partially Paid ⚠️" : "Unpaid ❌"}\n\nPlease clear your dues at the earliest.`;
    const formattedPhone = formatPhoneNumber(student.phone);

    // Later: Plug Meta WhatsApp Cloud API call here:
    // await callMetaWhatsAppCloudAPI(formattedPhone, message);

    // Fallback: Open WhatsApp API Link
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");

    // Log the message status in Firestore
    await logMessageHistory(student.id, student.phone, "reminder", "success");
    return true;
  } catch (err) {
    console.error("Failed to send WhatsApp reminder:", err);
    await logMessageHistory(student.id, student.phone, "reminder", "failed");
    throw err;
  }
};
