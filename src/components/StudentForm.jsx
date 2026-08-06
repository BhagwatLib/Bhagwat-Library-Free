import React, { useState, useEffect, useMemo } from "react";
import { X, Save, Camera, Loader2, AlertTriangle, Lock, Filter } from "lucide-react";
import { clsx } from "clsx";
import { saveStudent, getBatches, getStudents } from "../utils/store";
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

  const [formData, setFormData] = useState({
    name: student?.name || "",
    batch: Array.isArray(student?.batch)
      ? student.batch
      : student?.batch
      ? [student.batch]
      : [],
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

  useEffect(() => {
    const loadData = async () => {
      const bList = await getBatches();
      const sList = await getStudents();
      setBatches(bList);
      setAllStudents(sList);
    };
    loadData();
  }, []);

  // Standard 5 Batches configuration
  const STANDARD_5_BATCHES = useMemo(() => [
    { id: "batch_a", name: "A Batch", time: "6:00 AM - 10:00 AM", price: 500, slotKey: "morning" },
    { id: "batch_b", name: "B Batch", time: "10:00 AM - 2:00 PM", price: 500, slotKey: "noon" },
    { id: "batch_c", name: "C Batch", time: "2:00 PM - 6:00 PM", price: 500, slotKey: "afternoon" },
    { id: "batch_d", name: "D Batch", time: "6:00 PM - 10:00 PM", price: 500, slotKey: "evening" },
    { id: "batch_all", name: "All Batch", time: "6:00 AM - 10:00 PM", price: 1500, slotKey: "all" },
  ], []);

  // Use loaded batches or fallback to standard 5
  const displayBatches = useMemo(() => {
    if (batches.length > 0) {
      // Ensure only standard 5 or mapped batches
      const map = {};
      batches.forEach((b) => {
        const str = (b.name || b.time || "").toLowerCase();
        if (str.includes("all")) map["all"] = b;
        else if (str.includes("a batch") || str.includes("6:00 am - 10:00 am")) map["a"] = b;
        else if (str.includes("b batch") || str.includes("10:00 am - 2:00 pm")) map["b"] = b;
        else if (str.includes("c batch") || str.includes("2:00 pm - 6:00 pm")) map["c"] = b;
        else if (str.includes("d batch") || str.includes("6:00 pm - 10:00 pm")) map["d"] = b;
      });

      return [
        map["a"] || STANDARD_5_BATCHES[0],
        map["b"] || STANDARD_5_BATCHES[1],
        map["c"] || STANDARD_5_BATCHES[2],
        map["d"] || STANDARD_5_BATCHES[3],
        map["all"] || STANDARD_5_BATCHES[4],
      ];
    }
    return STANDARD_5_BATCHES;
  }, [batches, STANDARD_5_BATCHES]);

  // Calculate total fee based on selected batches
  useEffect(() => {
    if (displayBatches.length > 0) {
      const isAll = formData.batch.includes("All Batch") || formData.batch.includes("6:00 AM - 10:00 PM");
      if (isAll) {
        const allB = displayBatches.find((b) => b.name === "All Batch" || b.time === "6:00 AM - 10:00 PM");
        setFormData((prev) => ({ ...prev, totalAmount: Number(allB?.price || 1500) }));
      } else {
        const selected = displayBatches.filter(
          (b) => formData.batch.includes(b.time) || formData.batch.includes(b.name)
        );
        const total = selected.reduce((sum, b) => sum + Number(b.price || 0), 0);
        setFormData((prev) => ({ ...prev, totalAmount: total }));
      }
    }
  }, [formData.batch, displayBatches]);

  // Compute selected batch slots ("morning", "noon", "afternoon", "evening")
  const targetSlots = useMemo(() => {
    return getSlotsFromBatch(formData.batch);
  }, [formData.batch]);

  // Compute availability matrix for all 100 seats based on targetSlots
  const seatOccupancyMap = useMemo(() => {
    const map = {};

    for (let n = 1; n <= 100; n++) {
      const seatStudents = allStudents.filter(
        (s) => Number(s.seatNumber) === n && s.id !== student?.id
      );

      let isOccupied = false;
      let conflictingStudent = null;
      let conflictingSlots = [];

      for (const st of seatStudents) {
        const stSlots = getSlotsFromBatch(st.batch);
        const overlapping = targetSlots.filter((slot) => stSlots.includes(slot));

        if (overlapping.length > 0) {
          isOccupied = true;
          conflictingStudent = st;
          overlapping.forEach((sId) => {
            const bObj = BASE_SLOTS.find((b) => b.id === sId);
            if (bObj && !conflictingSlots.includes(bObj.name)) {
              conflictingSlots.push(bObj.name);
            }
          });
        }
      }

      map[n] = {
        seatNumber: n,
        isOccupied,
        conflictingStudent,
        conflictingSlots,
        statusText: isOccupied
          ? `🔒 Occupied in ${conflictingSlots.join(", ")} by ${conflictingStudent?.name}`
          : "✅ Available",
      };
    }

    return map;
  }, [allStudents, targetSlots, student?.id]);

  // Filtered seats list based on showAvailableOnly toggle
  const visibleSeats = useMemo(() => {
    const list = [];
    for (let n = 1; n <= 100; n++) {
      const data = seatOccupancyMap[n];
      if (!showAvailableOnly || !data.isOccupied || n === formData.seatNumber) {
        list.push(data);
      }
    }
    return list;
  }, [seatOccupancyMap, showAvailableOnly, formData.seatNumber]);

  // Conflict warning check for currently selected seat
  useEffect(() => {
    if (formData.seatNumber > 0 && formData.batch.length > 0) {
      const seatInfo = seatOccupancyMap[formData.seatNumber];
      if (seatInfo && seatInfo.isOccupied) {
        setConflictWarning(
          `Seat ${formData.seatNumber} is occupied in ${seatInfo.conflictingSlots.join(", ")} by ${seatInfo.conflictingStudent?.name}. Please choose another seat.`
        );
      } else {
        setConflictWarning("");
      }
    } else {
      setConflictWarning("");
    }
  }, [formData.seatNumber, formData.batch, seatOccupancyMap]);

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

  // Handle batch selection & "All Batch" auto-checking rule
  const handleBatchToggle = (batchObj) => {
    const bName = batchObj.name;
    const bTime = batchObj.time;
    const isAllBatch = bName === "All Batch" || bTime === "6:00 AM - 10:00 PM";

    setFormData((prev) => {
      let currentBatches = [...prev.batch];

      if (isAllBatch) {
        if (currentBatches.includes("All Batch") || currentBatches.includes("6:00 AM - 10:00 PM")) {
          // Deselect All Batch -> Clear selection
          return { ...prev, batch: [] };
        } else {
          // Select All Batch -> Auto assign A, B, C, D and All Batch
          return {
            ...prev,
            batch: [
              "A Batch",
              "B Batch",
              "C Batch",
              "D Batch",
              "All Batch",
              "6:00 AM - 10:00 AM",
              "10:00 AM - 2:00 PM",
              "2:00 PM - 6:00 PM",
              "6:00 PM - 10:00 PM",
              "6:00 AM - 10:00 PM",
            ],
          };
        }
      } else {
        // Individual batch checkbox toggle
        const exists = currentBatches.includes(bName) || currentBatches.includes(bTime);
        if (exists) {
          currentBatches = currentBatches.filter(
            (b) => b !== bName && b !== bTime && b !== "All Batch" && b !== "6:00 AM - 10:00 PM"
          );
        } else {
          currentBatches.push(bName);
          currentBatches.push(bTime);
        }
        return { ...prev, batch: currentBatches };
      }
    });
  };

  const isAllBatchSelected = useMemo(() => {
    return formData.batch.includes("All Batch") || formData.batch.includes("6:00 AM - 10:00 PM");
  }, [formData.batch]);

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
    if (formData.seatNumber > 0 && formData.batch.length > 0) {
      const freshStudents = await getStudents();
      const res = checkSeatConflict(
        formData.seatNumber,
        formData.batch,
        student?.id,
        freshStudents
      );
      if (res.conflict) {
        setConflictWarning("This seat has just been assigned to another student. Please choose another seat.");
        alert("This seat has just been assigned to another student. Please choose another seat.");
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
              placeholder="e.g. Ranu Sharma"
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

          {/* Batches Selection (Strictly 5 Standard Batches) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-400">
                Select Batch Shift(s) <span className="text-[11px] text-slate-500">(Check multiple if needed)</span>
              </label>
              {isAllBatchSelected && (
                <span className="text-[10px] text-amber-400 font-bold">
                  ⚡ All Batches (A, B, C, D) Auto-Selected
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              {displayBatches.map((b) => {
                const isAllThis = b.name === "All Batch" || b.time === "6:00 AM - 10:00 PM";
                const isChecked =
                  formData.batch.includes(b.time) ||
                  formData.batch.includes(b.name) ||
                  (isAllBatchSelected && !isAllThis);
                
                const isDisabled = mode === "payment" || (isAllBatchSelected && !isAllThis);

                return (
                  <label
                    key={b.id || b.name}
                    className={clsx(
                      "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                      isChecked
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400",
                      isDisabled && !isAllThis && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={isDisabled}
                      checked={isChecked}
                      onChange={() => handleBatchToggle(b)}
                      className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                    />
                    <div className="flex-1 flex items-center justify-between text-xs">
                      <span className="font-bold">{b.name} <span className="font-normal text-slate-400">({b.time})</span></span>
                      <span className="font-semibold text-emerald-400">₹{b.price}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* BATCH-AWARE SEAT SELECTOR */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  Seat Allocation
                  {formData.seatNumber > 0 && (
                    <span className="text-emerald-400 font-semibold text-[11px]">
                      (#Seat {formData.seatNumber})
                    </span>
                  )}
                </label>
                <p className="text-[10px] text-slate-400">
                  {targetSlots.length > 0
                    ? `Checking slots for: ${targetSlots.map((s) => s.toUpperCase()).join(", ")}`
                    : "Choose a batch first"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAvailableOnly(!showAvailableOnly)}
                className={clsx(
                  "px-2.5 py-1 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition-all active:scale-95",
                  showAvailableOnly
                    ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                )}
              >
                <Filter size={12} />
                <span>{showAvailableOnly ? "Available Only" : "Show All (100)"}</span>
              </button>
            </div>

            {/* Dropdown Selector */}
            <div>
              <select
                value={formData.seatNumber}
                onChange={(e) => setFormData({ ...formData, seatNumber: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={0}>-- No Seat Assigned --</option>
                {Object.values(seatOccupancyMap).map((seat) => (
                  <option
                    key={seat.seatNumber}
                    value={seat.seatNumber}
                    disabled={seat.isOccupied && seat.seatNumber !== formData.seatNumber}
                  >
                    Seat #{seat.seatNumber} - {seat.statusText}
                  </option>
                ))}
              </select>
            </div>

            {/* Scrollable Visual Seat Cards */}
            <div className="overflow-x-auto custom-scrollbar-hidden py-1 flex gap-2 snap-x">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, seatNumber: 0 })}
                className={clsx(
                  "flex-shrink-0 min-w-[56px] h-12 rounded-xl border text-xs font-semibold transition-all snap-center flex items-center justify-center",
                  formData.seatNumber === 0
                    ? "bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/30 scale-105"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                )}
              >
                None
              </button>

              {visibleSeats.map((seat) => {
                const isSelected = formData.seatNumber === seat.seatNumber;
                const isOccupied = seat.isOccupied && !isSelected;

                return (
                  <button
                    key={seat.seatNumber}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => setFormData({ ...formData, seatNumber: seat.seatNumber })}
                    title={seat.statusText}
                    className={clsx(
                      "flex-shrink-0 min-w-[56px] h-12 rounded-xl border text-xs font-semibold transition-all snap-center flex flex-col items-center justify-center relative",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30 scale-105 font-bold"
                        : isOccupied
                        ? "bg-slate-950/40 border-slate-800/80 text-slate-600 cursor-not-allowed opacity-60"
                        : "bg-slate-900 border-emerald-500/30 text-slate-200 hover:border-emerald-500"
                    )}
                  >
                    <span className="flex items-center gap-0.5">
                      {isOccupied && <Lock size={10} className="text-slate-500" />}
                      {seat.seatNumber}
                    </span>
                    <span className="text-[8px] opacity-80">
                      {isSelected ? "Selected" : isOccupied ? "Occupied" : "Free"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Hint Line */}
            {formData.seatNumber > 0 && seatOccupancyMap[formData.seatNumber] && (
              <p className="text-[10px] text-slate-400 italic">
                {seatOccupancyMap[formData.seatNumber].statusText}
              </p>
            )}
          </div>

          {/* Financials & Dates with Automatic Today / 1-Month Defaults */}
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
