import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";

const COMMUNICATION_COLLECTION = "communicationHistory";
const BACKEND_URL = 'http://localhost:5000';

/**
 * Creates and logs communication details into Firestore communicationHistory collection
 */
export const logCommunicationEntry = async (student, messageType, status = "sent") => {
  try {
    const commHistoryRef = collection(db, COMMUNICATION_COLLECTION);
    const commData = {
      studentId: student.id || student.studentId || "",
      studentName: student.name || student.studentName || "",
      phone: student.phone || "",
      seat: Number(student.seatNumber) || 0,
      seatNumber: Number(student.seatNumber) || 0,
      batch: Array.isArray(student.batch) ? student.batch.join(", ") : String(student.batch || ""),
      messageType, // "Membership Reminder", "Membership Expired", "Invoice", "Payment Reminder", "Book Due"
      status, // "sent", "failed"
      createdAt: serverTimestamp(),
      sentAt: serverTimestamp(),
    };

    const docRef = await addDoc(commHistoryRef, commData);

    if (student.id) {
      try {
        const studentDocRef = doc(db, "students", student.id);
        await updateDoc(studentDocRef, {
          lastMessageSent: {
            type: messageType,
            sentAt: new Date().toISOString(),
            status,
          },
        });
      } catch (_) {}
    }

    return { id: docRef.id, ...commData };
  } catch (error) {
    console.error("Error creating communication log:", error);
    return null;
  }
};

/**
 * Get WhatsApp client status from backend
 */
export const getWhatsAppStatus = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/whatsapp/status`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    return json.data || { status: 'DISCONNECTED', isReady: false };
  } catch (err) {
    return {
      status: 'DISCONNECTED',
      isReady: false,
      error: 'Backend server is offline or unreachable on port 5000',
    };
  }
};

/**
 * Reconnect WhatsApp client
 */
export const reconnectWhatsApp = async () => {
  const res = await fetch(`${BACKEND_URL}/api/whatsapp/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
};

/**
 * Refresh QR Code
 */
export const refreshWhatsAppQR = async (resetSession = false) => {
  const res = await fetch(`${BACKEND_URL}/api/whatsapp/refresh-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetSession }),
  });
  return res.json();
};

/**
 * Send Test WhatsApp Message
 */
export const sendTestWhatsAppMessage = async (phone, message) => {
  const res = await fetch(`${BACKEND_URL}/api/whatsapp/test-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to send test message');
  }
  return data;
};

/**
 * Sends a real WhatsApp invoice dispatch by calling backend generator then sender
 */
export const sendWhatsAppInvoice = async (student) => {
  try {
    // 1. Generate PDF Invoice
    const genRes = await fetch(`${BACKEND_URL}/api/invoice/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.name || "",
        amount: student.totalAmount - student.paidAmount || student.dueAmount || 0,
        seatNumber: student.seatNumber || 'N/A',
        dueDate: student.validityTo || '',
        batch: Array.isArray(student.batch) ? student.batch.join(", ") : student.batch || 'N/A',
      }),
    });

    const genData = await genRes.json();
    if (!genRes.ok || !genData.success) {
      throw new Error(genData.error || 'Failed to generate PDF Invoice');
    }

    // 2. Dispatch invoice PDF URL via WhatsApp document endpoint
    const whatsappRes = await fetch(`${BACKEND_URL}/api/whatsapp/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: student.phone || "",
        invoiceUrl: genData.pdfUrl,
      }),
    });

    const whatsappData = await whatsappRes.json();
    if (!whatsappRes.ok || !whatsappData.success) {
      throw new Error(whatsappData.error || 'Failed to send WhatsApp document invoice');
    }

    await logCommunicationEntry(student, "Invoice", "sent");
    return whatsappData;
  } catch (err) {
    console.error("WhatsApp invoice dispatch failed:", err);
    try {
      await logCommunicationEntry(student, "Invoice", "failed");
    } catch (_) {}
    throw err;
  }
};

/**
 * Sends a real WhatsApp due reminder dispatch using backend reminder endpoint
 */
export const sendWhatsAppReminder = async (student) => {
  try {
    const phone = student.phone || "";
    const name = student.name || "";
    const dueAmount = student.totalAmount - student.paidAmount || student.dueAmount || 0;
    const dueDate = student.validityTo || student.dueDate || "";

    const response = await fetch(`${BACKEND_URL}/api/whatsapp/reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        studentName: name,
        dueAmount,
        dueDate,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to send WhatsApp reminder');
    }

    await logCommunicationEntry(student, "Payment Reminder", "sent");
    return data;
  } catch (err) {
    console.error("WhatsApp reminder dispatch failed:", err);
    try {
      await logCommunicationEntry(student, "Payment Reminder", "failed");
    } catch (_) {}
    throw err;
  }
};

/**
 * Sends a membership expiry reminder
 */
export const sendMembershipReminder = async (student, messageType = "Membership Reminder") => {
  try {
    const phone = student.phone || "";
    const message = `Dear ${student.name || 'student'},\n\nThis is a notification regarding your Bhagwat Library membership status. Please renew on time to avoid disruption.\n\nThank you!`;

    const response = await fetch(`${BACKEND_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to send membership reminder');
    }

    await logCommunicationEntry(student, messageType, "sent");
    return data;
  } catch (err) {
    console.error("Membership reminder dispatch failed:", err);
    try {
      await logCommunicationEntry(student, messageType, "failed");
    } catch (_) {}
    throw err;
  }
};

/**
 * Sends bulk membership expiry reminders
 */
export const sendBulkReminders = async (studentsList, messageType = "Membership Reminder") => {
  try {
    const phones = studentsList.map((s) => s.phone).filter(Boolean);
    if (phones.length === 0) return true;

    const response = await fetch(`${BACKEND_URL}/api/whatsapp/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phones,
        message: 'Dear student, this is a reminder from Bhagwat Library regarding your membership. Please check your status.',
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to send bulk reminders');
    }

    const promises = studentsList.map((student) =>
      logCommunicationEntry(student, messageType, "sent")
    );
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error("Bulk reminders dispatch failed:", err);
    throw err;
  }
};


