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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Armchair className="text-blue-500" size={26} /> Seats Dashboard (1 - 100)
          </h1>
          <p className="text-xs text-slate-400">
            Realtime Firestore synchronized batch slot allocation (A, B, C, D)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs flex items-center gap-2">
            <span className="text-slate-400">Overall Fill Rate: </span>
            <span className="font-extrabold text-emerald-400">{stats.occupancyRate}%</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs flex items-center gap-2">
            <span className="text-slate-400">Available: </span>
            <span className="font-extrabold text-blue-400">{stats.availableSeats}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs flex items-center gap-2">
            <span className="text-slate-400">Full (4/4): </span>
            <span className="font-extrabold text-purple-400">{stats.fullSeats}</span>
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
          {["All", "Available", "Partial", "Full", ...batches.map((b) => b.name || b.time)].map((filter) => (
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

      {/* DESKTOP SEAT GRID VIEW (1024px and above) */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-4">
        {filteredSeats.map((seat) => {
          const isFull = seat.occupiedSlotsCount === 4;
          const isPartial = seat.occupiedSlotsCount > 0 && seat.occupiedSlotsCount < 4;
          const isAvailable = seat.occupiedSlotsCount === 0;

          return (
            <motion.div
              key={seat.seatNumber}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSelectedSeat(seat)}
              className={clsx(
                "rounded-2xl border p-4 flex flex-col justify-between cursor-pointer transition-all duration-200 min-h-[125px] relative group shadow-md lg:p-5 lg:min-h-[140px]",
                isFull
                  ? "bg-slate-900/95 border-purple-500/40 hover:border-purple-400 shadow-purple-500/5"
                  : isPartial
                  ? "bg-slate-900/90 border-blue-500/40 hover:border-blue-400 shadow-blue-500/5"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-emerald-500/60 opacity-80"
              )}
            >
              {/* Header: Seat Number & Count */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1 lg:text-sm">
                  Seat {seat.seatNumber}
                </span>
                <span
                  className={clsx(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md border lg:text-[11px] lg:px-2 lg:py-1",
                    isFull
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                      : isPartial
                      ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  )}
                >
                  {seat.occupiedSlotsCount}/4
                </span>
              </div>

              {/* Realtime Batch Status Indicators (A 🟢, B 🟢, C ⚪, D 🟢) */}
              <div className="grid grid-cols-4 gap-1.5 my-2.5 lg:my-3 lg:gap-2">
                {BASE_SLOTS.map((slot) => {
                  const sData = seat.slots[slot.id];
                  const isOcc = sData.occupied;

                  return (
                    <div
                      key={slot.id}
                      className={clsx(
                        "h-5 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border lg:h-6 lg:text-[11px]",
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
              <div className="text-[10px] truncate font-medium lg:text-[11px]">
                {seat.assignedStudents.length > 0 ? (
                  <span className="text-slate-350">
                    {seat.assignedStudents.map((s) => s.name).join(", ")}
                  </span>
                ) : (
                  <span className="text-emerald-400/80 italic font-semibold">Available</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* MOBILE GRID VIEW (< 1024px) - 100% UNTOUCHED ORIGINAL MOBILE CODE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:hidden gap-3">
        {filteredSeats.map((seat) => {
          const isFull = seat.occupiedSlotsCount === 4;
          const isPartial = seat.occupiedSlotsCount > 0 && seat.occupiedSlotsCount < 4;
          const isAvailable = seat.occupiedSlotsCount === 0;

          return (
            <motion.div
              key={seat.seatNumber}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSelectedSeat(seat)}
              className={clsx(
                "rounded-2xl border p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 min-h-[105px] relative group shadow-md",
                isFull
                  ? "bg-slate-900/95 border-purple-500/40 hover:border-purple-400 shadow-purple-500/5"
                  : isPartial
                  ? "bg-slate-900/90 border-blue-500/40 hover:border-blue-400 shadow-blue-500/5"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-emerald-500/60 opacity-80"
              )}
            >
              {/* Header: Seat Number & Count */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1">
                  Seat {seat.seatNumber}
                </span>
                <span
                  className={clsx(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md border",
                    isFull
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                      : isPartial
                      ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  )}
                >
                  {seat.occupiedSlotsCount}/4
                </span>
              </div>

              {/* Realtime Batch Status Indicators (A 🟢, B 🟢, C ⚪, D 🟢) */}
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
          <div className="hidden lg:flex fixed inset-0 z-50 justify-end bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-2xl flex flex-col justify-between"
            >
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-extrabold text-xl shadow-lg">
                      #{selectedSeat.seatNumber}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Seat #{selectedSeat.seatNumber} Details
                      </h2>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-semibold text-blue-400">
                          {selectedSeat.occupiedSlotsCount}/4 Occupied
                        </span>
                        <span>•</span>
                        <span className="text-emerald-400 font-semibold">
                          {selectedSeat.availableSlotsCount} Available Slot(s)
                        </span>
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

                {/* Seat Summary Statistics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                    <p className="text-slate-400 text-[11px] font-medium">Total Students Assigned</p>
                    <p className="text-lg font-bold text-white mt-0.5 flex items-center gap-1.5">
                      <User size={16} className="text-blue-400" />
                      <span>{selectedSeat.assignedStudents.length} Students</span>
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                    <p className="text-slate-400 text-[11px] font-medium">Available Batches</p>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
                      <CheckCircle2 size={16} />
                      <span>{selectedSeat.availableSlotsCount} Free</span>
                    </p>
                  </div>
                </div>

                {/* Batch Slots Breakdown & Student Cards */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Batch Allocation Details (A, B, C, D)
                  </h3>
                  {BASE_SLOTS.map((slot) => {
                    const slotData = selectedSeat.slots[slot.id];
                    const student = slotData.student;
                    const isOcc = slotData.occupied;

                    return (
                      <div
                        key={slot.id}
                        className={clsx(
                          "rounded-2xl border p-4 transition-all space-y-3",
                          isOcc
                            ? "bg-slate-950/90 border-slate-800"
                            : "bg-slate-950/30 border-slate-800/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock size={16} className="text-blue-400" />
                            <span className="text-sm font-bold text-white">
                              {slot.name} <span className="text-slate-400 font-normal text-xs">({slot.time})</span>
                            </span>
                          </div>
                          {isOcc ? (
                            <Badge variant={slotData.status === "expired" ? "danger" : slotData.status === "reserved" ? "warning" : "success"}>
                              Occupied 🟢
                            </Badge>
                          ) : (
                            <Badge variant="default">Available ⚪</Badge>
                          )}
                        </div>

                        {isOcc && student ? (
                          <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                            <div className="flex items-center justify-between">
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
                                title="Remove seat assignment"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Payment Status & Validity */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                              <div className="flex items-center gap-1.5">
                                <CreditCard size={14} className="text-emerald-400" />
                                <span className="text-slate-400">Payment:</span>
                                <span className={clsx("font-bold ml-1", student.paidAmount >= student.totalAmount && student.totalAmount > 0 ? "text-emerald-400" : "text-amber-400")}>
                                  {student.status || "Paid"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Calendar size={14} className="text-blue-400" />
                                <span className="text-slate-400">Validity:</span>
                                <span className="font-semibold text-white truncate">
                                  {student.validityTo || "N/A"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-800/50 flex justify-between items-center text-xs">
                            <span className="text-slate-500">No student assigned to this slot</span>
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

              <div className="pt-4 border-t border-slate-800">
                <button
                  onClick={() => setAssignModal({ seatNumber: selectedSeat.seatNumber, targetSlot: "Any" })}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-xs"
                >
                  <UserPlus size={16} /> Assign Student to Seat #{selectedSeat.seatNumber}
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
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-extrabold text-xl">
                    #{selectedSeat.seatNumber}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">Seat #{selectedSeat.seatNumber}</h4>
                    <p className="text-xs text-slate-400">
                      {selectedSeat.occupiedSlotsCount}/4 Occupied • {selectedSeat.availableSlotsCount} Free
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
                  const isOcc = slotData.occupied;

                  return (
                    <div key={slot.id} className="p-3.5 rounded-2xl border bg-slate-950 border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{slot.name} ({slot.time})</span>
                        <Badge variant={isOcc ? "success" : "default"}>{isOcc ? "Occupied 🟢" : "Available ⚪"}</Badge>
                      </div>

                      {isOcc && student && (
                        <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{student.name}</span>
                            <button onClick={() => handleRemoveSeat(student.id)} className="p-1 text-rose-400">
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                            <p>Phone: <span className="text-white">{student.phone}</span></p>
                            <p>Status: <span className="text-emerald-400">{student.status || "Paid"}</span></p>
                            <p className="col-span-2">Validity: <span className="text-white">{student.validityTo || "N/A"}</span></p>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
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
