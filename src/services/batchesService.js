import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const BATCHES_COLLECTION = "batches";

export const DEFAULT_BATCHES = [
  { id: "batch_a", name: "A Batch", time: "6:00 AM - 10:00 AM", slotKey: "morning", price: 500, seatsUsed: 0 },
  { id: "batch_b", name: "B Batch", time: "10:00 AM - 2:00 PM", slotKey: "noon", price: 500, seatsUsed: 0 },
  { id: "batch_c", name: "C Batch", time: "2:00 PM - 6:00 PM", slotKey: "afternoon", price: 500, seatsUsed: 0 },
  { id: "batch_d", name: "D Batch", time: "6:00 PM - 10:00 PM", slotKey: "evening", price: 500, seatsUsed: 0 },
  { id: "batch_all", name: "All Batch", time: "6:00 AM - 10:00 PM", slotKey: "all", price: 1500, seatsUsed: 0 },
];

/**
 * Seed default 5 batches in Firestore
 */
export const seedDefaultBatchesInFirestore = async () => {
  try {
    for (const batch of DEFAULT_BATCHES) {
      const docRef = doc(db, BATCHES_COLLECTION, batch.id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        await setDoc(docRef, batch);
      }
    }
  } catch (error) {
    console.error("Error seeding default batches:", error);
  }
};

/**
 * Realtime Subscription for Batches
 */
export const subscribeBatches = (callback) => {
  const colRef = collection(db, BATCHES_COLLECTION);
  return onSnapshot(colRef, (snapshot) => {
    if (snapshot.empty) {
      seedDefaultBatchesInFirestore().then(() => callback(DEFAULT_BATCHES));
    } else {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    }
  }, (err) => {
    console.error("Batches subscription error:", err);
    callback(DEFAULT_BATCHES);
  });
};

/**
 * Fetch all batches
 */
export const getBatchesFromFirestore = async () => {
  try {
    const colRef = collection(db, BATCHES_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) {
      await seedDefaultBatchesInFirestore();
      return DEFAULT_BATCHES;
    }
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching batches:", error);
    return DEFAULT_BATCHES;
  }
};

/**
 * Save / Update a batch in Firestore
 */
export const saveBatchInFirestore = async (batchData) => {
  try {
    const docId = batchData.id || `batch_${Date.now()}`;
    const docRef = doc(db, BATCHES_COLLECTION, docId);
    await setDoc(docRef, { ...batchData, id: docId }, { merge: true });
    return { id: docId, ...batchData };
  } catch (error) {
    console.error("Error saving batch in Firestore:", error);
    throw error;
  }
};

/**
 * Delete a batch from Firestore
 */
export const deleteBatchFromFirestore = async (batchId) => {
  try {
    const docRef = doc(db, BATCHES_COLLECTION, batchId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting batch from Firestore:", error);
    throw error;
  }
};
