// Seat & Batch Business Logic Utility (5 Standard Batches: A, B, C, D, All Batch)

export const BASE_SLOTS = [
  { id: "morning", name: "A Batch", time: "6:00 AM - 10:00 AM", label: "A Batch (6:00 AM - 10:00 AM)", key: "slot1" },
  { id: "noon", name: "B Batch", time: "10:00 AM - 2:00 PM", label: "B Batch (10:00 AM - 2:00 PM)", key: "slot2" },
  { id: "afternoon", name: "C Batch", time: "2:00 PM - 6:00 PM", label: "C Batch (2:00 PM - 6:00 PM)", key: "slot3" },
  { id: "evening", name: "D Batch", time: "6:00 PM - 10:00 PM", label: "D Batch (6:00 PM - 10:00 PM)", key: "slot4" },
];

/**
 * Normalizes any batch string or array into base slot IDs ("morning", "noon", "afternoon", "evening")
 */
export const getSlotsFromBatch = (batchInput) => {
  if (!batchInput) return [];
  
  const batches = Array.isArray(batchInput) ? batchInput : [batchInput];
  const slotsSet = new Set();

  batches.forEach((b) => {
    if (!b) return;
    const str = b.toString().toLowerCase().trim();

    if (str.includes("all batch") || str.includes("allshift") || str.includes("6:00 am - 10:00 pm") || str.includes("6am-10pm")) {
      slotsSet.add("morning");
      slotsSet.add("noon");
      slotsSet.add("afternoon");
      slotsSet.add("evening");
    } else if (str.includes("a batch") || str.includes("6:00 am - 10:00 am") || str.includes("6am-10am") || str === "a") {
      slotsSet.add("morning");
    } else if (str.includes("b batch") || str.includes("10:00 am - 2:00 pm") || str.includes("10am-2pm") || str === "b") {
      slotsSet.add("noon");
    } else if (str.includes("c batch") || str.includes("2:00 pm - 6:00 pm") || str.includes("2pm-6pm") || str === "c") {
      slotsSet.add("afternoon");
    } else if (str.includes("d batch") || str.includes("6:00 pm - 10:00 pm") || str.includes("6pm-10pm") || str === "d") {
      slotsSet.add("evening");
    } else {
      // Fallback matching by keyword / time
      if (str.includes("morning") || str.includes("6am") || str.includes("6:00am")) slotsSet.add("morning");
      if (str.includes("noon") || str.includes("10am") || str.includes("10:00am")) slotsSet.add("noon");
      if (str.includes("afternoon") || str.includes("2pm") || str.includes("2:00pm")) slotsSet.add("afternoon");
      if (str.includes("evening") || str.includes("6pm") || str.includes("6:00pm")) slotsSet.add("evening");
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
 * Generates seat breakdown for seats 1 to capacity (default 100)
 */
export const getSeatMatrix = (studentsList = [], capacity = 100) => {
  const matrix = [];

  for (let seatNum = 1; seatNum <= capacity; seatNum++) {
    const seatStudents = studentsList.filter(
      (s) => Number(s.seatNumber) === seatNum
    );

    const slotsStatus = {
      morning: { occupied: false, student: null, status: "available" },
      noon: { occupied: false, student: null, status: "available" },
      afternoon: { occupied: false, student: null, status: "available" },
      evening: { occupied: false, student: null, status: "available" },
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
    let seatState = "available";
    if (occupiedCount === 4) seatState = "occupied";
    else if (occupiedCount > 0) seatState = "partially_occupied";

    matrix.push({
      seatNumber: seatNum,
      slots: slotsStatus,
      occupiedSlotsCount: occupiedCount,
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
      const batchName = slotObj ? slotObj.name : overlappingSlot;
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
