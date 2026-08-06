// Seat & Batch Business Logic Utility

export const BASE_SLOTS = [
  { id: "morning", name: "Morning", time: "6AM - 10AM", label: "6:00 AM - 10:00 AM", key: "slot1" },
  { id: "noon", name: "Noon", time: "10AM - 2PM", label: "10:00 AM - 2:00 PM", key: "slot2" },
  { id: "afternoon", name: "Afternoon", time: "2PM - 6PM", label: "2:00 PM - 6:00 PM", key: "slot3" },
  { id: "evening", name: "Evening", time: "6PM - 10PM", label: "6:00 PM - 10:00 PM", key: "slot4" },
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
      // Fallback matching by time ranges
      if (str.includes("6am") || str.includes("6:00am")) slotsSet.add("morning");
      if (str.includes("10am") || str.includes("10:00am")) slotsSet.add("noon");
      if (str.includes("2pm") || str.includes("2:00pm")) slotsSet.add("afternoon");
      if (str.includes("6pm") || str.includes("6:00pm")) slotsSet.add("evening");
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
    // Find all students assigned to this seat
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
            slotsStatus[slotId].status = "expired"; // Red
          } else if (student.status === "Unpaid" || (student.paidAmount === 0 && student.totalAmount > 0)) {
            slotsStatus[slotId].status = "reserved"; // Yellow / Reserved / Unpaid
          } else {
            slotsStatus[slotId].status = "occupied"; // Green
          }
        }
      });
    });

    // Overall Seat Status:
    // If all slots empty -> "available"
    // If all slots occupied -> "occupied"
    // Else -> "partial"
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

  // Find other students on this seat
  const seatStudents = studentsList.filter(
    (s) => Number(s.seatNumber) === Number(targetSeatNumber) && s.id !== currentStudentId
  );

  for (const student of seatStudents) {
    const existingSlots = getSlotsFromBatch(student.batch);
    const overlappingSlot = targetSlots.find((slot) => existingSlots.includes(slot));
    
    if (overlappingSlot) {
      const slotObj = BASE_SLOTS.find((s) => s.id === overlappingSlot);
      return {
        conflict: true,
        conflictingSlot: slotObj ? slotObj.name : overlappingSlot,
        conflictingStudent: student,
        message: `Seat ${targetSeatNumber} is already occupied in ${slotObj ? slotObj.name : overlappingSlot} batch by ${student.name}. Please choose another seat or slot.`,
      };
    }
  }

  return { conflict: false };
};
