import {
  getStudentsFromFirestore,
  addStudentToFirestore,
  updateStudentInFirestore,
  deleteStudentFromFirestore,
} from "../services/studentsService";
import {
  getBatchesFromFirestore,
  saveBatchInFirestore,
  deleteBatchFromFirestore,
} from "../services/batchesService";
import {
  getPaymentsFromFirestore,
  recordPaymentInFirestore,
} from "../services/paymentsService";
import {
  assignStudentSlotsInSeat,
  releaseStudentFromSeat,
  getSeatsFromFirestore,
  syncExistingStudentsToSeats,
  getSlotsFromBatchInput,
  BASE_SLOTS,
} from "../services/seatsService";
import { doc, getDoc, writeBatch, collection } from "firebase/firestore";
import { db } from "../firebase/firebase";

// Trigger automatic seat sync on app startup
syncExistingStudentsToSeats();

// --- Dashboard Stats ---

export const getDashboardStats = async () => {
  try {
    const students = await getStudentsFromFirestore();

    let paidStudents = 0;
    let unpaidStudents = 0;
    let partialStudents = 0;
    let totalRevenue = 0;

    students.forEach((s) => {
      const paid = Number(s.paidAmount) || 0;
      const total = Number(s.totalAmount) || 0;
      totalRevenue += paid;

      const status =
        s.status ||
        (paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid");

      if (status === "Paid") paidStudents++;
      else if (status === "Partial") partialStudents++;
      else unpaidStudents++;
    });

    const recentStudents = students.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      batch: Array.isArray(s.batch) ? s.batch.join(", ") : s.batch,
      status: s.status || "Unpaid",
      createdAt: s.createdAt,
    }));

    return {
      stats: {
        totalStudents: students.length,
        paidStudents,
        unpaidStudents,
        partialStudents,
        totalRevenue,
      },
      recentStudents,
    };
  } catch (err) {
    console.error("Error in getDashboardStats:", err);
    return {
      stats: {
        totalStudents: 0,
        paidStudents: 0,
        unpaidStudents: 0,
        partialStudents: 0,
        totalRevenue: 0,
      },
      recentStudents: [],
    };
  }
};

// --- Payments ---

export const getPayments = async (status = "All") => {
  try {
    const students = await getStudentsFromFirestore();
    if (status && status !== "All") {
      return students.filter((s) => s.status === status);
    }
    return students;
  } catch (err) {
    console.error("Error in getPayments:", err);
    return [];
  }
};

// --- Batches ---

export const getBatches = async () => {
  try {
    return await getBatchesFromFirestore();
  } catch (err) {
    console.error("Error in getBatches:", err);
    return [];
  }
};

export const saveBatch = async (batch) => {
  try {
    return await saveBatchInFirestore(batch);
  } catch (err) {
    console.error("Error in saveBatch:", err);
    return null;
  }
};

export const deleteBatch = async (id) => {
  try {
    await deleteBatchFromFirestore(id);
  } catch (err) {
    console.error("Error in deleteBatch:", err);
  }
};

// --- Students ---

export const getStudents = async () => {
  try {
    return await getStudentsFromFirestore();
  } catch (err) {
    console.error("Error in getStudents:", err);
    return [];
  }
};

