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

const COLLECTION_NAME = "seats";
const STUDENTS_COLLECTION = "students";
const seatsRef = collection(db, COLLECTION_NAME);

export const BASE_SLOTS = [
  { id: "a", slotCode: "A", name: "A Batch", time: "6:00 AM - 10:00 AM" },
  { id: "b", slotCode: "B", name: "B Batch", time: "10:00 AM - 2:00 PM" },
  { id: "c", slotCode: "C", name: "C Batch", time: "2:00 PM - 6:00 PM" },
  { id: "d", slotCode: "D", name: "D Batch", time: "6:00 PM - 10:00 PM" },
];

/**
 * Maps batch inputs into strict slot codes ("a", "b", "c", "d")
 */
export const getSlotsFromBatchInput = (batchInput) => {
  if (!batchInput) return [];
  const batches = Array.isArray(batchInput) ? batchInput : [batchInput];
  const slotsSet = new Set();

  batches.forEach((b) => {
    if (!b) return;
    const str = b.toString().toUpperCase().trim();

    if (str.includes("ALL") || str.includes("6:00 AM - 10:00 PM") || str.includes("6AM-10PM")) {
      slotsSet.add("a");
      slotsSet.add("b");
      slotsSet.add("c");
      slotsSet.add("d");
    } else if (str === "A" || str.includes("A BATCH") || str.includes("6:00 AM - 10:00 AM") || str.includes("6AM-10AM") || str.includes("MORNING")) {
      slotsSet.add("a");
    } else if (str === "B" || str.includes("B BATCH") || str.includes("10:00 AM - 2:00 PM") || str.includes("10AM-2PM") || str.includes("NOON")) {
      slotsSet.add("b");
    } else if (str === "C" || str.includes("C BATCH") || str.includes("2:00 PM - 6:00 PM") || str.includes("2PM-6PM") || str.includes("AFTERNOON")) {
      slotsSet.add("c");
    } else if (str === "D" || str.includes("D BATCH") || str.includes("6:00 PM - 10:00 PM") || str.includes("6PM-10PM") || str.includes("EVENING")) {
      slotsSet.add("d");
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
              a: null,
              b: null,
              c: null,
              d: null,
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
 * Clean legacy names in Student Documents and Seat Documents in Firestore.
 * Migrates existing data automatically.
 */
export const syncExistingStudentsToSeats = async () => {
  try {
    const studentsSnap = await getDocs(collection(db, STUDENTS_COLLECTION));
    if (studentsSnap.empty) return;

    const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const seatMap = {};
    for (let i = 1; i <= 100; i++) {
      seatMap[i] = {
        a: null,
        b: null,
        c: null,
        d: null,
      };
    }

    for (const student of students) {
      // Map batch string/array to normalized codes "A", "B", "C", "D"
      const targetSlots = getSlotsFromBatchInput(student.batch);
      const cleanBatches = targetSlots.map((sCode) => sCode.toUpperCase() + " Batch");

      // Update student batch list in Firestore if it contains old labels
      const hasOldLabels = Array.isArray(student.batch)
        ? student.batch.some((b) => /morning|noon|afternoon|evening/i.test(String(b)))
        : /morning|noon|afternoon|evening/i.test(String(student.batch || ""));

      if (hasOldLabels) {
        const studentDocRef = doc(db, STUDENTS_COLLECTION, student.id);
        await updateDoc(studentDocRef, {
          batch: cleanBatches,
        });
      }

      const seatNum = Number(student.seatNumber);
      if (seatNum > 0 && seatNum <= 100) {
        const studentInfo = {
          studentId: student.id,
          name: student.name || "",
          phone: student.phone || "",
          batch: cleanBatches.join(", "),
          status: student.status || "Paid",
          validityTo: student.validityTo || student.validityEnd || "",
        };

        targetSlots.forEach((slotKey) => {
          if (seatMap[seatNum]) {
            seatMap[seatNum][slotKey] = studentInfo;
          }
        });
      }
    }

    // Write all seat allocations back to Firestore
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
    console.log("Firestore A, B, C, D batch slot migration complete.");
  } catch (error) {
    console.error("Error during Firestore migration:", error);
  }
};

/**
 * Fetch all 100 seats from Firestore with automatic sync
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
        const batchName = slotObj ? slotObj.name : slotKey.toUpperCase() + " Batch";
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
      const currentSlots = docSnap.data().slots || { a: null, b: null, c: null, d: null };
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
      ? docSnap.data().slots || { a: null, b: null, c: null, d: null }
      : { a: null, b: null, c: null, d: null };

    // Clear previous occurrences of this student on this seat
    Object.keys(currentSlots).forEach((k) => {
      if (currentSlots[k]?.studentId === studentData.id) {
        currentSlots[k] = null;
      }
    });

    const cleanBatches = targetSlots.map((sCode) => sCode.toUpperCase() + " Batch");

    // Set new slots
    const studentInfo = {
      studentId: studentData.id,
      name: studentData.name,
      phone: studentData.phone,
      batch: cleanBatches.join(", "),
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
