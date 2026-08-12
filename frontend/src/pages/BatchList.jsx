import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  IndianRupee,
  Plus,
  Edit2,
  Trash2,
  Users,
  Armchair,
  TrendingUp,
  Save,
  X,
  School,
  CheckCircle2,
  Sparkles,
  Timer,
  FileText,
  Activity,
} from "lucide-react";
import {
  subscribeBatches,
  saveBatchInFirestore,
  deleteBatchFromFirestore,
  resetToDefaultABCDShifts,
} from "../services/batchesService";
import { subscribeStudents } from "../services/studentsService";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { ConfirmModal } from "../components/ConfirmModal";
import { clsx } from "clsx";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";

export const BatchList = () => {
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    time: "",
    price: "",
    duration: "4 Hours",
    description: "",
    status: "Active",
  });
  const [batchToDelete, setBatchToDelete] = useState(null);

  useBodyScrollLock(isFormOpen || Boolean(batchToDelete));


  // Realtime subscription for Universal Batches & Students Data
  useEffect(() => {
    setLoading(true);
    let unsubBatches = () => {};
    let unsubStudents = () => {};

    unsubBatches = subscribeBatches((bList) => {
      setBatches(bList);
      setLoading(false);
    });

    unsubStudents = subscribeStudents((sList) => {
      setStudents(sList);
    });

    return () => {
      unsubBatches();
      unsubStudents();
    };
  }, []);

  // Compute live metrics per batch
  const batchMetrics = useMemo(() => {
    return batches.map((batch) => {
      // Find students in this batch matching either name or time
      const assignedStudents = students.filter((s) => {
        if (!s.batch) return false;
        const bArray = Array.isArray(s.batch) ? s.batch : [s.batch];
        return bArray.some(
          (b) =>
            b === batch.name ||
            b === batch.time ||
            (batch.slotKey === "all" && (b === "All Batch" || b === "All")) ||
            String(b).toLowerCase().includes(String(batch.name || "").toLowerCase())
        );
      });

      const studentsCount = assignedStudents.length;
      const priceNum = Number(batch.price) || 0;
      const batchRevenue = assignedStudents.reduce(
        (sum, s) => sum + (s.paidAmount || 0),
        0
      );

      // Seats used by this batch
      const seatsUsedCount = new Set(
        assignedStudents.filter((s) => s.seatNumber > 0).map((s) => s.seatNumber)
      ).size;

      // Capacity occupancy percentage
      const occupancyRate = Math.min(100, Math.round((studentsCount / 100) * 100));

      return {
        ...batch,
        studentsCount,
        seatsUsedCount,
        batchRevenue,
        occupancyRate,
      };
    });
  }, [batches, students]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await saveBatchInFirestore({
        ...formData,
        id: editingBatch?.id,
        price: Number(formData.price) || 0,
      });
      setIsFormOpen(false);
      setEditingBatch(null);
      setFormData({
        name: "",
        time: "",
        price: "",
        duration: "4 Hours",
        description: "",
        status: "Active",
      });
    } catch (err) {
      alert("Failed to save batch: " + err.message);
    }
  };

  const handleEdit = (batch) => {
    setEditingBatch(batch);
    setFormData({
      name: batch.name || batch.time,
      time: batch.time || "",
      price: batch.price || "",
      duration: batch.duration || "4 Hours",
      description: batch.description || "",
      status: batch.status || "Active",
    });
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (batchToDelete) {
      try {
        await deleteBatchFromFirestore(batchToDelete);
        setBatchToDelete(null);
      } catch (err) {
        alert("Failed to delete batch: " + err.message);
      }
    }
  };

  const handleResetToABCD = async () => {
    if (window.confirm("Standardize all shifts to A Shift, B Shift, C Shift, D Shift, and All Shift in database?")) {
      setIsResetting(true);
      try {
        await resetToDefaultABCDShifts();
      } catch (err) {
        alert("Reset failed: " + err.message);
      } finally {
        setIsResetting(false);
      }
    }
  };

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <School className="text-purple-400" size={26} /> Batches & Time Shifts
          </h1>
          <p className="text-xs text-slate-400">
            Single universal data source for library shifts, timings, monthly fees, and student enrollment
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={isResetting}
            onClick={handleResetToABCD}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95"
            title="Reset shifts to standard ABCD format in database"
          >
            <Sparkles size={15} className="text-amber-400" />
            <span>{isResetting ? "Updating..." : "Reset to ABCD Shifts"}</span>
          </button>

          <button
            onClick={() => {
              setEditingBatch(null);
              setFormData({
                name: "",
                time: "",
                price: "",
                duration: "4 Hours",
                description: "",
                status: "Active",
              });
              setIsFormOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
          >
            <Plus size={16} /> Add New Batch
          </button>
        </div>
      </div>


      {/* Batch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {batchMetrics.map((batch) => (
          <SaaSCard key={batch.id} className="p-6 space-y-4" withGrip>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="skeuo-dial w-8 h-8 font-bold text-xs text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Clock size={14} />
                </div>
                <span className="font-extrabold text-sm text-slate-800 dark:text-white">
                  {batch.name || batch.time}
                </span>
                <Badge dot variant={batch.status === "Active" ? "success" : "default"}>
                  {batch.status || "Active"}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(batch)}
                  className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                  title="Edit Batch"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => setBatchToDelete(batch.id)}
                  className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-rose-500"
                  title="Delete Batch"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">{batch.time}</h3>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-slate-500 dark:text-slate-400">
                  Duration: <span className="font-semibold text-slate-700 dark:text-slate-200">{batch.duration || "4 Hours"}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Monthly Fee: <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{batch.price}</span>
                </span>
              </div>
              {batch.description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-1 italic">
                  {batch.description}
                </p>
              )}
            </div>

            {/* Metrics Breakdown (Skeuomorphic mini boxes) */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="p-2.5 rounded-xl skeuo-inset">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">Enrolled Students</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white mt-0.5 flex items-center gap-1">
                  <Users size={13} className="text-blue-500" /> {batch.studentsCount}
                </p>
              </div>

              <div className="p-2.5 rounded-xl skeuo-inset">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">Seats Occupied</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white mt-0.5 flex items-center gap-1">
                  <Armchair size={13} className="text-purple-500" /> {batch.seatsUsedCount}
                </p>
              </div>

              <div className="p-2.5 rounded-xl skeuo-inset">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">Revenue Generated</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <TrendingUp size={13} /> ₹{batch.batchRevenue}
                </p>
              </div>

              <div className="p-2.5 rounded-xl skeuo-inset">
                <p className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">Batch Occupancy</p>
                <p className="text-sm font-bold text-blue-600 dark:text-cyan-400 mt-0.5">
                  {batch.occupancyRate}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                <span>Capacity Fill Rate</span>
                <span>{batch.studentsCount}/100</span>
              </div>
              <div className="w-full h-2 rounded-full skeuo-inset overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, batch.occupancyRate)}%` }}
                />
              </div>
            </div>
          </SaaSCard>
        ))}
      </div>

      {/* Create / Edit Batch Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200 modal-backdrop-container">
          <div className="skeuo-card w-full max-w-md p-6 space-y-4 shadow-2xl modal-scrollable-content max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                {editingBatch ? "Edit Shift Details" : "Add New Shift"}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="skeuo-dial w-7 h-7 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Shift Name (e.g. A Shift, B Shift, All Shift)
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                  placeholder="e.g. A Shift"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Shift Timing (e.g. 6:00 AM - 10:00 AM)
                </label>
                <input
                  type="text"
                  required
                  value={formData.time}
                  onChange={(e) =>
                    setFormData({ ...formData, time: e.target.value })
                  }
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                  placeholder="e.g. 6:00 AM - 10:00 AM"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                    Monthly Fee (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="skeuo-input w-full px-3 py-2 text-xs font-medium"
                    placeholder="500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: e.target.value })
                    }
                    className="skeuo-input w-full px-3 py-2 text-xs font-medium"
                    placeholder="4 Hours"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Description / Notes (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="skeuo-input w-full px-3 py-2 text-xs font-medium resize-none h-16"
                  placeholder="Brief description of this study shift..."
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="skeuo-btn flex-1 py-2.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="skeuo-btn skeuo-btn-primary flex-1 py-2.5 text-xs flex items-center justify-center gap-1.5"
                >
                  <Save size={14} /> Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!batchToDelete}
        onClose={() => setBatchToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Batch Shift"
        message="Are you sure you want to delete this batch? Enrolled students will retain their existing batch history."
        confirmText="Delete Batch"
      />
    </div>
  );
};

