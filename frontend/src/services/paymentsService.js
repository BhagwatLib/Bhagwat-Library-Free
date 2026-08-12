import {
  collection,
  doc,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "payments";
const paymentsRef = collection(db, COLLECTION_NAME);

/**
 * Fetch payment records
 */
export const getPaymentsFromFirestore = async () => {
  try {
    const q = query(paymentsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Error fetching payments from Firestore:", error);
    return [];
  }
};

/**
 * Realtime subscription to payments
 */
export const subscribePayments = (callback) => {
  try {
    const q = query(paymentsRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const payments = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(payments);
    });
  } catch (err) {
    console.error("Error subscribing to payments:", err);
    return () => {};
  }
};

/**
 * Log payment transaction
 */
export const recordPaymentInFirestore = async (paymentData) => {
  try {
    const record = {
      studentId: paymentData.studentId || "",
      studentName: paymentData.studentName || "",
      amount: Number(paymentData.amount) || 0,
      status: paymentData.status || "Paid",
      method: paymentData.method || "Cash",
      date: paymentData.date || new Date().toISOString().split("T")[0],
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(paymentsRef, record);
    return { id: docRef.id, ...record };
  } catch (error) {
    console.error("Error recording payment in Firestore:", error);
    throw error;
  }
};
