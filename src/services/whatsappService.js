import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";

const COMMUNICATION_COLLECTION = "communicationHistory";

/**
 * Creates and logs communication details into Firestore communicationHistory collection
 */
export const logCommunicationEntry = async (student, messageType, status = "sent") => {
  try {
    const commHistoryRef = collection(db, COMMUNICATION_COLLECTION);
    const commData = {
      studentId: student.id,
      studentName: student.name || "",
      phone: student.phone || "",
      seat: Number(student.seatNumber) || 0,
      seatNumber: Number(student.seatNumber) || 0,
      batch: Array.isArray(student.batch) ? student.batch.join(", ") : String(student.batch || ""),
      messageType, // "Membership Reminder", "Membership Expired", "Invoice", "Payment Reminder"
      status, // "sent", "failed"
      createdAt: serverTimestamp(),
      sentAt: serverTimestamp(),
    };
    
    // Write entry to communicationHistory
    const docRef = await addDoc(commHistoryRef, commData);

    // Update lastMessageSent summary directly on student document
    const studentDocRef = doc(db, "students", student.id);
    await updateDoc(studentDocRef, {
      lastMessageSent: {
        type: messageType,
        sentAt: new Date().toISOString(),
        status,
      },
    });

    return { id: docRef.id, ...commData };
  } catch (error) {
    console.error("Error creating communication log:", error);
    throw error;
  }
};

/**
 * Simulates WhatsApp invoice dispatch in the background
 */
export const sendWhatsAppInvoice = async (student) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await logCommunicationEntry(student, "Invoice", "sent");
        resolve(true);
      } catch (err) {
        console.error("WhatsApp invoice simulation failed:", err);
        try {
          await logCommunicationEntry(student, "Invoice", "failed");
        } catch (_) {}
        reject(err);
      }
    }, 600);
  });
};

/**
 * Simulates WhatsApp due reminder dispatch in the background
 */
export const sendWhatsAppReminder = async (student) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await logCommunicationEntry(student, "Payment Reminder", "sent");
        resolve(true);
      } catch (err) {
        console.error("WhatsApp reminder simulation failed:", err);
        try {
          await logCommunicationEntry(student, "Payment Reminder", "failed");
        } catch (_) {}
        reject(err);
      }
    }, 600);
  });
};

/**
 * Simulates Membership Expiry reminder dispatch in the background
 */
export const sendMembershipReminder = async (student, messageType = "Membership Reminder") => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await logCommunicationEntry(student, messageType, "sent");
        resolve(true);
      } catch (err) {
        console.error("Membership reminder simulation failed:", err);
        try {
          await logCommunicationEntry(student, messageType, "failed");
        } catch (_) {}
        reject(err);
      }
    }, 500);
  });
};

/**
 * Simulates Bulk Membership Expiry reminders dispatch
 */
export const sendBulkReminders = async (studentsList, messageType = "Membership Reminder") => {
  try {
    const promises = studentsList.map((student) =>
      logCommunicationEntry(student, messageType, "sent")
    );
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error("Bulk reminders simulation failed:", err);
    throw err;
  }
};
