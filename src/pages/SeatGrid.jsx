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
  CheckCircle2,
  Calendar,
  CreditCard,
  Sparkles,
  LayoutGrid,
  List,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { saveStudent } from "../utils/store";
import { subscribeStudents } from "../services/studentsService";
import { subscribeBatches } from "../services/batchesService";
import { checkSeatSlotConflict } from "../services/seatsService";
import { getSeatMatrix, BASE_SLOTS } from "../utils/seatLogic";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { BottomSheet } from "../components/BottomSheet";

export const SeatGrid = () => {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [conflictError, setConflictError] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"

  // Realtime Firestore Subscription for instant seat occupancy & dynamic batches
  useEffect(() => {
    setLoading(true);
    const unsubStudents = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });

    const unsubBatches = subscribeBatches((bData) => {
      setBatches(bData);
    });

    return () => {
      unsubStudents();
      unsubBatches();
    };
  }, []);

  // Compute live seat matrix from Firestore students data
  const seatMatrix = useMemo(() => {
    return getSeatMatrix(students, 100);
  }, [students]);

  // Keep selectedSeat in sync when students state updates
  useEffect(() => {
    if (selectedSeat) {
      const updatedSeat = seatMatrix.find((s) => s.seatNumber === selectedSeat.seatNumber);
      if (updatedSeat) setSelectedSeat(updatedSeat);
    }
  }, [seatMatrix, selectedSeat]);

  // Summary Metrics Calculation
  const stats = useMemo(() => {
    let fullSeats = 0;
    let partialSeats = 0;
    let availableSeats = 0;
    let totalOccupiedSlots = 0;

    seatMatrix.forEach((seat) => {
      totalOccupiedSlots += seat.occupiedSlotsCount;
      if (seat.occupiedSlotsCount === 4) fullSeats++;
      else if (seat.occupiedSlotsCount > 0) partialSeats++;
      else availableSeats++;
    });

    return {
      fullSeats,
      partialSeats,
      availableSeats,
      occupancyRate: Math.round((totalOccupiedSlots / 400) * 100),
    };
  }, [seatMatrix]);

  const filteredSeats = useMemo(() => {
    return seatMatrix.filter((seat) => {
      let matchesFilter = true;
      if (activeFilter === "Available") {
        matchesFilter = seat.occupiedSlotsCount === 0;
      } else if (activeFilter === "Occupied" || activeFilter === "Partial") {
        matchesFilter = seat.occupiedSlotsCount > 0;
      } else if (activeFilter === "Full") {
        matchesFilter = seat.occupiedSlotsCount === 4;
      } else if (activeFilter !== "All") {
        // Dynamic shift filter match
        matchesFilter = seat.assignedStudents.some((s) => {
          const bArr = Array.isArray(s.batch) ? s.batch : [s.batch];
          const hasAll = bArr.some((b) => String(b).toLowerCase().includes("all"));
          if (hasAll) return true;
          return bArr.some(
            (b) =>
              String(b).toLowerCase() === activeFilter.toLowerCase() ||
              String(b).toLowerCase().includes(activeFilter.toLowerCase())
          );
        });
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
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Seats Matrix (1 - 100) <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Realtime Firestore synchronized batch slot allocation (A, B, C, D)
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="skeuo-card px-3.5 py-1.5 text-xs flex items-center gap-2 rounded-xl">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold">Fill Rate: </span>
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{stats.occupancyRate}%</span>
          </div>
          <div className="skeuo-card px-3.5 py-1.5 text-xs flex items-center gap-2 rounded-xl">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold">Available: </span>
            <span className="font-extrabold text-blue-600 dark:text-cyan-400">{stats.availableSeats}</span>
          </div>
          <div className="skeuo-card px-3.5 py-1.5 text-xs flex items-center gap-2 rounded-xl">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold">Full (4/4): </span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400">{stats.fullSeats}</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Recessed Search & Tactile Shift Filter Pills */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by seat #, student name, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="skeuo-input w-full pl-10 pr-4 py-2.5 text-xs font-medium placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {["All", "Available", "Partial", "Full", ...batches.map((b) => b.name || b.time)].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                "skeuo-badge px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-all rounded-xl cursor-pointer",
                activeFilter === filter
                  ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40 font-extrabold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP SEAT GRID VIEW (1024px and above) */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-4">
        {filteredSeats.map((seat) => {
          const isFull = seat.occupiedSlotsCount === 4;
          const isPartial = seat.occupiedSlotsCount > 0 && seat.occupiedSlotsCount < 4;
          const isAvailable = seat.occupiedSlotsCount === 0;

          return (
            <motion.div
              key={seat.seatNumber}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedSeat(seat)}
              className={clsx(
                "skeuo-card p-4 flex flex-col justify-between cursor-pointer transition-all min-h-[135px] relative group rounded-2xl",
                isFull
                  ? "border-purple-500/40"
                  : isPartial
                  ? "border-blue-500/40"
                  : "border-slate-300 dark:border-slate-800/80"
              )}
            >
              {/* Header: Seat Number & Count */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-1.5">
                  <Armchair size={13} className={isFull ? "text-purple-500" : isPartial ? "text-cyan-400" : "text-slate-400"} />
                  Seat {seat.seatNumber}
                </span>
                <span
                  className={clsx(
                    "skeuo-dial w-6 h-6 text-[10px] font-extrabold",
                    isFull
                      ? "text-purple-600 dark:text-purple-400"
                      : isPartial
                      ? "text-blue-600 dark:text-cyan-400"
                      : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  {seat.occupiedSlotsCount}
                </span>
              </div>

              {/* Realtime Batch Status Indicators (A 🟢, B 🟢, C ⚪, D 🟢) */}
              <div className="grid grid-cols-4 gap-1.5 my-2.5">
                {BASE_SLOTS.map((slot) => {
                  const sData = seat.slots[slot.id];
                  const isOcc = sData.occupied;

                  return (
                    <div
                      key={slot.id}
                      className={clsx(
                        "h-6 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all",
                        isOcc
                          ? "skeuo-dial text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                          : "skeuo-inset text-slate-400 dark:text-slate-600"
                      )}
                      title={`${slot.name}: ${isOcc ? sData.student?.name : "Available"}`}
                    >
                      {slot.slotCode}
                    </div>
                  );
                })}
              </div>

              {/* Footer: Status or Student Names */}
              <div className="text-[10px] truncate font-semibold">
                {seat.assignedStudents.length > 0 ? (
                  <span className="text-slate-700 dark:text-slate-300">
                    {seat.assignedStudents.map((s) => s.name).join(", ")}
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400/80 font-bold">🟢 Available</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* MOBILE GRID VIEW (< 1024px) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:hidden gap-3">
        {filteredSeats.map((seat) => {
          const isFull = seat.occupiedSlotsCount === 4;
          const isPartial = seat.occupiedSlotsCount > 0 && seat.occupiedSlotsCount < 4;
          const isAvailable = seat.occupiedSlotsCount === 0;

          return (
            <motion.div
              key={seat.seatNumber}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedSeat(seat)}
              className={clsx(
                "skeuo-card p-3 flex flex-col justify-between cursor-pointer transition-all min-h-[110px] relative rounded-2xl",
                isFull
                  ? "border-purple-500/40"
                  : isPartial
                  ? "border-blue-500/40"
                  : "border-slate-300 dark:border-slate-800"
              )}
            >
              {/* Header: Seat Number & Count */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-white">
                  Seat {seat.seatNumber}
                </span>
                <span
                  className={clsx(
                    "skeuo-dial w-5 h-5 text-[9px] font-bold",
                    isFull
                      ? "text-purple-500"
                      : isPartial
                      ? "text-blue-500"
                      : "text-slate-400"
                  )}
                >
                  {seat.occupiedSlotsCount}
                </span>
              </div>

              {/* Realtime Batch Status Indicators */}
              <div className="grid grid-cols-4 gap-1 my-2">
                {BASE_SLOTS.map((slot) => {
                  const sData = seat.slots[slot.id];
                  const isOcc = sData.occupied;


                  return (
                    <div
                      key={slot.id}
                      className={clsx(
                        "h-5 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border",
                        isOcc
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                          : "bg-slate-950/80 border-slate-800 text-slate-600"
                      )}
                      title={`${slot.name}: ${isOcc ? sData.student?.name : "Available"}`}
                    >
                      {slot.slotCode} {isOcc ? "🟢" : "⚪"}
                    </div>
                  );
                })}
              </div>

              {/* Footer: Status or Student Names */}
              <div className="text-[10px] truncate font-medium">
                {seat.assignedStudents.length > 0 ? (
                  <span className="text-slate-300">
                    {seat.assignedStudents.map((s) => s.name.split(" ")[0]).join(", ")}
                  </span>
                ) : (
                  <span className="text-emerald-400/80 italic font-semibold">Available</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* DESKTOP SIDE DRAWER (1024px and above) */}
      <AnimatePresence>
        {selectedSeat && (
          <div className="hidden lg:flex fixed inset-0 z-50 justify-end bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="bg-[var(--card-bg)] border-l border-slate-200 dark:border-slate-800 w-full max-w-lg h-full overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-2xl flex flex-col justify-between"
            >
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="skeuo-dial w-12 h-12 text-blue-600 dark:text-cyan-400 font-black text-xl glow-cyan">
                      #{selectedSeat.seatNumber}
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        Seat #{selectedSeat.seatNumber} Details <span className="jewel-dot cyan" />
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-medium">
                        <span className="font-bold text-blue-600 dark:text-cyan-400">
                          {selectedSeat.occupiedSlotsCount}/4 Occupied
                        </span>
                        <span>•</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {selectedSeat.availableSlotsCount} Slot(s) Free
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSeat(null)}
                    className="skeuo-dial w-8 h-8 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Seat Summary Statistics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="skeuo-inset p-3.5">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Assigned Students</span>
                    <p className="text-base font-black text-slate-800 dark:text-white mt-0.5 flex items-center gap-1.5">
                      <User size={15} className="text-blue-500" />
                      <span>{selectedSeat.assignedStudents.length} Students</span>
                    </p>
                  </div>

                  <div className="skeuo-inset p-3.5">
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Available Shifts</span>
                    <p className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5">
                      <CheckCircle2 size={15} />
                      <span>{selectedSeat.availableSlotsCount} Free</span>
                    </p>
                  </div>
                </div>

                {/* Batch Slots Breakdown & Student Cards */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Shift Allocation Breakdown (A, B, C, D)
                  </span>
                  {BASE_SLOTS.map((slot) => {
                    const slotData = selectedSeat.slots[slot.id];
                    const student = slotData.student;
                    const isOcc = slotData.occupied;

                    return (
                      <div
                        key={slot.id}
                        className={clsx(
                          "skeuo-card p-4 space-y-3",
                          isOcc ? "opacity-100" : "opacity-75"
                        )}
                        withGrip
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="skeuo-dial w-6 h-6 text-xs font-bold text-blue-500">
                              <Clock size={12} />
                            </div>
                            <span className="text-xs font-extrabold text-slate-800 dark:text-white">
                              {slot.name} <span className="text-slate-400 font-normal text-[11px]">({slot.time})</span>
                            </span>
                          </div>
                          <Badge dot variant={isOcc ? "success" : "default"}>
                            {isOcc ? "Occupied" : "Available"}
                          </Badge>
                        </div>

                        {isOcc && student ? (
                          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="skeuo-dial w-9 h-9 overflow-hidden">
                                  {student.photo ? (
                                    <img src={student.photo} alt={student.name} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    <span className="font-extrabold text-xs text-slate-700 dark:text-slate-300">
                                      {(student.name || "S").charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-extrabold text-slate-800 dark:text-white">{student.name}</p>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <Phone size={10} /> {student.phone}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => handleRemoveSeat(student.id)}
                                className="skeuo-dial w-7 h-7 text-slate-400 hover:text-rose-500"
                                title="Remove seat assignment"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Payment Status & Validity */}
                            <div className="grid grid-cols-2 gap-2 text-xs skeuo-inset p-2.5">
                              <div className="flex items-center gap-1.5">
                                <CreditCard size={12} className="text-emerald-500" />
                                <span className="text-slate-400 text-[10px]">Payment:</span>
                                <span className={clsx("font-bold text-[10px]", student.paidAmount >= student.totalAmount && student.totalAmount > 0 ? "text-emerald-500" : "text-amber-500")}>
                                  {student.status || "Paid"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} className="text-blue-500" />
                                <span className="text-slate-400 text-[10px]">Validity:</span>
                                <span className="font-semibold text-slate-800 dark:text-white text-[10px] truncate">
                                  {student.validityTo || "N/A"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                            <span className="text-slate-400 text-[11px]">Slot is currently vacant</span>
                            <button
                              onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: slot.name })}
                              className="skeuo-badge px-3 py-1 text-blue-600 dark:text-cyan-400 cursor-pointer"
                            >
                              <UserPlus size={12} /> Assign Student
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: "Any" })}
                  className="skeuo-btn skeuo-btn-primary w-full py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
                >
                  <UserPlus size={15} /> Assign Student to Seat #{selectedSeat.seatNumber}
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
              <div className="skeuo-card p-4 flex items-center justify-between" withGrip>
                <div className="flex items-center gap-3">
                  <div className="skeuo-dial w-12 h-12 text-blue-600 dark:text-cyan-400 font-black text-lg">
                    #{selectedSeat.seatNumber}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-800 dark:text-white text-sm">Seat #{selectedSeat.seatNumber}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedSeat.occupiedSlotsCount}/4 Occupied • {selectedSeat.availableSlotsCount} Free
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: "Any" })}
                  className="skeuo-btn skeuo-btn-primary px-3 py-2 text-xs font-bold flex items-center gap-1"
                >
                  <UserPlus size={14} /> Assign
                </button>
              </div>

              <div className="space-y-2.5">
                {BASE_SLOTS.map((slot) => {
                  const slotData = selectedSeat.slots[slot.id];
                  const student = slotData.student;
                  const isOcc = slotData.occupied;

                  return (
                    <div key={slot.id} className="skeuo-card p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 dark:text-white">{slot.name} ({slot.time})</span>
                        <Badge dot variant={isOcc ? "success" : "default"}>{isOcc ? "Occupied" : "Available"}</Badge>
                      </div>

                      {isOcc && student && (
                        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-white">{student.name}</span>
                            <button onClick={() => handleRemoveSeat(student.id)} className="skeuo-dial w-6 h-6 text-rose-500">
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400 skeuo-inset p-2">
                            <p>Phone: <span className="text-slate-800 dark:text-white font-medium">{student.phone}</span></p>
                            <p>Status: <span className="text-emerald-500 font-bold">{student.status || "Paid"}</span></p>
                            <p className="col-span-2">Validity: <span className="text-slate-800 dark:text-white font-medium">{student.validityTo || "N/A"}</span></p>
                          </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="skeuo-card w-full max-w-md p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  Assign Student to Seat #{assignModal.seatNumber} <span className="jewel-dot cyan" />
                </h3>
                <button
                  onClick={() => setAssignModal(null)}
                  className="skeuo-dial w-7 h-7 text-slate-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              {conflictError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{conflictError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Select Student
                </label>
                <select
                  value={assignStudentId}
                  onChange={(e) => {
                    setAssignStudentId(e.target.value);
                    setConflictError("");
                  }}
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-semibold"
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
                  className="skeuo-btn flex-1 py-2.5 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignStudent}
                  disabled={!assignStudentId}
                  className="skeuo-btn skeuo-btn-primary flex-1 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg disabled:opacity-50"
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

