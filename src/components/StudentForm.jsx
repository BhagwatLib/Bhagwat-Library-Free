import React from "react";
import { X, Save, Edit2, Camera, Loader2, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { saveStudent, getBatches, getStudents } from "../utils/store";
import { checkSeatConflict } from "../utils/seatLogic";
import { CameraCapture } from "./CameraCapture";

export const StudentForm = ({
  student,
  onClose,
  onSuccess,
  mode = "personal",
}) => {
  const [batches, setBatches] = React.useState([]);
  const [allStudents, setAllStudents] = React.useState([]);
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [conflictWarning, setConflictWarning] = React.useState("");

  React.useEffect(() => {
    const loadData = async () => {
      const bList = await getBatches();
      const sList = await getStudents();
      setBatches(bList);
      setAllStudents(sList);
    };
    loadData();
  }, []);

  const [formData, setFormData] = React.useState({
    name: student?.name || "",
    batch: Array.isArray(student?.batch)
      ? student.batch
      : student?.batch
      ? [student.batch]
      : [],
    phone: student?.phone || "",
    address: student?.address || "",
    admissionDate:
      student?.admissionDate || new Date().toISOString().split("T")[0],
    paidAmount: student?.paidAmount || "",
    totalAmount: student?.totalAmount || "",
    status: student?.status || "Unpaid",
    photo: student?.photo || "",
    validityFrom: student?.validityFrom || "",
    validityTo: student?.validityTo || "",
    seatNumber: student?.seatNumber || 0,
  });

  // Calculate total fee based on selected batches
  React.useEffect(() => {
    if (batches.length > 0) {
      const selectedBatches = batches.filter((b) =>
        formData.batch.includes(b.time)
      );
      const total = selectedBatches.reduce(
        (sum, b) => sum + Number(b.price),
        0
      );
      setFormData((prev) => ({ ...prev, totalAmount: total }));
    }
  }, [formData.batch, batches]);

  // Conflict check whenever seatNumber or batch changes
  React.useEffect(() => {
    if (formData.seatNumber > 0 && formData.batch.length > 0) {
      const res = checkSeatConflict(
        formData.seatNumber,
        formData.batch,
        student?.id,
        allStudents
      );
      if (res.conflict) {
        setConflictWarning(res.message);
      } else {
        setConflictWarning("");
      }
    } else {
      setConflictWarning("");
    }
  }, [formData.seatNumber, formData.batch, allStudents, student?.id]);

  // Calculate status & auto validity
  React.useEffect(() => {
    const paid = Number(formData.paidAmount) || 0;
    const total = Number(formData.totalAmount) || 0;
    const status =
      paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";

    setFormData((prev) => {
      const updates = {};
      if (prev.status !== status) {
        updates.status = status;
      }

      if (status === "Paid" && (!prev.validityFrom || !prev.validityTo)) {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        if (!prev.validityFrom)
          updates.validityFrom = today.toISOString().split("T")[0];
        if (!prev.validityTo)
          updates.validityTo = nextMonth.toISOString().split("T")[0];
      }

      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [formData.paidAmount, formData.totalAmount]);

  // Auto validity date sync
  React.useEffect(() => {
    if (formData.validityFrom) {
      const fromDate = new Date(formData.validityFrom);
      const toDate = new Date(fromDate);
      toDate.setMonth(toDate.getMonth() + 1);

      const newToDate = toDate.toISOString().split("T")[0];
      if (formData.validityTo !== newToDate) {
        setFormData((prev) => ({ ...prev, validityTo: newToDate }));
      }
    }
  }, [formData.validityFrom]);

  const handleBatchToggle = (batchTime) => {
    setFormData((prev) => {
      const currentBatches = prev.batch;
      if (currentBatches.includes(batchTime)) {
        return {
          ...prev,
          batch: currentBatches.filter((b) => b !== batchTime),
        };
      } else {
        return { ...prev, batch: [...currentBatches, batchTime] };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-md rounded-3xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between p-6 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg font-bold text-white">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Photo Section */}
          <div className="flex justify-center mb-2">
            <div className="relative group">
              <div
                className={clsx(
                  "w-24 h-24 rounded-full overflow-hidden bg-slate-800 border-2 border-slate-700 flex items-center justify-center transition-all",
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
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
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
              placeholder="e.g. John Doe"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none h-20"
                  placeholder="e.g. Street Address"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Admission Date
                </label>
                <input
                  type="date"
                  required
                  value={formData.admissionDate}
                  onChange={(e) =>
                    setFormData({ ...formData, admissionDate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </>
          )}

          {/* Seat Picker Dial */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400">
                Seat Number (1 to 100)
              </label>
              <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-bold">
                Seat: {formData.seatNumber > 0 ? formData.seatNumber : "None"}
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar-hidden py-2 flex gap-2 snap-x">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, seatNumber: 0 })}
                className={clsx(
                  "flex-shrink-0 w-11 h-11 rounded-xl border text-xs font-medium transition-all snap-center flex items-center justify-center",
                  formData.seatNumber === 0
                    ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-105"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                )}
              >
                None
              </button>
              {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFormData({ ...formData, seatNumber: n })}
                  className={clsx(
                    "flex-shrink-0 w-11 h-11 rounded-xl border text-xs font-medium transition-all snap-center flex items-center justify-center",
                    formData.seatNumber === n
                      ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-105 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Batches Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Select Batch(es)
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
              {batches.map((b) => (
                <label
                  key={b.id}
                  className={clsx(
                    "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                    formData.batch.includes(b.time)
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400"
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={mode === "payment"}
                    checked={formData.batch.includes(b.time)}
                    onChange={() => handleBatchToggle(b.time)}
                    className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                  />
                  <div className="flex-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{b.time}</span>
                    <span className="font-semibold text-emerald-400">₹{b.price}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Financials & Validity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Total Fee (₹)
              </label>
              <input
                type="number"
                readOnly
                value={formData.totalAmount}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-slate-400 text-xs cursor-not-allowed"
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
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Validity From
              </label>
              <input
                type="date"
                value={formData.validityFrom}
                onChange={(e) =>
                  setFormData({ ...formData, validityFrom: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Validity To
              </label>
              <input
                type="date"
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
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-all text-sm"
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
