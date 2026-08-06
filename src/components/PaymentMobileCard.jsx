import React from "react";
import { Users, DollarSign, Bell, Edit2, Calendar } from "lucide-react";
import { Badge } from "./Badge";
import { SaaSCard } from "./SaaSCard";

export const PaymentMobileCard = ({ student, onEdit, onReminder, onView }) => {
  const status =
    student.status ||
    (student.paidAmount >= student.totalAmount && student.totalAmount > 0
      ? "Paid"
      : student.paidAmount > 0
      ? "Partial"
      : "Unpaid");

  const balance = Math.max(0, (student.totalAmount || 0) - (student.paidAmount || 0));

  return (
    <SaaSCard className="p-4 space-y-3">
      {/* Header Info */}
      <div className="flex items-center justify-between" onClick={onView}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0">
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Users size={22} className="text-slate-400" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-white text-base leading-snug">{student.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {Array.isArray(student.batch) ? student.batch.join(", ") : student.batch || "No Batch"}
            </p>
          </div>
        </div>

        <Badge
          variant={
            status === "Paid"
              ? "success"
              : status === "Partial"
              ? "warning"
              : "danger"
          }
        >
          {status}
        </Badge>
      </div>

      {/* Financial Details Grid */}
      <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs">
        <div>
          <p className="text-[10px] text-slate-400 font-medium">Total Fee</p>
          <p className="font-bold text-white mt-0.5">₹{student.totalAmount || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-medium">Paid</p>
          <p className="font-bold text-emerald-400 mt-0.5">₹{student.paidAmount || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-medium">Balance</p>
          <p className="font-bold text-rose-400 mt-0.5">₹{balance}</p>
        </div>
      </div>

      {/* Validity Date Range */}
      {student.validityFrom && student.validityTo && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 justify-between">
          <span className="flex items-center gap-1">
            <Calendar size={13} className="text-blue-400" /> Validity:
          </span>
          <span className="font-semibold text-slate-200">
            {student.validityFrom} to {student.validityTo}
          </span>
        </div>
      )}

      {/* 48px Min Touch Height Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onEdit}
          className="h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-600/20"
        >
          <Edit2 size={16} /> Collect Payment
        </button>
        <button
          onClick={onReminder}
          disabled={balance === 0}
          className="h-12 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Bell size={16} /> Send Reminder
        </button>
      </div>
    </SaaSCard>
  );
};
