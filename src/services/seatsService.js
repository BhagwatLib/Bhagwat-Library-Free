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
const STUDENTS_COLLECTION = "students";
const seatsRef = collection(db, COLLECTION_NAME);

export const BASE_SLOTS = [
  { id: "morning", slotCode: "A", name: "A Batch", time: "6:00 AM - 10:00 AM" },
  { id: "noon", slotCode: "B", name: "B Batch", time: "10:00 AM - 2:00 PM" },
  { id: "afternoon", slotCode: "C", name: "C Batch", time: "2:00 PM - 6:00 PM" },
  { id: "evening", slotCode: "D", name: "D Batch", time: "6:00 PM - 10:00 PM" },
];

/**
 * Normalizes any batch input string/array into slot IDs ("morning", "noon", "afternoon", "evening")
 */
export const getSlotsFromBatchInput = (batchInput) => {
  if (!batchInput) return [];
  const batches = Array.isArray(batchInput) ? batchInput : [batchInput];
  const slotsSet = new Set();

  batches.forEach((b) => {
    if (!b) return;
    const str = b.toString().toLowerCase().replace(/\s+/g, "");

    if (str.includes("allbatch") || str.includes("allshift") || str.includes("6:00am-10:00pm") || str.includes("6am-10pm") || str === "all") {
      slotsSet.add("morning");
      slotsSet.add("noon");
      slotsSet.add("afternoon");
      slotsSet.add("evening");
    } else if (str.includes("abatch") || str.includes("6:00am-10:00am") || str.includes("6am-10am") || str === "a") {
      slotsSet.add("morning");
    } else if (str.includes("bbatch") || str.includes("10:00am-2:00pm") || str.includes("10am-2pm") || str === "b") {
      slotsSet.add("noon");
    } else if (str.includes("cbatch") || str.includes("2:00pm-6:00pm") || str.includes("2pm-6pm") || str === "c") {
      slotsSet.add("afternoon");
    } else if (str.includes("dbatch") || str.includes("6:00pm-10:00pm") || str.includes("6pm-10pm") || str === "d") {
      slotsSet.add("evening");
    } else {
      if (str.includes("morning") || str.includes("6am")) slotsSet.add("morning");
      if (str.includes("noon") || str.includes("10am")) slotsSet.add("noon");
      if (str.includes("afternoon") || str.includes("2pm")) slotsSet.add("afternoon");
      if (str.includes("evening") || str.includes("6pm")) slotsSet.add("evening");
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
 * Automatic Sync/Migration: Reads all existing students in Firestore and populates seat documents
 */
export const syncExistingStudentsToSeats = async () => {
  try {
    const studentsSnap = await getDocs(collection(db, STUDENTS_COLLECTION));
    if (studentsSnap.empty) return;

    const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Group students by seatNumber
    const seatMap = {};
    for (let i = 1; i <= 100; i++) {
      seatMap[i] = {
        morning: null,
        noon: null,
        afternoon: null,
        evening: null,
      };
    }

    students.forEach((student) => {
      const seatNum = Number(student.seatNumber);
      if (seatNum > 0 && seatNum <= 100) {
        const targetSlots = getSlotsFromBatchInput(student.batch);
        const studentInfo = {
          studentId: student.id,
          name: student.name || "",
          phone: student.phone || "",
          batch: Array.isArray(student.batch) ? student.batch.join(", ") : String(student.batch || ""),
          status: student.status || "Paid",
          validityTo: student.validityTo || student.validityEnd || "",
        };

        targetSlots.forEach((slotKey) => {
          if (seatMap[seatNum]) {
            seatMap[seatNum][slotKey] = studentInfo;
          }
        });
      }
    });

    // Write grouped seat data to Firestore seats collection
    const promises = [];
    for (let i = 1; i <= 100; i++) {
      const seatDocRef = doc(db, COLLECTION_NAME, String(i));
      promises.push(
        setDoc(seatDocRef, {
          seatNumber: i,
          slots: seatMap[i],
        }, { merge: true })
      );
    }
    await Promise.all(promises);
    console.log("Firestore seats auto-sync completed for all existing students.");
  } catch (error) {
    console.error("Error syncing existing students to seats:", error);
  }
};

/**
 * Fetch all 100 seats from Firestore with automatic student sync
 */
export const getSeatsFromFirestore = async () => {
  try {
    await initializeSeatsInFirestore();
    await syncExistingStudentsToSeats();
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
    initializeSeatsInFirestore();
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
        const slotObj = BASE_SLOTS.find((s) => s.id === slotKey);
        const batchName = slotObj ? slotObj.name : slotKey;
        return {
          conflict: true,
          conflictingSlot: batchName,
          conflictingStudent: slotVal.name,
          message: `Seat ${seatNumber} is occupied in ${batchName} by ${slotVal.name}.`,
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
 * Releases a student from a seat (clears all slots occupied by studentId)
 */
export const releaseStudentFromSeat = async (seatNumber, studentId) => {
  if (!seatNumber || seatNumber <= 0 || !studentId) return;

  try {
    const seatDocRef = doc(db, COLLECTION_NAME, String(seatNumber));
    const docSnap = await getDoc(seatDocRef);

    if (docSnap.exists()) {
      const currentSlots = docSnap.data().slots || { morning: null, noon: null, afternoon: null, evening: null };
      let changed = false;

      Object.keys(currentSlots).forEach((k) => {
        if (currentSlots[k]?.studentId === studentId) {
          currentSlots[k] = null;
          changed = true;
        }
      });

      if (changed) {
        await setDoc(seatDocRef, { slots: currentSlots }, { merge: true });
      }
    }
  } catch (error) {
    console.error("Error releasing student from seat:", error);
  }
};

/**
 * Assigns or updates student slots on a seat
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
      batch: Array.isArray(studentData.batch) ? studentData.batch.join(", ") : String(studentData.batch || ""),
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
