import React, { useState, useEffect, useMemo } from "react";
import { X, Save, Camera, Loader2, AlertTriangle, Lock, Filter } from "lucide-react";
import { clsx } from "clsx";
import { saveStudent, getStudents } from "../utils/store";
import { subscribeBatches } from "../services/batchesService";
import { subscribeStudents } from "../services/studentsService";
import { checkSeatConflict, getSlotsFromBatch, BASE_SLOTS } from "../utils/seatLogic";
import { CameraCapture } from "./CameraCapture";


export const StudentForm = ({
  student,
  onClose,
  onSuccess,
  mode = "personal",
}) => {
  const [batches, setBatches] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictWarning, setConflictWarning] = useState("");
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);

  // Compute today's date and default 1-month validity to-date
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const defaultToDateStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  const initialBatches = useMemo(() => {
    const raw = student?.assignedBatches || student?.batch || [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const clean = arr.map((b) => {
      const s = String(b).toUpperCase().trim();
      if (s === "A" || s === "A BATCH") return "A Batch";
      if (s === "B" || s === "B BATCH") return "B Batch";
      if (s === "C" || s === "C BATCH") return "C Batch";
      if (s === "D" || s === "D BATCH") return "D Batch";
      return b;
    });
    if (clean.length === 4) {
      return [...clean, "All Batch"];
    }
    return clean;
  }, [student]);

  const [formData, setFormData] = useState({
    name: student?.name || "",
    batch: initialBatches,
    phone: student?.phone || "",
    address: student?.address || "",
    admissionDate: student?.admissionDate || todayStr,
    paidAmount: student?.paidAmount || "",
    totalAmount: student?.totalAmount || "",
    status: student?.status || "Unpaid",
    photo: student?.photo || "",
    validityFrom: student?.validityFrom || todayStr,
    validityTo: student?.validityTo || defaultToDateStr,
    seatNumber: student?.seatNumber || 0,
  });

  // Fetch batches & students from Firestore Universal Data Source
  useEffect(() => {
    let unsubBatches = () => {};
    let unsubStudents = () => {};

    unsubBatches = subscribeBatches((bList) => {
      setBatches(bList);
    });

    unsubStudents = subscribeStudents((sList) => {
      setAllStudents(sList);
    });

    return () => {
      unsubBatches();
      unsubStudents();
    };
  }, []);

  // Universal dynamic batches list from Batches Management
  const displayBatches = useMemo(() => {
    if (batches && batches.length > 0) {
      return batches.filter((b) => b.status !== "Inactive");
    }
    return [];
  }, [batches]);

  // Find the dedicated "All Shift" batch from Batches module
  const allShiftBatch = useMemo(() => {
    return (
      displayBatches.find(
        (b) =>
          String(b.name).toLowerCase() === "all shift" ||
          String(b.name).toLowerCase() === "all batch" ||
          b.slotKey === "all" ||
          String(b.name).toLowerCase().includes("all")
      ) || null
    );
  }, [displayBatches]);

  // Individual shifts (excluding All Shift)
  const individualShifts = useMemo(() => {
    if (!allShiftBatch) return displayBatches;
    return displayBatches.filter((b) => b.id !== allShiftBatch.id && b.name !== allShiftBatch.name);
  }, [displayBatches, allShiftBatch]);

  // Check if All Shift is active
  const isAllShiftSelected = useMemo(() => {
    const hasAllKeyword =
      formData.batch.includes("All Shift") ||
      formData.batch.includes("All Batch") ||
      formData.batch.includes("All");

    if (hasAllKeyword) return true;

    // If student selected all individual shifts, it automatically equals All Shift
    if (
      individualShifts.length > 0 &&
      individualShifts.every((s) => formData.batch.includes(s.name) || formData.batch.includes(s.time))
    ) {
      return true;
    }

    return false;
  }, [formData.batch, individualShifts]);

  // Calculate total fee dynamically
  useEffect(() => {
    if (displayBatches.length === 0) return;

    if (isAllShiftSelected) {
      // If All Shift is selected, charge ONLY the All Shift batch fee
      const allFee = allShiftBatch ? Number(allShiftBatch.price) : 1500;
      setFormData((prev) => ({ ...prev, totalAmount: allFee }));
    } else {
      // Individual shifts selected: sum their individual prices
      const selected = individualShifts.filter(
        (b) =>
          formData.batch.includes(b.name) ||
          formData.batch.includes(b.time) ||
          formData.batch.includes(b.id)
      );
      const total = selected.reduce((sum, b) => sum + Number(b.price || 0), 0);
      setFormData((prev) => ({ ...prev, totalAmount: total }));
    }
  }, [formData.batch, isAllShiftSelected, displayBatches, allShiftBatch, individualShifts]);

  // Compute selected batch slots / names for seat conflict checks
  const targetSlots = useMemo(() => {
    if (isAllShiftSelected) {
      return ["a", "b", "c", "d"];
    }
    return getSlotsFromBatch(formData.batch);
  }, [formData.batch, isAllShiftSelected]);

  // Compute availability matrix for all 100 seats (🟢 A01 Available, 🔒 A03 Occupied)
  const seatOccupancyMap = useMemo(() => {
    const map = {};

    for (let n = 1; n <= 100; n++) {
      const seatCode = `A${String(n).padStart(2, "0")}`;

      // Find other students assigned to seat n
      const seatStudents = allStudents.filter(
        (s) => Number(s.seatNumber) === n && s.id !== student?.id
      );

      let isOccupied = false;
      let conflictingStudent = null;
      let conflictingShifts = [];
      let customStatusText = "";

      // Check if any student occupies All Shift on seat n
      const allShiftStudent = seatStudents.find((st) => {
        const sArr = Array.isArray(st.batch) ? st.batch : [st.batch];
        return (
          sArr.some((b) => String(b).toLowerCase().includes("all")) ||
          getSlotsFromBatch(st.batch).length >= 4
        );
      });

      if (allShiftStudent) {
        isOccupied = true;
        conflictingStudent = allShiftStudent;
        customStatusText = `Occupied (All Shift) by ${allShiftStudent.name}`;
      } else {
        // If current student selects All Shift, seat must be completely free
        if (isAllShiftSelected && seatStudents.length > 0) {
          isOccupied = true;
          conflictingStudent = seatStudents[0];
          customStatusText = `Occupied by ${seatStudents[0].name}`;
        } else {
          // Check overlap on selected shifts
          for (const st of seatStudents) {
            const stSlots = getSlotsFromBatch(st.batch);
            const overlapping = targetSlots.filter((slot) => stSlots.includes(slot));

            if (overlapping.length > 0) {
              isOccupied = true;
              conflictingStudent = st;
              conflictingShifts.push(Array.isArray(st.batch) ? st.batch.join(", ") : st.batch);
            }
          }
          if (isOccupied && conflictingStudent) {
            customStatusText = `Occupied by ${conflictingStudent.name}`;
          }
        }
      }

      map[n] = {
        seatNumber: n,
        seatCode,
        isOccupied,
        conflictingStudent,
        conflictingShifts,
        statusText: customStatusText || (isOccupied ? `Occupied by ${conflictingStudent?.name}` : "Available"),
      };
    }

    return map;
  }, [allStudents, targetSlots, isAllShiftSelected, student?.id]);

  // Conflict warning check for currently selected seat
  useEffect(() => {
    if (formData.seatNumber > 0 && formData.batch.length > 0) {
      const seatInfo = seatOccupancyMap[formData.seatNumber];
      if (seatInfo && seatInfo.isOccupied && formData.seatNumber !== student?.seatNumber) {
        setConflictWarning(
          `Seat ${seatInfo.seatCode} is currently occupied by ${seatInfo.conflictingStudent?.name}. Please choose an available seat.`
        );
      } else {
        setConflictWarning("");
      }
    } else {
      setConflictWarning("");
    }
  }, [formData.seatNumber, formData.batch, seatOccupancyMap, student?.seatNumber]);

  // Calculate status & auto validity
  useEffect(() => {
    const paid = Number(formData.paidAmount) || 0;
    const total = Number(formData.totalAmount) || 0;
    const status =
      paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

    setFormData((prev) => {
      const updates = {};
      if (prev.status !== status) {
        updates.status = status;
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [formData.paidAmount, formData.totalAmount]);

  // Sync validityTo automatically whenever validityFrom is changed by user
  useEffect(() => {
    if (formData.validityFrom) {
      const fromDate = new Date(formData.validityFrom);
      if (!isNaN(fromDate.getTime())) {
        const toDate = new Date(fromDate);
        toDate.setMonth(toDate.getMonth() + 1);
        const newToDateStr = toDate.toISOString().split("T")[0];
        if (formData.validityTo !== newToDateStr) {
          setFormData((prev) => ({ ...prev, validityTo: newToDateStr }));
        }
      }
    }
  }, [formData.validityFrom]);

  // Handle batch selection with "All Shift" auto-grant
  const handleBatchToggle = (batchName) => {
    const isAll =
      batchName === "All Shift" ||
      batchName === "All Batch" ||
      batchName === "All" ||
      (allShiftBatch && batchName === allShiftBatch.name);

    setFormData((prev) => {
      let currentBatches = [...prev.batch];

      if (isAll) {
        const alreadyHasAll = isAllShiftSelected;
        if (alreadyHasAll) {
          // Deselect all
          return { ...prev, batch: [] };
        } else {
          // Select All Shift: includes all available individual shifts
          const shiftNames = individualShifts.map((s) => s.name);
          const allName = allShiftBatch ? allShiftBatch.name : "All Shift";
          return {
            ...prev,
            batch: [allName, ...shiftNames],
          };
        }
      } else {
        // Individual shift toggle
        const exists = currentBatches.includes(batchName);
        if (exists) {
          currentBatches = currentBatches.filter(
            (b) => b !== batchName && b !== "All Shift" && b !== "All Batch" && b !== "All"
          );
        } else {
          currentBatches.push(batchName);
        }
        return { ...prev, batch: currentBatches };
      }
    });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert("File size too large. Please select an image under 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, photo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Re-validate against fresh Firestore state before saving
    if (formData.seatNumber > 0 && formData.batch.length > 0 && formData.seatNumber !== student?.seatNumber) {
      const freshStudents = await getStudents();
      const res = checkSeatConflict(
        formData.seatNumber,
        formData.batch,
        student?.id,
        freshStudents
      );
      if (res.conflict) {
        setConflictWarning(res.message || "This seat is already occupied in the selected shift.");
        alert(res.message || "This seat is already occupied in the selected shift.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const data = {
        ...formData,
        id: student?.id,
        paidAmount: Number(formData.paidAmount),
        totalAmount: Number(formData.totalAmount),
        seatNumber: Number(formData.seatNumber),
      };
      await saveStudent(data);
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving student:", error);
      alert("Failed to save student. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const restFee = Math.max(
    0,
    (Number(formData.totalAmount) || 0) - (Number(formData.paidAmount) || 0)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-lg rounded-3xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-base font-bold text-white">
            {mode === "payment"
              ? "Edit Payment Details"
              : student
              ? "Edit Student"
              : "Add New Student"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Photo Section */}
          <div className="flex justify-center mb-2">
            <div className="relative group">
              <div
                className={clsx(
                  "w-20 h-20 rounded-full overflow-hidden bg-slate-800 border-2 border-slate-700 flex items-center justify-center transition-all",
                  mode === "personal" && "group-hover:border-blue-500"
                )}
              >
                {formData.photo ? (
                  <img
                    src={formData.photo}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-slate-500 text-xs text-center px-2">
                    No Photo
                  </div>
                )}
              </div>

              {mode === "personal" && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    title="Upload image"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg border-2 border-slate-900 hover:scale-110 active:scale-95 transition-all z-20"
                    title="Take photo with camera"
                  >
                    <Camera size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {conflictWarning && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{conflictWarning}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              readOnly={mode === "payment"}
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className={clsx(
                "w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all",
                mode === "payment" && "opacity-60 cursor-not-allowed"
              )}
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          {mode === "personal" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Address
                </label>
                <textarea
                  required
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none h-16"
                  placeholder="e.g. Main Road, City"
                />
              </div>
            </>
          )}

          {/* DYNAMIC SHIFT SELECTION FROM BATCHES SECTION */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-400">
                Select Shift(s)
              </label>
              {isAllShiftSelected && (
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                  ⭐ All Shift Selected (Access to All Shifts)
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              {/* Top Option: All Shift Batch */}
              {allShiftBatch && (
                <label
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer",
                    isAllShiftSelected
                      ? "bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500/50 text-white font-bold shadow-md shadow-blue-500/10"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300",
                    mode === "payment" && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={mode === "payment"}
                    checked={isAllShiftSelected}
                    onChange={() => handleBatchToggle(allShiftBatch.name)}
                    className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                  />
                  <div className="flex-1 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold flex items-center gap-1.5 text-sm">
                        ⭐ {allShiftBatch.name}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Full access to all library shifts ({allShiftBatch.time || "All Day"})
                      </span>
                    </div>
                    <span className="font-bold text-emerald-400 text-sm">₹{allShiftBatch.price}</span>
                  </div>
                </label>
              )}

              {/* Individual Shifts */}
              {individualShifts.map((b) => {
                const isChecked =
                  formData.batch.includes(b.name) ||
                  formData.batch.includes(b.time) ||
                  isAllShiftSelected;

                const isDisabled = mode === "payment" || isAllShiftSelected;

                return (
                  <label
                    key={b.id || b.name}
                    className={clsx(
                      "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                      isChecked
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400",
                      isDisabled && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={isDisabled}
                      checked={isChecked}
                      onChange={() => handleBatchToggle(b.name)}
                      className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                    />
                    <div className="flex-1 flex items-center justify-between text-xs">
                      <span className="font-bold">
                        {b.name} <span className="font-normal text-slate-400">({b.time})</span>
                      </span>
                      <span className="font-semibold text-emerald-400">₹{b.price}</span>
                    </div>
                  </label>
                );
              })}

              {displayBatches.length === 0 && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                  No shifts found. Please create shifts in the Batches section.
                </div>
              )}
            </div>
          </div>

          {/* REDESIGNED SEAT ALLOCATION UI (🟢 A01, 🔒 A03) */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  Seat Allocation
                  {formData.seatNumber > 0 && (
                    <span className="text-blue-400 font-semibold text-[11px]">
                      (Selected: {seatOccupancyMap[formData.seatNumber]?.seatCode || `Seat #${formData.seatNumber}`})
                    </span>
                  )}
                </label>
                <p className="text-[10px] text-slate-400">
                  {formData.batch.length > 0
                    ? isAllShiftSelected
                      ? "All Shifts allocated • Select any vacant seat"
                      : `Checking availability for: ${formData.batch.join(", ")}`
                    : "Select a shift above to see live seat availability"}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  🟢 Available
                </span>
                <span className="flex items-center gap-1 text-slate-500 font-semibold">
                  🔒 Occupied
                </span>
              </div>
            </div>

            {/* Dropdown Selector */}
            <div>
              <select
                disabled={mode === "payment"}
                value={formData.seatNumber}
                onChange={(e) => setFormData({ ...formData, seatNumber: Number(e.target.value) })}
                className={clsx(
                  "w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium",
                  mode === "payment" && "opacity-60 cursor-not-allowed"
                )}
              >
                <option value={0}>-- No Seat Assigned --</option>
                {Object.values(seatOccupancyMap).map((seat) => {
                  const isCurrentSeat = seat.seatNumber === student?.seatNumber;
                  const isOccupied = seat.isOccupied && !isCurrentSeat;
                  return (
                    <option
                      key={seat.seatNumber}
                      value={seat.seatNumber}
                      disabled={isOccupied}
                    >
                      {isOccupied ? "🔒" : "🟢"} {seat.seatCode} ({isCurrentSeat ? "Current Seat" : seat.statusText})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* FULL 100-SEAT VISUAL GRID (🟢 A01, 🔒 A03) - ALL SEATS ALWAYS VISIBLE */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Visual Seat Map (100 Seats)</span>
                <button
                  type="button"
                  disabled={mode === "payment"}
                  onClick={() => setFormData({ ...formData, seatNumber: 0 })}
                  className={clsx(
                    "px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border transition-all",
                    formData.seatNumber === 0
                      ? "bg-blue-600 border-blue-400 text-white font-bold"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  )}
                >
                  Unassign Seat (None)
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto custom-scrollbar p-2 bg-slate-900/60 rounded-2xl border border-slate-800/80">
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                  {Object.values(seatOccupancyMap).map((seat) => {
                    const isSelected = formData.seatNumber === seat.seatNumber;
                    const isCurrentSeat = seat.seatNumber === student?.seatNumber;
                    const isOccupied = seat.isOccupied && !isCurrentSeat && !isSelected;

                    return (
                      <button
                        key={seat.seatNumber}
                        type="button"
                        disabled={isOccupied || mode === "payment"}
                        onClick={() => setFormData({ ...formData, seatNumber: seat.seatNumber })}
                        title={
                          isOccupied
                            ? `${seat.seatCode}: ${seat.statusText}`
                            : isSelected
                            ? `${seat.seatCode}: Selected`
                            : `${seat.seatCode}: Available`
                        }
                        className={clsx(
                          "h-10 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center transition-all relative group",
                          isSelected
                            ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/30 scale-105 z-10"
                            : isOccupied
                            ? "bg-slate-950/80 border-slate-800 text-slate-600 cursor-not-allowed opacity-60"
                            : "bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-900/40 active:scale-95"
                        )}
                      >
                        <span className="flex items-center gap-0.5 text-[10px] leading-tight">
                          {isSelected ? "🔵" : isOccupied ? "🔒" : "🟢"}
                        </span>
                        <span className="text-[10px] font-mono leading-tight">{seat.seatCode}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Seat Confirmation Strip */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">Selected Allocation:</span>
              <span className="font-bold text-white">
                {formData.seatNumber > 0
                  ? `🟢 ${seatOccupancyMap[formData.seatNumber]?.seatCode || `Seat #${formData.seatNumber}`}`
                  : "None (Unassigned)"}
              </span>
            </div>
          </div>


          {/* Financials & Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Total Fee (₹)
              </label>
              <input
                type="number"
                readOnly
                value={formData.totalAmount}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-slate-400 text-xs cursor-not-allowed font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Paid Amount (₹)
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.paidAmount}
                onChange={(e) =>
                  setFormData({ ...formData, paidAmount: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                <span>Validity From</span>
                <span className="text-[9px] text-emerald-400 font-normal">Auto Today</span>
              </label>
              <input
                type="date"
                required
                value={formData.validityFrom}
                onChange={(e) =>
                  setFormData({ ...formData, validityFrom: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                <span>Validity To</span>
                <span className="text-[9px] text-emerald-400 font-normal">+1 Month</span>
              </label>
              <input
                type="date"
                required
                value={formData.validityTo}
                onChange={(e) =>
                  setFormData({ ...formData, validityTo: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 flex items-center justify-between border border-slate-800 text-xs">
            <div>
              <span className="text-slate-500">Status: </span>
              <span
                className={clsx(
                  "font-bold ml-1",
                  formData.status === "Paid" ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {formData.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Balance: </span>
              <span className="font-bold text-white ml-1">₹{restFee}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !!conflictWarning}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-all text-sm"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save size={16} /> Save Student
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {isCameraOpen && (
        <CameraCapture
          onCapture={(photo) => setFormData((prev) => ({ ...prev, photo }))}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
    </div>
  );
};
