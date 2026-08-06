import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  UserPlus,
  Trash2,
  User,
  Armchair,
  Clock,
  AlertTriangle,
  Phone,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { saveStudent } from "../utils/store";
import { subscribeStudents } from "../services/studentsService";
import { checkSeatSlotConflict } from "../services/seatsService";
import { getSeatMatrix, BASE_SLOTS } from "../utils/seatLogic";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { BottomSheet } from "../components/BottomSheet";

export const SeatGrid = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [conflictError, setConflictError] = useState("");

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const seatMatrix = useMemo(() => {
    return getSeatMatrix(students, 100);
  }, [students]);

  useEffect(() => {
    if (selectedSeat) {
      const updatedSeat = seatMatrix.find((s) => s.seatNumber === selectedSeat.seatNumber);
      if (updatedSeat) setSelectedSeat(updatedSeat);
    }
  }, [seatMatrix]);

  const stats = useMemo(() => {
    let totalOccupiedSlots = 0;
    let fullyOccupiedSeats = 0;
    let availableSeats = 0;

    seatMatrix.forEach((s) => {
      totalOccupiedSlots += s.occupiedSlotsCount;
      if (s.occupiedSlotsCount === 4) fullyOccupiedSeats++;
      if (s.occupiedSlotsCount === 0) availableSeats++;
    });

    return {
      totalSeats: 100,
      totalSlots: 400,
      totalOccupiedSlots,
      fullyOccupiedSeats,
      availableSeats,
      partiallyOccupied: 100 - fullyOccupiedSeats - availableSeats,
      occupancyRate: Math.round((totalOccupiedSlots / 400) * 100),
    };
  }, [seatMatrix]);

  const filteredSeats = useMemo(() => {
    return seatMatrix.filter((seat) => {
      let matchesFilter = true;
      if (activeFilter === "Available") {
        matchesFilter = seat.occupiedSlotsCount === 0;
      } else if (activeFilter === "Occupied") {
        matchesFilter = seat.occupiedSlotsCount > 0;
      } else if (activeFilter === "A Batch") {
        matchesFilter = seat.slots["morning"]?.occupied;
      } else if (activeFilter === "B Batch") {
        matchesFilter = seat.slots["noon"]?.occupied;
      } else if (activeFilter === "C Batch") {
        matchesFilter = seat.slots["afternoon"]?.occupied;
      } else if (activeFilter === "D Batch") {
        matchesFilter = seat.slots["evening"]?.occupied;
      }

      if (!matchesFilter) return false;

      if (!searchTerm) return true;

      const term = searchTerm.toLowerCase().trim();
      if (String(seat.seatNumber).includes(term)) return true;

      return seat.assignedStudents.some(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.phone.includes(term) ||
          (Array.isArray(s.batch)
            ? s.batch.join(" ").toLowerCase().includes(term)
            : String(s.batch).toLowerCase().includes(term))
      );
    });
  }, [seatMatrix, activeFilter, searchTerm]);

  const handleAssignStudent = async () => {
    if (!assignStudentId) return;
    const studentToAssign = students.find((s) => s.id === assignStudentId);
    if (!studentToAssign) return;

    const conflictRes = await checkSeatSlotConflict(
      assignModal.seatNumber,
      studentToAssign.batch,
      studentToAssign.id
    );

    if (conflictRes.conflict) {
      setConflictError("This seat is already occupied in selected slot.");
      return;
    }

    const updated = {
      ...studentToAssign,
      seatNumber: assignModal.seatNumber,
    };

    await saveStudent(updated);
    setAssignModal(null);
    setAssignStudentId("");
    setConflictError("");
  };

  const handleRemoveSeat = async (studentId) => {
    const studentObj = students.find((s) => s.id === studentId);
    if (!studentObj) return;

    await saveStudent({
      ...studentObj,
      seatNumber: 0,
    });
  };

  if (loading) {
    return <SkeletonLoader type="grid" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Armchair className="text-blue-500" size={26} /> Seats & Slot Matrix (1 - 100)
          </h1>
          <p className="text-xs text-slate-400">
            Batch-wise seat allocation (A Batch, B Batch, C Batch, D Batch, All Batch)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <span className="text-slate-400">Occupancy: </span>
            <span className="font-bold text-emerald-400">{stats.occupancyRate}%</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <span className="text-slate-400">Available Seats: </span>
            <span className="font-bold text-blue-400">{stats.availableSeats}</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by seat #, student name, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {["All", "Available", "Occupied", "A Batch", "B Batch", "C Batch", "D Batch"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border",
                activeFilter === filter
                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* 100 Seats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-3">
        {filteredSeats.map((seat) => (
          <motion.div
            key={seat.seatNumber}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setSelectedSeat(seat)}
            className={clsx(
              "rounded-2xl border p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 min-h-[95px] relative group",
              seat.occupiedSlotsCount > 0
                ? "bg-slate-900/90 border-slate-700 hover:border-blue-500 shadow-md"
                : "bg-slate-950/60 border-slate-800/80 hover:border-slate-600 opacity-80"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1">
                Seat {seat.seatNumber}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                {seat.occupiedSlotsCount}/4
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 mt-2">
              {BASE_SLOTS.map((slot) => {
                const sData = seat.slots[slot.id];
                let bgClass = "bg-slate-800";
                if (sData.occupied) {
                  if (sData.status === "expired") bgClass = "bg-rose-500";
                  else if (sData.status === "reserved") bgClass = "bg-amber-500";
                  else bgClass = "bg-emerald-500";
                }

                return (
                  <div
                    key={slot.id}
                    className={clsx("h-2 rounded-full transition-all", bgClass)}
                    title={`${slot.name}: ${sData.occupied ? sData.student.name : "Available"}`}
                  />
                );
              })}
            </div>

            <div className="text-[10px] text-slate-400 mt-2 truncate font-medium">
              {seat.assignedStudents.length > 0
                ? seat.assignedStudents.map((s) => s.name.split(" ")[0]).join(", ")
                : "Available"}
            </div>
          </motion.div>
        ))}
      </div>

      {/* DESKTOP SIDE DRAWER (1024px and above) */}
      <AnimatePresence>
        {selectedSeat && (
          <div className="hidden lg:flex fixed inset-0 z-50 justify-end bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-2xl flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-lg">
                      #{selectedSeat.seatNumber}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        Seat Details #{selectedSeat.seatNumber}
                      </h2>
                      <p className="text-xs text-slate-400">
                        {selectedSeat.occupiedSlotsCount} of 4 Batches Occupied
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSeat(null)}
                    className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/50"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Batch Allocation Breakdown
                  </h3>
                  {BASE_SLOTS.map((slot) => {
                    const slotData = selectedSeat.slots[slot.id];
                    const student = slotData.student;

                    return (
                      <div
                        key={slot.id}
                        className={clsx(
                          "rounded-2xl border p-4 transition-all space-y-3",
                          slotData.occupied
                            ? "bg-slate-950/80 border-slate-800"
                            : "bg-slate-950/30 border-slate-800/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock size={16} className="text-blue-400" />
                            <span className="text-sm font-bold text-white">
                              {slot.name} ({slot.time})
                            </span>
                          </div>
                          {slotData.occupied ? (
                            <Badge variant={slotData.status === "expired" ? "danger" : slotData.status === "reserved" ? "warning" : "success"}>
                              Occupied
                            </Badge>
                          ) : (
                            <Badge variant="default">Available</Badge>
                          )}
                        </div>

                        {slotData.occupied && student ? (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-700">
                                {student.photo ? (
                                  <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
                                ) : (
                                  <User size={18} className="text-slate-400" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{student.name}</p>
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  <Phone size={12} /> {student.phone}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveSeat(student.id)}
                              className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-800/50 flex justify-between items-center text-xs">
                            <span className="text-slate-500">No student assigned</span>
                            <button
                              onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: slot.name })}
                              className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                            >
                              <UserPlus size={14} /> Assign Student
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button
                  onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: "Any" })}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-xs"
                >
                  <UserPlus size={16} /> Assign Student to Seat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MOBILE SLIDE-UP BOTTOM SHEET (< 1024px) */}
      <div className="lg:hidden">
        <BottomSheet
          isOpen={!!selectedSeat}
          onClose={() => setSelectedSeat(null)}
          title={selectedSeat ? `Seat Details #${selectedSeat.seatNumber}` : ""}
        >
          {selectedSeat && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-lg">
                    #{selectedSeat.seatNumber}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Seat #{selectedSeat.seatNumber}</h4>
                    <p className="text-xs text-slate-400">
                      {selectedSeat.occupiedSlotsCount} of 4 Batches Occupied
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: "Any" })}
                  className="h-10 px-3.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-600/20"
                >
                  <UserPlus size={16} /> Assign
                </button>
              </div>

              <div className="space-y-2.5">
                {BASE_SLOTS.map((slot) => {
                  const slotData = selectedSeat.slots[slot.id];
                  const student = slotData.student;

                  return (
                    <div key={slot.id} className="p-3.5 rounded-2xl border bg-slate-950 border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{slot.name} ({slot.time})</span>
                        <Badge variant={slotData.occupied ? "success" : "default"}>{slotData.occupied ? "Occupied" : "Available"}</Badge>
                      </div>

                      {slotData.occupied && student && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                          <span className="font-bold text-white">{student.name}</span>
                          <button onClick={() => handleRemoveSeat(student.id)} className="p-1.5 text-rose-400">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </BottomSheet>
      </div>

      {/* Assign Student Modal */}
      <AnimatePresence>
        {assignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">
                  Assign Student to Seat #{assignModal.seatNumber}
                </h3>
              </div>

              {conflictError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{conflictError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Select Student
                </label>
                <select
                  value={assignStudentId}
                  onChange={(e) => {
                    setAssignStudentId(e.target.value);
                    setConflictError("");
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({Array.isArray(s.batch) ? s.batch.join(", ") : s.batch}) - Seat: {s.seatNumber || "None"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => {
                    setAssignModal(null);
                    setConflictError("");
                  }}
                  className="flex-1 h-12 bg-slate-800 text-slate-300 font-semibold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignStudent}
                  disabled={!assignStudentId}
                  className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-lg shadow-blue-600/20 transition-all"
                >
                  Confirm Assign
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
