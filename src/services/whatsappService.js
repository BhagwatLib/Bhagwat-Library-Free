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
      seatNumber: Number(student.seatNumber) || 0,
      batch: Array.isArray(student.batch) ? student.batch.join(", ") : String(student.batch || ""),
      messageType, // "invoice" or "reminder"
      status, // "pending", "sent", "failed"
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
 * Simulates WhatsApp invoice dispatch in the background (no window.open or redirects)
 */
export const sendWhatsAppInvoice = async (student) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        // Log log entry in Firestore database
        await logCommunicationEntry(student, "invoice", "sent");
        resolve(true);
      } catch (err) {
        console.error("WhatsApp invoice simulation failed:", err);
        try {
          await logCommunicationEntry(student, "invoice", "failed");
        } catch (_) {}
        reject(err);
      }
    }, 800); // Simulate API latency
  });
};

/**
 * Simulates WhatsApp due reminder dispatch in the background (no window.open or redirects)
 */
export const sendWhatsAppReminder = async (student) => {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        // Log log entry in Firestore database
        await logCommunicationEntry(student, "reminder", "sent");
        resolve(true);
      } catch (err) {
        console.error("WhatsApp reminder simulation failed:", err);
        try {
          await logCommunicationEntry(student, "reminder", "failed");
        } catch (_) {}
        reject(err);
      }
    }, 800); // Simulate API latency
  });
};