export const saveStudent = async (student) => {
  const newSeatNumber = Number(student.seatNumber) || 0;
  const targetSlots = getSlotsFromBatchInput(student.batch || student.assignedBatches);
  const assignedBatches = targetSlots.map((s) => s.toUpperCase()); // ["A", "B", "C", "D"]
  const cleanBatches = assignedBatches.map((c) => `${c} Batch`);

  try {
    const studentId = student.id || doc(collection(db, "students")).id;
    const studentDocRef = doc(db, "students", studentId);

    let oldSeatNumber = 0;
    if (student.id) {
      const snap = await getDoc(studentDocRef);
      if (snap.exists()) {
        oldSeatNumber = Number(snap.data().seatNumber) || 0;
      }
    }

    // 1. Validation before saving using getDoc()
    if (newSeatNumber > 0) {
      const seatDocRef = doc(db, "seats", String(newSeatNumber));
      const seatSnap = await getDoc(seatDocRef);

      if (seatSnap.exists()) {
        const seatData = seatSnap.data();
        const currentSlots = seatData.slots || { a: null, b: null, c: null, d: null };

        const occupiedSlotVals = Object.keys(currentSlots)
          .map((k) => currentSlots[k])
          .filter((val) => val && val.studentId && val.studentId !== studentId);

        // Rule 1: Check if seat is fully occupied by an All Batch student
        const isFullyOccupiedByAllBatch =
          Object.keys(currentSlots).every((k) => {
            const val = currentSlots[k];
            return val && val.studentId && val.studentId !== studentId;
          }) &&
          occupiedSlotVals.length > 0 &&
          new Set(occupiedSlotVals.map((v) => v.studentId)).size === 1;

        if (isFullyOccupiedByAllBatch) {
          throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} is fully occupied by an All Batch student.`);
        }

        // Rule 2 & 3: If new student requests All Batch (all 4 slots), seat must be 100% vacant
        const isNewStudentAllBatch = targetSlots.length === 4;
        if (isNewStudentAllBatch && occupiedSlotVals.length > 0) {
          throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} has existing slot assignments. All Batch requires a fully vacant seat.`);
        }

        // Rule 4: Slot overlap check
        for (const slotKey of targetSlots) {
          const slotVal = currentSlots[slotKey];
          if (slotVal && slotVal.studentId && slotVal.studentId !== studentId) {
            const slotObj = BASE_SLOTS.find((s) => s.id === slotKey);
            const batchName = slotObj ? slotObj.name : `${slotKey.toUpperCase()} Batch`;
            throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} is already occupied in ${batchName} by ${slotVal.name}.`);
          }
        }
      }
    }

    // 2. Atomic Update using writeBatch()
    const batch = writeBatch(db);

    const studentData = {
      ...student,
      id: studentId,
      seatNumber: newSeatNumber,
      assignedBatches: assignedBatches, // Stores ["A", "B", "C", "D"] - NEVER "All Batch"
      batch: cleanBatches,
      paidAmount: Number(student.paidAmount || 0),
      totalAmount: Number(student.totalAmount || 0),
      updatedAt: new Date().toISOString(),
    };
    if (!student.id) {
      studentData.createdAt = new Date().toISOString();
    }

    batch.set(studentDocRef, studentData, { merge: true });

    // Release old seat slots if changed
    if (student.id && oldSeatNumber > 0 && oldSeatNumber !== newSeatNumber) {
      const oldSeatDocRef = doc(db, "seats", String(oldSeatNumber));
      const oldSeatSnap = await getDoc(oldSeatDocRef);
      if (oldSeatSnap.exists()) {
        const oldSlots = oldSeatSnap.data().slots || { a: null, b: null, c: null, d: null };
        let changed = false;
        Object.keys(oldSlots).forEach((k) => {
          if (oldSlots[k]?.studentId === studentId) {
            oldSlots[k] = null;
            changed = true;
          }
        });
        if (changed) {
          batch.set(oldSeatDocRef, { slots: oldSlots }, { merge: true });
        }
      }
    }

    // Update new seat slots
    if (newSeatNumber > 0) {
      const seatDocRef = doc(db, "seats", String(newSeatNumber));
      const seatSnap = await getDoc(seatDocRef);

      let currentSlots = { a: null, b: null, c: null, d: null };
      if (seatSnap.exists()) {
        currentSlots = seatSnap.data().slots || { a: null, b: null, c: null, d: null };
      }

      Object.keys(currentSlots).forEach((k) => {
        if (currentSlots[k]?.studentId === studentId) {
          currentSlots[k] = null;
        }
      });

      const studentInfo = {
        studentId: studentId,
        name: studentData.name,
        phone: studentData.phone,
        batch: cleanBatches.join(", "),
        status: studentData.status || "Paid",
        validityTo: studentData.validityTo || "",
      };

      targetSlots.forEach((slotKey) => {
        currentSlots[slotKey] = studentInfo;
      });

      batch.set(
        seatDocRef,
        {
          seatNumber: Number(newSeatNumber),
          slots: currentSlots,
        },
        { merge: true }
      );
    }

    // Record payment update atomically if amount > 0
    if (Number(student.paidAmount) > 0) {
      const paymentLogRef = doc(collection(db, "payments"));
      batch.set(paymentLogRef, {
        studentId: studentId,
        studentName: studentData.name,
        amount: Number(student.paidAmount),
        status: studentData.status || "Paid",
        method: "Cash / Online",
        date: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
      });
    }

    // Commit all updates atomically
    await batch.commit();

    return studentData;
  } catch (err) {
    console.error("Error in saveStudent batch commit:", err);
    if (err.message && err.message.startsWith("SEAT_CONFLICT:")) {
      alert(err.message.substring(14));
    } else {
      alert(`Failed to save student details: ${err.message || err}`);
    }
    throw err;
  }
};

export const deleteStudent = async (id) => {
  try {
    // Release student's seat in Firestore before deleting student document
    const studentDocRef = doc(db, "students", id);
    const snap = await getDoc(studentDocRef);
    if (snap.exists()) {
      const seatNum = Number(snap.data().seatNumber) || 0;
      if (seatNum > 0) {
        await releaseStudentFromSeat(seatNum, id);
      }
    }

    await deleteStudentFromFirestore(id);
  } catch (err) {
    console.error("Error in deleteStudent:", err);
  }
};

export const updateStudentPayment = async (id, paidAmount) => {
  try {
    const students = await getStudentsFromFirestore();
    const student = students.find((s) => s.id === id);

    if (student) {
      const amount = Number(paidAmount) || 0;
      student.paidAmount = amount;
      const total = Number(student.totalAmount) || 0;

      let status = "Unpaid";
      if (amount >= total && total > 0) status = "Paid";
      else if (amount > 0) status = "Partial";

      student.status = status;
      student.paymentStatus = status;

      const updated = await updateStudentInFirestore(id, {
        paidAmount: amount,
        status,
        paymentStatus: status,
      });

      await recordPaymentInFirestore({
        studentId: id,
        studentName: student.name,
        amount,
        status,
        method: "Payment Update",
        date: new Date().toISOString().split("T")[0],
      });

      return updated;
    }
    return null;
  } catch (err) {
    console.error("Error in updateStudentPayment:", err);
    return null;
  }
};

// --- Validity Helper ---

export const calculateValidity = (admissionDate) => {
  if (!admissionDate) return "N/A";
  const date = new Date(admissionDate);
  if (isNaN(date.getTime())) return "Invalid Date";

  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split("T")[0];
};
