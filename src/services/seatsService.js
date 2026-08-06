import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "seats";
const seatsRef = collection(db, COLLECTION_NAME);

export const BASE_SLOTS = [
  { id: "morning", name: "Morning", time: "6AM-10AM" },
  { id: "noon", name: "Noon", time: "10AM-2PM" },
  { id: "afternoon", name: "Afternoon", time: "2PM-6PM" },
  { id: "evening", name: "Evening", time: "6PM-10PM" },
];

/**
 * Maps combined virtual batches to base slot IDs
 */
export const getSlotsFromBatchInput = (batchInput) => {
  if (!batchInput) return [];
  const batches = Array.isArray(batchInput) ? batchInput : [batchInput];
  const slotsSet = new Set();

  batches.forEach((b) => {
    if (!b) return;
    const str = b.toString().toLowerCase().replace(/\s+/g, "");

    if (str.includes("allshift") || str.includes("all")) {
      slotsSet.add("morning");
      slotsSet.add("noon");
      slotsSet.add("afternoon");
      slotsSet.add("evening");
    } else if (str.includes("6am-2pm") || str.includes("6:00am-2:00pm") || str.includes("6amto2pm")) {
      slotsSet.add("morning");
      slotsSet.add("noon");
    } else if (str.includes("10am-6pm") || str.includes("10:00am-6:00pm") || str.includes("10amto6pm")) {
      slotsSet.add("noon");
      slotsSet.add("afternoon");
    } else if (str.includes("2pm-10pm") || str.includes("2:00pm-10:00pm") || str.includes("2pmto10pm")) {
      slotsSet.add("afternoon");
      slotsSet.add("evening");
    } else if (str.includes("6am-10am") || str.includes("6:00am-10:00am") || str.includes("morning")) {
      slotsSet.add("morning");
    } else if (str.includes("10am-2pm") || str.includes("10:00am-2:00pm") || str.includes("noon")) {
      slotsSet.add("noon");
    } else if (str.includes("2pm-6pm") || str.includes("2:00pm-6:00pm") || str.includes("afternoon")) {
      slotsSet.add("afternoon");
    } else if (str.includes("6pm-10pm") || str.includes("6:00pm-10:00pm") || str.includes("evening")) {
      slotsSet.add("evening");
    } else {
      if (str.includes("6am")) slotsSet.add("morning");
      if (str.includes("10am")) slotsSet.add("noon");
      if (str.includes("2pm")) slotsSet.add("afternoon");
      if (str.includes("6pm")) slotsSet.add("evening");
    }
  });

  return Array.from(slotsSet);
};

/**
 * Initializes 100 seat documents (IDs 1..100) in Firestore if not present
 */
export const initializeSeatsInFirestore = async () => {
  try {
    const doc1Ref = doc(db, COLLECTION_NAME, "1");
    const doc1Snap = await getDoc(doc1Ref);

    if (!doc1Snap.exists()) {
      console.log("Seeding 100 seat documents in Firestore...");
      const promises = [];
      for (let i = 1; i <= 100; i++) {
        const seatDocRef = doc(db, COLLECTION_NAME, String(i));
        promises.push(
          setDoc(seatDocRef, {
            seatNumber: i,
            slots: {
              morning: null,
              noon: null,
              afternoon: null,
              evening: null,
            },
          })
        );
      }
      await Promise.all(promises);
      console.log("Successfully initialized 100 seat documents.");
    }
  } catch (error) {
    console.error("Error initializing seats in Firestore:", error);
  }
};

/**
 * Fetch all 100 seats from Firestore
 */
export const getSeatsFromFirestore = async () => {
  try {
    await initializeSeatsInFirestore();
    const snapshot = await getDocs(seatsRef);
    const seats = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    return seats.sort((a, b) => Number(a.seatNumber) - Number(b.seatNumber));
  } catch (error) {
    console.error("Error fetching seats from Firestore:", error);
    return [];
  }
};

/**
 * Realtime listener for 100 seats
 */
export const subscribeSeats = (callback) => {
  try {
    return onSnapshot(seatsRef, (snapshot) => {
      const seats = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      callback(seats.sort((a, b) => Number(a.seatNumber) - Number(b.seatNumber)));
    });
  } catch (err) {
    console.error("Error subscribing to seats:", err);
    return () => {};
  }
};

/**
 * Conflict check helper
 */
export const checkSeatSlotConflict = async (seatNumber, targetBatchInput, studentId) => {
  if (!seatNumber || seatNumber <= 0) return { conflict: false };
  const targetSlots = getSlotsFromBatchInput(targetBatchInput);
  if (targetSlots.length === 0) return { conflict: false };

  try {
    const seatDocRef = doc(db, COLLECTION_NAME, String(seatNumber));
    const docSnap = await getDoc(seatDocRef);
    if (!docSnap.exists()) return { conflict: false };

    const seatData = docSnap.data();
    const currentSlots = seatData.slots || {};

    for (const slotKey of targetSlots) {
      const slotVal = currentSlots[slotKey];
      if (slotVal && slotVal.studentId && slotVal.studentId !== studentId) {
        return {
          conflict: true,
          conflictingSlot: slotKey,
          message: "This seat is already occupied in selected slot.",
        };
      }
    }
    return { conflict: false };
  } catch (err) {
    console.error("Error checking seat conflict:", err);
    return { conflict: false };
  }
};

/**
 * Assign or update student slots on a seat
 */
export const assignStudentSlotsInSeat = async (seatNumber, studentData) => {
  if (!seatNumber || seatNumber <= 0) return;
  const targetSlots = getSlotsFromBatchInput(studentData.batch);
  
  try {
    const seatDocRef = doc(db, COLLECTION_NAME, String(seatNumber));
    const docSnap = await getDoc(seatDocRef);
    
    let currentSlots = docSnap.exists()
      ? docSnap.data().slots || { morning: null, noon: null, afternoon: null, evening: null }
      : { morning: null, noon: null, afternoon: null, evening: null };

    // Clear previous occurrences of this student on this seat
    Object.keys(currentSlots).forEach((k) => {
      if (currentSlots[k]?.studentId === studentData.id) {
        currentSlots[k] = null;
      }
    });

    // Set new slots
    const studentInfo = {
      studentId: studentData.id,
      name: studentData.name,
      phone: studentData.phone,
      status: studentData.status || "Paid",
      validityTo: studentData.validityTo || studentData.validityEnd || "",
    };

    targetSlots.forEach((slotKey) => {
      currentSlots[slotKey] = studentInfo;
    });

    await setDoc(seatDocRef, {
      seatNumber: Number(seatNumber),
      slots: currentSlots,
    }, { merge: true });
  } catch (error) {
    console.error("Error assigning student slots in seat:", error);
  }
};
