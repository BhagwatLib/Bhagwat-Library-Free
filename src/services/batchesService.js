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
 * Normalizes batch data and converts any legacy names to ABCD Shift
 */
export const normalizeBatchData = (dId, data) => {
  let name = data.name || data.time || "Batch";
  let slotKey = data.slotKey || "custom";
  const time = data.time || "";
  const nameLower = name.toLowerCase().trim();

  // Detect and migrate old names
  if (nameLower.includes("morning") || time.includes("6:00 AM - 10:00 AM") || dId === "batch_a") {
    name = "A Shift";
    slotKey = "a";
  } else if (nameLower.includes("noon") || time.includes("10:00 AM - 2:00 PM") || dId === "batch_b") {
    name = "B Shift";
    slotKey = "b";
  } else if (nameLower.includes("afternoon") || time.includes("2:00 PM - 6:00 PM") || dId === "batch_c") {
    name = "C Shift";
    slotKey = "c";
  } else if (nameLower.includes("evening") || time.includes("6:00 PM - 10:00 PM") || dId === "batch_d") {
    name = "D Shift";
    slotKey = "d";
  } else if (nameLower.includes("all") || time.includes("6:00 AM - 10:00 PM") || dId === "batch_all") {
    name = "All Shift";
    slotKey = "all";
  }

  const needsFirestoreUpdate =
    data.name !== name ||
    data.slotKey !== slotKey ||
    /morning|noon|afternoon|evening/i.test(data.name || "");

  return {
    item: {
      id: dId,
      name,
      time,
      price: Number(data.price) || 0,
      duration: data.duration || "4 Hours",
      description: data.description || "",
      status: data.status || "Active",
      slotKey,
      ...data,
      name, // Enforce normalized name
      slotKey,
    },
    needsFirestoreUpdate,
  };
};

const sortOrder = { a: 1, b: 2, c: 3, d: 4, all: 5 };
const sortBatches = (list) => {
  return [...list].sort((x, y) => {
    const ox = sortOrder[x.slotKey] || 99;
    const oy = sortOrder[y.slotKey] || 99;
    if (ox !== oy) return ox - oy;
    return x.name.localeCompare(y.name);
  });
};

/**
 * Seed default batches in Firestore if collection is empty or reset
 */
export const seedDefaultBatchesInFirestore = async () => {
  try {
    for (const batch of DEFAULT_BATCHES) {
      const docRef = doc(db, BATCHES_COLLECTION, batch.id);
      await setDoc(docRef, batch, { merge: true });
    }
  } catch (error) {
    console.error("Error seeding default batches:", error);
  }
};

/**
 * Force reset all batches in Firestore to standard ABCD Shifts
 */
export const resetToDefaultABCDShifts = async () => {
  try {
    for (const batch of DEFAULT_BATCHES) {
      const docRef = doc(db, BATCHES_COLLECTION, batch.id);
      await setDoc(docRef, batch);
    }
    return true;
  } catch (error) {
    console.error("Error resetting batches:", error);
    throw error;
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
        const list = [];
        snapshot.docs.forEach((d) => {
          const { item, needsFirestoreUpdate } = normalizeBatchData(d.id, d.data());
          list.push(item);

          // Permanently fix and update Firestore if old names exist
          if (needsFirestoreUpdate) {
            setDoc(doc(db, BATCHES_COLLECTION, d.id), item, { merge: true }).catch((e) =>
              console.error("Migration error for batch:", e)
            );
          }
        });
        callback(sortBatches(list));
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
    const list = [];
    snap.docs.forEach((d) => {
      const { item, needsFirestoreUpdate } = normalizeBatchData(d.id, d.data());
      list.push(item);
      if (needsFirestoreUpdate) {
        setDoc(doc(db, BATCHES_COLLECTION, d.id), item, { merge: true }).catch(() => {});
      }
    });
    return sortBatches(list);
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

