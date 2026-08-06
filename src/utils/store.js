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
import { doc, getDoc, runTransaction, collection } from "firebase/firestore";
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
  const targetSlots = getSlotsFromBatchInput(student.batch);

  try {
    const savedStudent = await runTransaction(db, async (transaction) => {
      // 1. Get or create student doc reference
      const studentId = student.id || doc(collection(db, "students")).id;
      const studentDocRef = doc(db, "students", studentId);
      
      let oldSeatNumber = 0;
      if (student.id) {
        const snap = await transaction.get(studentDocRef);
        if (snap.exists()) {
          oldSeatNumber = Number(snap.data().seatNumber) || 0;
        }
      }

      // 2. Validate seat conflict (Rule 1, 2, 3, 4, 5, 6)
      if (newSeatNumber > 0) {
        const seatDocRef = doc(db, "seats", String(newSeatNumber));
        const seatSnap = await transaction.get(seatDocRef);
        
        if (seatSnap.exists()) {
          const seatData = seatSnap.data();
          const currentSlots = seatData.slots || { a: null, b: null, c: null, d: null };

          // Filter other students' occupied slots
          const occupiedSlotVals = Object.keys(currentSlots)
            .map(k => currentSlots[k])
            .filter(val => val !== null && val.studentId && val.studentId !== studentId);

          // Rule 1: Check if seat is fully occupied by All Batch (owns all 4 slots)
          const isFullyOccupiedByAllBatch = Object.keys(currentSlots).every(k => {
            const val = currentSlots[k];
            return val && val.studentId && val.studentId !== studentId;
          }) && occupiedSlotVals.length > 0 && new Set(occupiedSlotVals.map(v => v.studentId)).size === 1;

          if (isFullyOccupiedByAllBatch) {
            throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} is fully occupied by an All Batch student.`);
          }

          // Rule 2 & 3: If new student selects All Batch, but seat has ANY slot occupied
          const isNewStudentAllBatch = targetSlots.length === 4;
          if (isNewStudentAllBatch && occupiedSlotVals.length > 0) {
            throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} has existing slot assignments. All Batch requires a fully vacant seat.`);
          }

          // Rule 4: Standard slot overlap check
          for (const slotKey of targetSlots) {
            const slotVal = currentSlots[slotKey];
            if (slotVal && slotVal.studentId && slotVal.studentId !== studentId) {
              const slotObj = BASE_SLOTS.find((s) => s.id === slotKey);
              const batchName = slotObj ? slotObj.name : slotKey.toUpperCase() + " Batch";
              throw new Error(`SEAT_CONFLICT: Seat ${newSeatNumber} is already occupied in ${batchName} by ${slotVal.name}.`);
            }
          }
        }
      }

      // 3. Prepare data for student document
      const cleanBatches = targetSlots.map((sCode) => sCode.toUpperCase() + " Batch");
      const studentData = {
        ...student,
        id: studentId,
        batch: cleanBatches,
        seatNumber: newSeatNumber,
        paidAmount: Number(student.paidAmount || 0),
        totalAmount: Number(student.totalAmount || 0),
        updatedAt: new Date().toISOString(),
      };
      if (!student.id) {
        studentData.createdAt = new Date().toISOString();
      }

      // 4. Update student document inside transaction
      transaction.set(studentDocRef, studentData, { merge: true });

      // 5. Handle old seat release
      if (student.id && oldSeatNumber > 0 && oldSeatNumber !== newSeatNumber) {
        const oldSeatDocRef = doc(db, "seats", String(oldSeatNumber));
        const oldSeatSnap = await transaction.get(oldSeatDocRef);
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
            transaction.update(oldSeatDocRef, { slots: oldSlots });
          }
        }
      }

      // 6. Handle new seat assignment slots
      if (newSeatNumber > 0) {
        const seatDocRef = doc(db, "seats", String(newSeatNumber));
        const seatSnap = await transaction.get(seatDocRef);
        
        let currentSlots = { a: null, b: null, c: null, d: null };
        if (seatSnap.exists()) {
          currentSlots = seatSnap.data().slots || { a: null, b: null, c: null, d: null };
        }

        // Clear previous occurrences of this student on this seat
        Object.keys(currentSlots).forEach((k) => {
          if (currentSlots[k]?.studentId === studentId) {
            currentSlots[k] = null;
          }
        });

        // Set student info in new slots
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

        transaction.set(seatDocRef, {
          seatNumber: Number(newSeatNumber),
          slots: currentSlots,
        }, { merge: true });
      }

      return studentData;
    });

    // 7. Write payment transaction log outside Firestore transaction if save succeeded
    if (student.paidAmount > 0) {
      await recordPaymentInFirestore({
        studentId: savedStudent.id,
        studentName: student.name,
        amount: Number(student.paidAmount),
        status: student.status || "Paid",
        method: "Cash / Online",
        date: new Date().toISOString().split("T")[0],
      });
    }

    return savedStudent;
  } catch (err) {
    console.error("Error in saveStudent transaction:", err);
    if (err.message.startsWith("SEAT_CONFLICT:")) {
      alert(err.message.substring(14)); // Show alert with conflict message
    } else {
      alert("Failed to save student details. A database conflict occurred.");
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
