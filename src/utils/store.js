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
  getSeatsFromFirestore,
} from "../services/seatsService";

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
  try {
    let savedStudent = null;
    if (student.id) {
      savedStudent = await updateStudentInFirestore(student.id, student);
    } else {
      savedStudent = await addStudentToFirestore(student);
    }

    // Sync seat assignment in Firestore seats collection if seatNumber set
    if (savedStudent && student.seatNumber > 0) {
      await assignStudentSlotsInSeat(student.seatNumber, {
        id: savedStudent.id,
        name: student.name,
        phone: student.phone,
        batch: student.batch,
        status: student.status,
        validityTo: student.validityTo || student.validityEnd,
      });
    }

    // Record payment log if payment was made
    if (student.paidAmount > 0) {
      await recordPaymentInFirestore({
        studentId: savedStudent ? savedStudent.id : student.id,
        studentName: student.name,
        amount: student.paidAmount,
        status: student.status || "Paid",
        method: "Cash / Online",
        date: new Date().toISOString().split("T")[0],
      });
    }

    return savedStudent;
  } catch (err) {
    console.error("Error in saveStudent:", err);
    return null;
  }
};

export const deleteStudent = async (id) => {
  try {
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
