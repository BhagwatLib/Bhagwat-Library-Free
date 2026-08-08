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
import { subscribeBatches, saveBatchInFirestore, deleteBatchFromFirestore } from "../services/batchesService";
import { subscribeStudents } from "../services/studentsService";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { ConfirmModal } from "../components/ConfirmModal";
import { clsx } from "clsx";

export const BatchList = () => {
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
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

      {/* Batch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {batchMetrics.map((batch) => (
          <SaaSCard key={batch.id} className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-purple-500/10 border border-purple-500/20 text-purple-300 px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <Clock size={13} />
                  <span>{batch.name || batch.time}</span>
                </div>
                <Badge variant={batch.status === "Active" ? "success" : "default"}>
                  {batch.status || "Active"}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(batch)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Edit Batch"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => setBatchToDelete(batch.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Delete Batch"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">{batch.time}</h3>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-slate-400">
                  Duration: <span className="font-semibold text-slate-200">{batch.duration || "4 Hours"}</span>
                </span>
                <span className="text-slate-400">
                  Monthly Fee: <span className="font-bold text-emerald-400">₹{batch.price}</span>
                </span>
              </div>
              {batch.description && (
                <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-1 italic">
                  {batch.description}
                </p>
              )}
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-slate-400 text-[10px]">Enrolled Students</p>
                <p className="text-sm font-bold text-white mt-0.5 flex items-center gap-1">
                  <Users size={14} className="text-blue-400" /> {batch.studentsCount}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-slate-400 text-[10px]">Seats Occupied</p>
                <p className="text-sm font-bold text-white mt-0.5 flex items-center gap-1">
                  <Armchair size={14} className="text-purple-400" /> {batch.seatsUsedCount}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-slate-400 text-[10px]">Revenue Generated</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                  <TrendingUp size={14} /> ₹{batch.batchRevenue}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-slate-400 text-[10px]">Batch Occupancy</p>
                <p className="text-sm font-bold text-cyan-400 mt-0.5">
                  {batch.occupancyRate}%
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                <span>Capacity Fill Rate</span>
                <span>{batch.studentsCount}/100</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">
                {editingBatch ? "Edit Batch Details" : "Add New Batch Shift"}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Batch Name (e.g. A Batch, Morning Shift)
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g. A Batch"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Batch Timing (e.g. 6:00 AM - 10:00 AM)
                </label>
                <input
                  type="text"
                  required
                  value={formData.time}
                  onChange={(e) =>
                    setFormData({ ...formData, time: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g. 6:00 AM - 10:00 AM"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="4 Hours"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none h-14"
                  placeholder="Brief description of this study shift..."
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 bg-slate-800 text-slate-300 font-semibold py-2.5 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-purple-500/20 active:scale-95 transition-all flex items-center justify-center gap-1"
                >
                  <Save size={16} /> Save Batch
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

