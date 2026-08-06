import React from "react";
import { Users, Phone, Armchair, Edit2, Trash2, Eye } from "lucide-react";
import { Badge } from "./Badge";
import { SaaSCard } from "./SaaSCard";

export const StudentMobileCard = ({ student, onView, onEdit, onDelete }) => {
  const status =
    student.status ||
    (student.paidAmount >= student.totalAmount && student.totalAmount > 0
      ? "Paid"
      : student.paidAmount > 0
      ? "Partial"
      : "Unpaid");

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
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Phone size={12} /> {student.phone}
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

      {/* Details Row */}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Armchair size={14} className="text-blue-400" />
          <span className="font-semibold">
            {student.seatNumber > 0 ? `Seat #${student.seatNumber}` : "No Seat"}
          </span>
        </div>

        <div className="text-slate-400 font-medium truncate max-w-[180px]">
          {Array.isArray(student.batch) ? student.batch.join(", ") : student.batch || "No Batch"}
        </div>
      </div>

      {/* 48px Min Touch Height Action Buttons */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
        <button
          onClick={onView}
          className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Eye size={16} /> View
        </button>
        <button
          onClick={onEdit}
          className="h-12 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Edit2 size={16} /> Edit
        </button>
        <button
          onClick={onDelete}
          className="h-12 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>
    </SaaSCard>
  );
};
