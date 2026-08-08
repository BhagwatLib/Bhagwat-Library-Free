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
  {
    id: "batch_a",
    name: "A Shift",
    time: "6:00 AM - 10:00 AM",
    duration: "4 Hours",
    slotKey: "a",
    price: 500,
    status: "Active",
    description: "A Shift study hours (6:00 AM - 10:00 AM)",
  },
  {
    id: "batch_b",
    name: "B Shift",
    time: "10:00 AM - 2:00 PM",
    duration: "4 Hours",
    slotKey: "b",
    price: 500,
    status: "Active",
    description: "B Shift study hours (10:00 AM - 2:00 PM)",
  },
  {
    id: "batch_c",
    name: "C Shift",
    time: "2:00 PM - 6:00 PM",
    duration: "4 Hours",
    slotKey: "c",
    price: 500,
    status: "Active",
    description: "C Shift study hours (2:00 PM - 6:00 PM)",
  },
  {
    id: "batch_d",
    name: "D Shift",
    time: "6:00 PM - 10:00 PM",
    duration: "4 Hours",
    slotKey: "d",
    price: 500,
    status: "Active",
    description: "D Shift study hours (6:00 PM - 10:00 PM)",
  },
  {
    id: "batch_all",
    name: "All Shift",
    time: "6:00 AM - 10:00 PM",
    duration: "16 Hours (Full Day)",
    slotKey: "all",
    price: 1500,
    status: "Active",
    description: "All Shift full day dedicated seat access (6:00 AM - 10:00 PM)",
  },
];



/**
 * Seed default batches in Firestore if collection is empty
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
 * Realtime Subscription for Batches - Universal Data Source
 */
export const subscribeBatches = (callback) => {
  const colRef = collection(db, BATCHES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedDefaultBatchesInFirestore().then(() => callback(DEFAULT_BATCHES));
      } else {
        const list = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.time || "Batch",
            time: data.time || "",
            price: Number(data.price) || 0,
            duration: data.duration || "4 Hours",
            description: data.description || "",
            status: data.status || "Active",
            slotKey: data.slotKey || "custom",
            ...data,
          };
        });
        callback(list);
      }
    },
    (err) => {
      console.error("Batches subscription error:", err);
      callback(DEFAULT_BATCHES);
    }
  );
};

/**
 * Fetch all batches once
 */
export const getBatchesFromFirestore = async () => {
  try {
    const colRef = collection(db, BATCHES_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) {
      await seedDefaultBatchesInFirestore();
      return DEFAULT_BATCHES;
    }
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || data.time || "Batch",
        time: data.time || "",
        price: Number(data.price) || 0,
        duration: data.duration || "4 Hours",
        description: data.description || "",
        status: data.status || "Active",
        slotKey: data.slotKey || "custom",
        ...data,
      };
    });
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
    const cleanData = {
      ...batchData,
      id: docId,
      name: batchData.name || batchData.time,
      time: batchData.time || "",
      price: Number(batchData.price) || 0,
      duration: batchData.duration || "4 Hours",
      description: batchData.description || "",
      status: batchData.status || "Active",
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, cleanData, { merge: true });
    return cleanData;
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

