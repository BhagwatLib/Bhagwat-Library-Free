import {
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "attendance";
const attendanceRef = collection(db, COLLECTION_NAME);

/**
 * Fetch attendance logs
 */
export const getAttendanceFromFirestore = async (date) => {
  try {
    let q = attendanceRef;
    if (date) {
      q = query(attendanceRef, where("date", "==", date));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Error fetching attendance from Firestore:", error);
    return [];
  }
};

/**
 * Subscribe to attendance changes
 */
export const subscribeAttendance = (callback, date) => {
  try {
    let q = attendanceRef;
    if (date) {
      q = query(attendanceRef, where("date", "==", date));
    }
    return onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(records);
    });
  } catch (err) {
    console.error("Error subscribing to attendance:", err);
    return () => {};
  }
};

/**
 * Mark student attendance
 */
export const markAttendanceInFirestore = async (studentId, status = "Present", date = null) => {
  try {
    const record = {
      studentId,
      status,
      date: date || new Date().toISOString().split("T")[0],
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(attendanceRef, record);
    return { id: docRef.id, ...record };
  } catch (error) {
    console.error("Error marking attendance in Firestore:", error);
    throw error;
  }
};
