import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "batches";
const batchesRef = collection(db, COLLECTION_NAME);

const DEFAULT_BATCHES = [
  { name: "Morning Shift", time: "6:00 AM - 10:00 AM", price: "250", fee: 250, startTime: "06:00", endTime: "10:00", active: true },
  { name: "Noon Shift", time: "10:00 AM - 2:00 PM", price: "300", fee: 300, startTime: "10:00", endTime: "14:00", active: true },
  { name: "Afternoon Shift", time: "2:00 PM - 6:00 PM", price: "300", fee: 300, startTime: "14:00", endTime: "18:00", active: true },
  { name: "Evening Shift", time: "6:00 PM - 10:00 PM", price: "250", fee: 250, startTime: "18:00", endTime: "22:00", active: true },
  { name: "Morning+Noon Shift", time: "6:00 AM - 2:00 PM", price: "500", fee: 500, startTime: "06:00", endTime: "14:00", active: true },
  { name: "Noon+Afternoon Shift", time: "10:00 AM - 6:00 PM", price: "550", fee: 550, startTime: "10:00", endTime: "18:00", active: true },
  { name: "Afternoon+Evening Shift", time: "2:00 PM - 10:00 PM", price: "500", fee: 500, startTime: "14:00", endTime: "22:00", active: true },
  { name: "All Shift", time: "All Shift", price: "800", fee: 800, startTime: "06:00", endTime: "22:00", active: true },
];

/**
 * Seeds default batches in Firestore if empty
 */
export const initializeBatchesInFirestore = async () => {
  try {
    const snapshot = await getDocs(batchesRef);
    if (snapshot.empty) {
      console.log("Seeding default batches in Firestore...");
      const promises = DEFAULT_BATCHES.map((b) => addDoc(batchesRef, b));
      await Promise.all(promises);
      console.log("Default batches initialized.");
    }
  } catch (error) {
    console.error("Error initializing batches in Firestore:", error);
  }
};

/**
 * Fetch all batches
 */
export const getBatchesFromFirestore = async () => {
  try {
    await initializeBatchesInFirestore();
    const snapshot = await getDocs(batchesRef);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Error fetching batches from Firestore:", error);
    return [];
  }
};

/**
 * Subscribe to realtime batches updates
 */
export const subscribeBatches = (callback) => {
  try {
    return onSnapshot(batchesRef, (snapshot) => {
      const batches = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(batches);
    });
  } catch (err) {
    console.error("Error subscribing to batches:", err);
    return () => {};
  }
};

/**
 * Create or update batch
 */
export const saveBatchInFirestore = async (batchData) => {
  try {
    if (batchData.id) {
      const docRef = doc(db, COLLECTION_NAME, batchData.id);
      const updates = { ...batchData };
      delete updates.id;
      await updateDoc(docRef, updates);
      return { id: batchData.id, ...updates };
    } else {
      const newDoc = {
        name: batchData.name || batchData.time || "Custom Batch",
        time: batchData.time || "",
        price: String(batchData.price || "0"),
        fee: Number(batchData.price) || 0,
        startTime: batchData.startTime || "",
        endTime: batchData.endTime || "",
        active: true,
      };
      const docRef = await addDoc(batchesRef, newDoc);
      return { id: docRef.id, ...newDoc };
    }
  } catch (error) {
    console.error("Error saving batch in Firestore:", error);
    throw error;
  }
};

/**
 * Delete batch
 */
export const deleteBatchFromFirestore = async (id) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting batch from Firestore:", error);
    throw error;
  }
};
