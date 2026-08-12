import React, { useState, useEffect, useMemo } from "react";
import { X, Save, Camera, Loader2, AlertTriangle, Lock, Filter, Armchair, User } from "lucide-react";
import { clsx } from "clsx";
import { saveStudent, getStudents } from "../utils/store";
import { subscribeBatches } from "../services/batchesService";
import { subscribeStudents } from "../services/studentsService";
import { checkSeatConflict, getSlotsFromBatch, BASE_SLOTS } from "../utils/seatLogic";
import { CameraCapture } from "./CameraCapture";
import { SaaSCard } from "./SaaSCard";
import { Badge } from "./Badge";

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
      if (prev.status !== status) updates.status = status;
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [formData.paidAmount, formData.totalAmount]);

  // Toggle shift selection
  const handleBatchToggle = (batchName) => {
    if (mode === "payment") return;

    // Check if clicked "All Shift"
    const isClickingAll =
      String(batchName).toLowerCase() === "all shift" ||
      String(batchName).toLowerCase() === "all batch" ||
      String(batchName).toLowerCase() === "all";

    if (isClickingAll) {
      if (isAllShiftSelected) {
        // Deselect All Shift
        setFormData((prev) => ({ ...prev, batch: [] }));
      } else {
        // Select All Shift: include All Shift and all individual shifts
        const allNames = individualShifts.map((b) => b.name);
        setFormData((prev) => ({
          ...prev,
          batch: ["All Shift", ...allNames],
        }));
      }
      return;
    }

    // Clicking an individual shift
    let nextBatches = [...formData.batch].filter(
      (b) => b !== "All Shift" && b !== "All Batch" && b !== "All"
    );

    if (nextBatches.includes(batchName)) {
      nextBatches = nextBatches.filter((b) => b !== batchName);
    } else {
      nextBatches.push(batchName);
    }

    // If user manually selected every individual shift, also activate All Shift
    if (
      individualShifts.length > 0 &&
      individualShifts.every((s) => nextBatches.includes(s.name))
    ) {
      nextBatches.push("All Shift");
    }

    setFormData((prev) => ({ ...prev, batch: nextBatches }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (conflictWarning) {
      alert(conflictWarning);
      return;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="skeuo-card w-full sm:max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-300 dark:border-slate-800">
        {/* Mobile Drag Indicator */}
        <div className="pt-2.5 pb-0.5 flex sm:hidden justify-center bg-[var(--card-bg)]">
          <div className="w-12 h-1.5 rounded-full bg-slate-400 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-[var(--card-bg)] sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
              {mode === "payment"
                ? "Edit Payment Details"
                : student
                ? "Edit Student Record"
                : "Add New Student"}
            </h2>
            <span className="jewel-dot cyan" />
          </div>
          <button
            onClick={onClose}
            className="skeuo-dial w-8 h-8 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar flex-1 pb-8">
          {/* Photo Section */}
          <div className="flex justify-center mb-1">
            <div className="relative group">
              <div
                className={clsx(
                  "skeuo-dial w-20 h-20 overflow-hidden border-2 border-slate-300 dark:border-slate-700",
                  mode === "personal" && "group-hover:border-blue-500"
                )}
              >
                {formData.photo ? (
                  <img
                    src={formData.photo}
                    alt="Preview"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <User size={30} className="text-slate-400" />
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
                    className="skeuo-dial absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 text-white shadow-lg hover:scale-110 active:scale-95 z-20"
                    title="Take photo with camera"
                  >
                    <Camera size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          {conflictWarning && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <span>{conflictWarning}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
              Full Name
            </label>
            <input
              type="text"
              required
              readOnly={mode === "payment"}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={clsx(
                "skeuo-input w-full px-4 py-2.5 text-xs font-medium",
                mode === "payment" && "opacity-60 cursor-not-allowed"
              )}
              placeholder="e.g. Rahul Sharma"
            />
          </div>

          {mode === "personal" && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Address
                </label>
                <textarea
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="skeuo-input w-full px-4 py-2 text-xs font-medium resize-none h-16"
                  placeholder="e.g. Main Road, City"
                />
              </div>
            </>
          )}

          {/* DYNAMIC SHIFT SELECTION FROM BATCHES SECTION */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select Shift(s)
              </label>
              {isAllShiftSelected && (
                <span className="text-[10px] text-amber-500 font-extrabold flex items-center gap-1">
                  ⭐ All Shift Selected
                </span>
              )}
            </div>

            <div className="space-y-2">
              {/* Top Option: All Shift Batch */}
              {allShiftBatch && (
                <div
                  onClick={() => mode !== "payment" && handleBatchToggle(allShiftBatch.name)}
                  className={clsx(
                    "skeuo-card p-3 flex items-center justify-between cursor-pointer transition-all rounded-xl",
                    isAllShiftSelected
                      ? "ring-2 ring-blue-500 bg-blue-50/20"
                      : "opacity-85 hover:opacity-100",
                    mode === "payment" && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={clsx("skeuo-dial w-6 h-6 text-xs font-black", isAllShiftSelected ? "text-blue-600 dark:text-cyan-400" : "text-slate-400")}>
                      {isAllShiftSelected ? "✓" : "○"}
                    </span>
                    <div>
                      <span className="font-extrabold text-xs text-slate-800 dark:text-white block">
                        ⭐ {allShiftBatch.name}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Full access to all shifts ({allShiftBatch.time || "All Day"})
                      </span>
                    </div>
                  </div>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs">
                    ₹{allShiftBatch.price}
                  </span>
                </div>
              )}

              {/* Individual Shifts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {individualShifts.map((b) => {
                  const isChecked =
                    formData.batch.includes(b.name) ||
                    formData.batch.includes(b.time) ||
                    isAllShiftSelected;

                  return (
                    <div
                      key={b.id || b.name}
                      onClick={() => mode !== "payment" && !isAllShiftSelected && handleBatchToggle(b.name)}
                      className={clsx(
                        "skeuo-card p-2.5 flex items-center justify-between cursor-pointer transition-all rounded-xl",
                        isChecked
                          ? "ring-2 ring-blue-500/80"
                          : "opacity-80 hover:opacity-100",
                        (mode === "payment" || isAllShiftSelected) && "cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={clsx("skeuo-dial w-5 h-5 text-[10px] font-bold", isChecked ? "text-blue-600 dark:text-cyan-400" : "text-slate-400")}>
                          {isChecked ? "✓" : "○"}
                        </span>
                        <span className="font-bold text-xs text-slate-800 dark:text-white truncate">
                          {b.name}
                        </span>
                      </div>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs ml-1">
                        ₹{b.price}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SKEUOMORPHIC 100-SEAT ALLOCATION MATRIX */}
          <div className="skeuo-inset p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Armchair size={13} className="text-blue-500" /> Seat Matrix
                  {formData.seatNumber > 0 && (
                    <span className="text-blue-600 dark:text-cyan-400 font-extrabold text-[11px]">
                      (Seat #{formData.seatNumber})
                    </span>
                  )}
                </label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {formData.batch.length > 0
                    ? isAllShiftSelected
                      ? "All Shifts active • Choose any vacant seat"
                      : `Checking availability for: ${formData.batch.join(", ")}`
                    : "Select a shift above to check availability"}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-bold">
                <span className="text-emerald-600 dark:text-emerald-400">🟢 Free</span>
                <span className="text-slate-400">🔒 Taken</span>
              </div>
            </div>

            {/* Dropdown Selector */}
            <div>
              <select
                disabled={mode === "payment"}
                value={formData.seatNumber}
                onChange={(e) => setFormData({ ...formData, seatNumber: Number(e.target.value) })}
                className={clsx(
                  "skeuo-input w-full px-3 py-2 text-xs font-semibold",
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

            {/* 100-SEAT VISUAL MATRIX PODS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                <span>Visual Map (1 - 100)</span>
                <button
                  type="button"
                  disabled={mode === "payment"}
                  onClick={() => setFormData({ ...formData, seatNumber: 0 })}
                  className={clsx(
                    "skeuo-badge px-2.5 py-0.5 text-[9px] font-bold cursor-pointer transition-all",
                    formData.seatNumber === 0
                      ? "bg-blue-600 text-blue-700 dark:text-cyan-300 border-blue-400"
                      : "text-slate-500"
                  )}
                >
                  Clear Selection
                </button>
              </div>

              <div className="max-h-40 overflow-y-auto custom-scrollbar p-2 rounded-xl skeuo-inset">
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
                          "h-9 rounded-lg text-[10px] font-extrabold flex flex-col items-center justify-center transition-all cursor-pointer",
                          isSelected
                            ? "skeuo-btn skeuo-btn-primary scale-105 z-10"
                            : isOccupied
                            ? "skeuo-inset text-slate-400 opacity-50 cursor-not-allowed"
                            : "skeuo-dial text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:border-emerald-400"
                        )}
                      >
                        <span className="text-[9px] leading-none font-mono">
                          {isSelected ? "🔵" : isOccupied ? "🔒" : seat.seatCode}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Financials & Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                Total Fee (₹)
              </label>
              <input
                type="number"
                readOnly
                value={formData.totalAmount}
                className="skeuo-input w-full px-3 py-2 text-xs font-black opacity-80 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                Paid Amount (₹)
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.paidAmount}
                onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                className="skeuo-input w-full px-3 py-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Admission Date</span>
              </label>
              <input
                type="date"
                required
                value={formData.admissionDate}
                onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                className="skeuo-input w-full px-3 py-2 text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Validity Expiry</span>
              </label>
              <input
                type="date"
                required
                value={formData.validityTo}
                onChange={(e) => setFormData({ ...formData, validityTo: e.target.value })}
                className="skeuo-input w-full px-3 py-2 text-xs font-medium"
              />
            </div>
          </div>

          {/* Ledger Balance Preview */}
          <div className="skeuo-inset p-3 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Status: </span>
              <Badge dot variant={formData.status === "Paid" ? "success" : formData.status === "Partial" ? "warning" : "danger"}>
                {formData.status}
              </Badge>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Balance Due: </span>
              <span className="font-extrabold text-slate-800 dark:text-white ml-1">₹{restFee}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !!conflictWarning}
              className="skeuo-btn skeuo-btn-primary w-full py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save size={15} /> Save Student Record
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
