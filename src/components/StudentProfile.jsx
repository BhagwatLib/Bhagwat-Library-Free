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
} from "lucide-react";
import { clsx } from "clsx";
import { updateStudentPayment } from "../utils/store";
import { getSlotsFromBatch, BASE_SLOTS } from "../utils/seatLogic";
import { Badge } from "./Badge";
import { BottomSheet } from "./BottomSheet";

export const StudentProfile = ({ student, onClose, onUpdate, onEdit }) => {
  const [activeMobileTab, setActiveMobileTab] = useState("overview");
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paidAmount, setPaidAmount] = useState(student?.paidAmount || 0);
  const [error, setError] = useState("");

  if (!student) return null;

  const studentSlots = getSlotsFromBatch(student.batch);

  const handleSavePayment = async () => {
    const amount = parseFloat(paidAmount);
    if (isNaN(amount) || amount < 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (amount > student.totalAmount) {
      setError("Paid amount cannot exceed total amount");
      return;
    }

    const updatedStudent = await updateStudentPayment(student.id, amount);
    if (updatedStudent) {
      setIsEditingPayment(false);
      setError("");
      onUpdate?.();
    }
  };

  const balance = Math.max(0, (student.totalAmount || 0) - (paidAmount || 0));

  let daysRemaining = null;
  if (student.validityTo) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(student.validityTo);
    const diffTime = expiry - today;
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return (
    <BottomSheet isOpen={!!student} onClose={onClose} title={student.name}>
      {/* Student Banner */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
            {student.photo ? (
              <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
            ) : (
              <User size={28} className="text-slate-400" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-white text-base">{student.name}</h3>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Phone size={12} /> {student.phone}
            </p>
          </div>
        </div>

        <button
          onClick={onEdit}
          className="h-10 px-3 rounded-xl bg-blue-600/20 text-blue-300 font-semibold text-xs flex items-center gap-1 active:scale-95 transition-all"
        >
          <Edit2 size={14} /> Edit
        </button>
      </div>

      {/* 4 Android Profile Tabs: Overview, Payments, Attendance, History */}
      <div className="flex items-center justify-around border-b border-slate-800 pb-1">
        {[
          { id: "overview", label: "Overview", icon: User },
          { id: "payments", label: "Payments", icon: CreditCard },
          { id: "attendance", label: "Attendance", icon: CalendarCheck },
          { id: "history", label: "History", icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSel = activeMobileTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveMobileTab(tab.id)}
              className={clsx(
                "flex flex-col items-center py-2 px-3 border-b-2 text-xs font-semibold transition-all",
                isSel
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              )}
            >
              <Icon size={16} className="mb-0.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeMobileTab === "overview" && (
        <div className="space-y-4 pt-2">
          {/* Seat & Validity Card */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <p className="text-slate-400">Assigned Seat</p>
              <p className="font-bold text-white text-sm mt-0.5">
                {student.seatNumber > 0 ? `Seat #${student.seatNumber}` : "No Seat"}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <p className="text-slate-400">Validity Status</p>
              <p className="font-bold text-emerald-400 text-sm mt-0.5">
                {daysRemaining !== null
                  ? daysRemaining >= 0
                    ? `${daysRemaining} Days Left`
                    : "Expired"
                  : "Active"}
              </p>
            </div>
          </div>

          {/* Occupied Shift Slots */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Clock size={14} className="text-blue-400" /> Shift Batches
            </p>
            <div className="grid grid-cols-2 gap-2">
              {BASE_SLOTS.map((slot) => {
                const isOccupied = studentSlots.includes(slot.id);
                return (
                  <div
                    key={slot.id}
                    className={clsx(
                      "p-2 rounded-xl border text-xs flex flex-col transition-all",
                      isOccupied
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold"
                        : "bg-slate-900/40 border-slate-800/80 text-slate-500"
                    )}
                  >
                    <span>{slot.name}</span>
                    <span className="text-[10px] opacity-80">{slot.time}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Address & Admission */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
            <div className="flex items-start gap-2">
              <MapPin size={15} className="text-slate-400 mt-0.5" />
              <div>
                <p className="text-slate-500 font-medium">Address</p>
                <p className="font-semibold text-white">{student.address || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-2 border-t border-slate-800">
              <Calendar size={15} className="text-slate-400 mt-0.5" />
              <div>
                <p className="text-slate-500 font-medium">Admission Date</p>
                <p className="font-semibold text-white">{student.admissionDate || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Payments */}
      {activeMobileTab === "payments" && (
        <div className="space-y-3 pt-2">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Total Course Fee</span>
              <span className="font-bold text-white text-sm">₹{student.totalAmount || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Paid Amount</span>
              <span className="font-bold text-emerald-400 text-sm">₹{student.paidAmount || 0}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
              <span className="text-slate-400">Pending Dues</span>
              <span className="font-bold text-rose-400 text-sm">₹{balance}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Attendance */}
      {activeMobileTab === "attendance" && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2 pt-2">
          <CalendarCheck size={28} className="text-emerald-400 mx-auto" />
          <h4 className="font-bold text-white text-sm">Attendance Summary</h4>
          <p className="text-xs text-slate-400">
            Attendance logging is active for current membership period.
          </p>
        </div>
      )}

      {/* TAB CONTENT: History */}
      {activeMobileTab === "history" && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs pt-2">
          <p className="font-semibold text-slate-400">Audit History</p>
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between">
            <span className="text-white">Registered</span>
            <span className="text-slate-400">{student.admissionDate || "N/A"}</span>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
