import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC5fArryIKcHVCKicnBTDlxu1WEsV9bhR0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "bhagwat-library.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "bhagwat-library",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "bhagwat-library.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "291783673347",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:291783673347:web:d54fe00bffffe898847036",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-28BKB92540"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Analytics support check
export let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
}).catch((err) => {
  console.warn("Analytics not supported in this environment:", err);
});

export default app;
