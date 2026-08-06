import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

const COLLECTION_NAME = "students";
const studentsRef = collection(db, COLLECTION_NAME);

/**
 * Fetch all students once
 */
export const getStudentsFromFirestore = async () => {
  try {
    const q = query(studentsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Error fetching students from Firestore:", error);
    return [];
  }
};

/**
 * Realtime listener for students collection
 */
export const subscribeStudents = (callback) => {
  try {
    const q = query(studentsRef, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const students = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        callback(students);
      },
      (error) => {
        console.error("Error subscribing to students:", error);
      }
    );
  } catch (err) {
    console.error("Failed to set up student subscription:", err);
    return () => {};
  }
};

/**
 * Add new student
 */
export const addStudentToFirestore = async (studentData) => {
  try {
    const batchArr = Array.isArray(studentData.batch)
      ? studentData.batch
      : studentData.batch
      ? [studentData.batch]
      : [];

    const docData = {
      name: studentData.name || "",
      phone: studentData.phone || "",
      email: studentData.email || "",
      photo: studentData.photo || "",
      address: studentData.address || "",
      admissionDate: studentData.admissionDate || new Date().toISOString().split("T")[0],
      seatNumber: Number(studentData.seatNumber) || 0,
      activeSlots: studentData.activeSlots || [],
      batchIds: studentData.batchIds || [],
      batch: batchArr,
      paymentStatus: studentData.status || studentData.paymentStatus || "Unpaid",
      status: studentData.status || "Unpaid",
      totalAmount: Number(studentData.totalAmount) || 0,
      paidAmount: Number(studentData.paidAmount) || 0,
      validityFrom: studentData.validityFrom || studentData.validityStart || "",
      validityTo: studentData.validityTo || studentData.validityEnd || "",
      validityStart: studentData.validityFrom || studentData.validityStart || "",
      validityEnd: studentData.validityTo || studentData.validityEnd || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(studentsRef, docData);
    return { id: docRef.id, ...docData };
  } catch (error) {
    console.error("Error adding student to Firestore:", error);
    throw error;
  }
};

/**
 * Update student by ID
 */
export const updateStudentInFirestore = async (id, studentData) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);

    const updates = {
      ...studentData,
      updatedAt: serverTimestamp(),
    };

    if (studentData.batch) {
      updates.batch = Array.isArray(studentData.batch)
        ? studentData.batch
        : [studentData.batch];
    }
    if (studentData.seatNumber !== undefined) {
      updates.seatNumber = Number(studentData.seatNumber);
    }
    if (studentData.totalAmount !== undefined) {
      updates.totalAmount = Number(studentData.totalAmount);
    }
    if (studentData.paidAmount !== undefined) {
      updates.paidAmount = Number(studentData.paidAmount);
    }
    if (studentData.status) {
      updates.status = studentData.status;
      updates.paymentStatus = studentData.status;
    }
    if (studentData.validityFrom) {
      updates.validityFrom = studentData.validityFrom;
      updates.validityStart = studentData.validityFrom;
    }
    if (studentData.validityTo) {
      updates.validityTo = studentData.validityTo;
      updates.validityEnd = studentData.validityTo;
    }

    // Remove client-side id before updating
    delete updates.id;

    await updateDoc(docRef, updates);
    return { id, ...studentData };
  } catch (error) {
    console.error("Error updating student in Firestore:", error);
    throw error;
  }
};

/**
 * Delete student by ID
 */
export const deleteStudentFromFirestore = async (id) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error("Error deleting student from Firestore:", error);
    throw error;
  }
};
