import React, { useState } from "react";
import {
  User,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Edit2,
  Check,
  XCircle,
  Armchair,
  Clock,
  ShieldCheck,
  History,
  CalendarCheck,
  DollarSign,
  AlertCircle,
  Save,
} from "lucide-react";
import { clsx } from "clsx";
import { updateStudentPayment } from "../utils/store";
import { getSlotsFromBatch, BASE_SLOTS } from "../utils/seatLogic";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";
import { SaaSCard } from "./SaaSCard";

export const StudentProfile = ({ student, onClose, onUpdate, onEdit }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paidAmount, setPaidAmount] = useState(student?.paidAmount || 0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  if (!student) return null;

  const studentSlots = getSlotsFromBatch(student.batch);

  const handleSavePayment = async (e) => {
    e?.preventDefault();
    const amount = parseFloat(paidAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Please enter a valid payment amount");
      return;
    }
    if (amount > student.totalAmount) {
      setError("Paid amount cannot exceed total membership fee");
      return;
    }

    setIsSaving(true);
    try {
      const updatedStudent = await updateStudentPayment(student.id, amount);
      if (updatedStudent) {
        setIsEditingPayment(false);
        setError("");
        onUpdate?.();
      }
    } catch (err) {
      setError(err.message || "Failed to update payment");
    } finally {
      setIsSaving(false);
    }
  };

  const balance = Math.max(0, (student.totalAmount || 0) - (student.paidAmount || 0));

  let daysRemaining = null;
  if (student.validityTo) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(student.validityTo);
    const diffTime = expiry - today;
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const paymentStatus =
    student.status ||
    (student.paidAmount >= student.totalAmount && student.totalAmount > 0
      ? "Paid"
      : student.paidAmount > 0
      ? "Partial"
      : "Unpaid");

  return (
    <BottomSheet isOpen={!!student} onClose={onClose} title="Student Profile Overview">
      <div className="space-y-5">
        {/* Student Banner Card (Adaptive Grid) */}
        <div className="skeuo-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="skeuo-dial w-14 h-14 sm:w-16 sm:h-16 overflow-hidden flex-shrink-0 glow-purple">
              {student.photo ? (
                <img src={student.photo} alt={student.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="font-black text-lg text-slate-700 dark:text-slate-300">
                  {(student.name || "S").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-base sm:text-lg">
                  {student.name}
                </h3>
                <Badge dot variant={paymentStatus === "Paid" ? "success" : paymentStatus === "Partial" ? "warning" : "danger"}>
                  {paymentStatus}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-medium">
                <Phone size={13} className="text-blue-500" /> {student.phone}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {student.address || "No address specified"}
              </p>
            </div>
          </div>

          <button
            onClick={onEdit}
            className="skeuo-btn px-4 py-2 text-xs font-bold flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
          >
            <Edit2 size={13} className="text-blue-500" /> Edit Record
          </button>
        </div>

        {/* Tactile Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto custom-scrollbar">
          {[
            { id: "overview", label: "Overview & Shifts", icon: User },
            { id: "payments", label: "Fee & Billing Ledger", icon: CreditCard },
            { id: "history", label: "Activity Log", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "skeuo-badge px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-all flex items-center gap-2 rounded-xl whitespace-nowrap",
                  isSel
                    ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40 font-black"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW & SHIFTS */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Quick Metrics (2-column on mobile, 3-column on tablet/desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="skeuo-inset p-3.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Assigned Seat
                </span>
                <p className="font-black text-slate-800 dark:text-white text-base mt-1 flex items-center gap-1.5">
                  <Armchair size={15} className="text-blue-500" />
                  {student.seatNumber > 0 ? `Seat #${student.seatNumber}` : "Unassigned"}
                </p>
              </div>

              <div className="skeuo-inset p-3.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Membership Validity
                </span>
                <p className={clsx("font-black text-base mt-1", daysRemaining !== null && daysRemaining <= 3 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400")}>
                  {daysRemaining !== null
                    ? daysRemaining >= 0
                      ? `${daysRemaining} Days Left`
                      : "Expired"
                    : "Active"}
                </p>
              </div>

              <div className="skeuo-inset p-3.5 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Admission Date
                </span>
                <p className="font-extrabold text-slate-800 dark:text-white text-sm mt-1 flex items-center gap-1.5">
                  <Calendar size={14} className="text-purple-500" />
                  {student.admissionDate || "N/A"}
                </p>
              </div>
            </div>

            {/* Occupied Shift Slots Grid */}
            <div className="skeuo-card p-4 space-y-3" withGrip>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} className="text-blue-500" /> Allocated Shifts & Timing
                </p>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {studentSlots.length} / 4 Slots Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BASE_SLOTS.map((slot) => {
                  const isOccupied = studentSlots.includes(slot.id);
                  return (
                    <div
                      key={slot.id}
                      className={clsx(
                        "p-3 rounded-xl border text-xs flex items-center justify-between transition-all",
                        isOccupied
                          ? "skeuo-dial bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "skeuo-inset text-slate-400 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold">{slot.slotCode}</span>
                        <div>
                          <span className="font-bold block">{slot.name}</span>
                          <span className="text-[10px] opacity-75">{slot.time}</span>
                        </div>
                      </div>
                      <span className="text-[11px]">{isOccupied ? "🟢 Active" : "⚪"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Registration Details */}
            <div className="skeuo-inset p-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <MapPin size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Residential Address</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{student.address || "None specified"}</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <CalendarCheck size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Validity Window</span>
                  <span className="font-semibold text-slate-800 dark:text-white">
                    {student.validityFrom || student.admissionDate || "N/A"} → {student.validityTo || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FEE & BILLING LEDGER */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="skeuo-card p-5 space-y-4" withGrip>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={15} className="text-emerald-500" /> Ledger Breakdown
                </span>
                <button
                  onClick={() => setIsEditingPayment(!isEditingPayment)}
                  className="skeuo-badge px-3 py-1 text-[10px] text-blue-600 dark:text-cyan-400 cursor-pointer"
                >
                  {isEditingPayment ? "Cancel Edit" : "Update Payment"}
                </button>
              </div>

              {/* Payment Summary Metrics */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="skeuo-inset p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Fee</span>
                  <span className="font-black text-sm text-slate-800 dark:text-white mt-1 block">₹{student.totalAmount || 0}</span>
                </div>
                <div className="skeuo-inset p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Paid</span>
                  <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 mt-1 block">₹{student.paidAmount || 0}</span>
                </div>
                <div className="skeuo-inset p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Balance</span>
                  <span className="font-black text-sm text-rose-500 mt-1 block">₹{balance}</span>
                </div>
              </div>

              {/* Inset Payment Update Form */}
              {isEditingPayment && (
                <form onSubmit={handleSavePayment} className="skeuo-inset p-4 space-y-3 animate-in fade-in">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-white uppercase tracking-wider block">
                    Record New Paid Amount
                  </span>
                  <div>
                    <input
                      type="number"
                      min="0"
                      max={student.totalAmount || 5000}
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="skeuo-input w-full px-3.5 py-2.5 text-xs font-bold"
                      placeholder="Enter updated paid amount"
                    />
                    {error && <p className="text-rose-500 text-[10px] font-bold mt-1">{error}</p>}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditingPayment(false)}
                      className="skeuo-btn px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="skeuo-btn skeuo-btn-primary px-4 py-1.5 text-xs flex items-center gap-1"
                    >
                      <Save size={13} /> {isSaving ? "Saving..." : "Save Payment"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ACTIVITY & AUDIT LOG */}
        {activeTab === "history" && (
          <div className="skeuo-card p-5 space-y-3" withGrip>
            <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} className="text-purple-500" /> Student Timeline
            </span>
            <div className="space-y-2">
              <div className="skeuo-inset p-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-white">Admission Registered</span>
                <span className="text-slate-400 text-[11px]">{student.admissionDate || "N/A"}</span>
              </div>
              <div className="skeuo-inset p-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-white">Seat Assignment</span>
                <span className="text-slate-400 text-[11px]">{student.seatNumber > 0 ? `Seat #${student.seatNumber}` : "None"}</span>
              </div>
              <div className="skeuo-inset p-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-white">Validity Expiry Date</span>
                <span className="text-slate-400 text-[11px]">{student.validityTo || "N/A"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
