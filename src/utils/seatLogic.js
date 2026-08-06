// Realtime Seat & Batch Business Logic Utility (A, B, C, D & All Batch)

export const BASE_SLOTS = [
  { id: "a", slotCode: "A", name: "A Batch", time: "6:00 AM - 10:00 AM", label: "A Batch (6:00 AM - 10:00 AM)", key: "slot1" },
  { id: "b", slotCode: "B", name: "B Batch", time: "10:00 AM - 2:00 PM", label: "B Batch (10:00 AM - 2:00 PM)", key: "slot2" },
  { id: "c", slotCode: "C", name: "C Batch", time: "2:00 PM - 6:00 PM", label: "C Batch (2:00 PM - 6:00 PM)", key: "slot3" },
  { id: "d", slotCode: "D", name: "D Batch", time: "6:00 PM - 10:00 PM", label: "D Batch (6:00 PM - 10:00 PM)", key: "slot4" },
];

/**
 * Normalizes any batch string or array into base slot IDs ("a", "b", "c", "d")
 */
export const getSlotsFromBatch = (batchInput) => {
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
 * Checks if a slot is expired based on student validity date
 */
export const isSlotExpired = (student) => {
  if (!student || !student.validityTo) return false;
  const expiryDate = new Date(student.validityTo);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

/**
 * Generates seat matrix calculation for seats 1 to capacity (default 100) directly from live students list
 */
export const getSeatMatrix = (studentsList = [], capacity = 100) => {
  const matrix = [];

  for (let seatNum = 1; seatNum <= capacity; seatNum++) {
    // Find all students assigned to seatNum
    const seatStudents = studentsList.filter(
      (s) => Number(s.seatNumber) === seatNum
    );

    const slotsStatus = {
      a: { slotCode: "A", name: "A Batch", time: "6:00 AM - 10:00 AM", occupied: false, student: null, status: "available" },
      b: { slotCode: "B", name: "B Batch", time: "10:00 AM - 2:00 PM", occupied: false, student: null, status: "available" },
      c: { slotCode: "C", name: "C Batch", time: "2:00 PM - 6:00 PM", occupied: false, student: null, status: "available" },
      d: { slotCode: "D", name: "D Batch", time: "6:00 PM - 10:00 PM", occupied: false, student: null, status: "available" },
    };

    seatStudents.forEach((student) => {
      const studentSlots = getSlotsFromBatch(student.batch);
      
      studentSlots.forEach((slotId) => {
        if (slotsStatus[slotId]) {
          slotsStatus[slotId].occupied = true;
          slotsStatus[slotId].student = student;
          
          if (isSlotExpired(student)) {
            slotsStatus[slotId].status = "expired";
          } else if (student.status === "Unpaid" || (student.paidAmount === 0 && student.totalAmount > 0)) {
            slotsStatus[slotId].status = "reserved";
          } else {
            slotsStatus[slotId].status = "occupied";
          }
        }
      });
    });

    const occupiedCount = Object.values(slotsStatus).filter((s) => s.occupied).length;
    let seatState = "Available"; // "Full", "Partial", "Available"
    if (occupiedCount === 4) seatState = "Full";
    else if (occupiedCount > 0) seatState = "Partial";

    matrix.push({
      seatNumber: seatNum,
      slots: slotsStatus,
      occupiedSlotsCount: occupiedCount,
      availableSlotsCount: 4 - occupiedCount,
      seatState,
      assignedStudents: seatStudents,
    });
  }

  return matrix;
};

/**
 * Auto Conflict Detector when assigning a student to a seat
 */
export const checkSeatConflict = (targetSeatNumber, newStudentBatch, currentStudentId, studentsList = []) => {
  if (!targetSeatNumber || targetSeatNumber <= 0) {
    return { conflict: false };
  }

  const targetSlots = getSlotsFromBatch(newStudentBatch);
  if (targetSlots.length === 0) return { conflict: false };

  const seatStudents = studentsList.filter(
    (s) => Number(s.seatNumber) === Number(targetSeatNumber) && s.id !== currentStudentId
  );

  for (const student of seatStudents) {
    const existingSlots = getSlotsFromBatch(student.batch);
    const overlappingSlot = targetSlots.find((slot) => existingSlots.includes(slot));
    
    if (overlappingSlot) {
      const slotObj = BASE_SLOTS.find((s) => s.id === overlappingSlot);
      const batchName = slotObj ? slotObj.name : overlappingSlot.toUpperCase() + " Batch";
      return {
        conflict: true,
        conflictingSlot: batchName,
        conflictingStudent: student,
        message: `Seat ${targetSeatNumber} is already occupied in ${batchName} by ${student.name}. Please choose another seat.`,
      };
    }
  }

  return { conflict: false };
};
