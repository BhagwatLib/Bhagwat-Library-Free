import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "settings";
const DOC_ID = "general";

const DEFAULT_SETTINGS = {
  libraryName: "Bhagwat Library",
  totalSeats: 100,
  openingTime: "06:00 AM",
  closingTime: "10:00 PM",
  theme: "Dark SaaS",
};

/**
 * Fetch settings document
 */
export const getSettingsFromFirestore = async () => {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    } else {
      await setDoc(docRef, DEFAULT_SETTINGS);
      return { id: DOC_ID, ...DEFAULT_SETTINGS };
    }
  } catch (error) {
    console.error("Error fetching settings from Firestore:", error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * Subscribe to settings document
 */
export const subscribeSettings = (callback) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() });
      } else {
        callback(DEFAULT_SETTINGS);
      }
    });
  } catch (err) {
    console.error("Error subscribing to settings:", err);
    return () => {};
  }
};

/**
 * Update settings document
 */
export const saveSettingsToFirestore = async (settingsData) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID);
    await setDoc(docRef, settingsData, { merge: true });
    return { id: DOC_ID, ...settingsData };
  } catch (error) {
    console.error("Error saving settings in Firestore:", error);
    throw error;
  }
};
