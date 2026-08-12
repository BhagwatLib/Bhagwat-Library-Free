import React from "react";
import { Users, Phone, Armchair, Edit2, Trash2, Eye } from "lucide-react";
import { Badge } from "./Badge";
import { SaaSCard } from "./SaaSCard";
import { clsx } from "clsx";

export const StudentMobileCard = ({ student, onView, onEdit, onDelete }) => {
  const status =
    student.status ||
    (student.paidAmount >= student.totalAmount && student.totalAmount > 0
      ? "Paid"
      : student.paidAmount > 0
      ? "Partial"
      : "Unpaid");

  return (
    <SaaSCard className="p-4 space-y-3" withGrip>
      {/* Header Info */}
      <div className="flex items-center justify-between" onClick={onView}>
        <div className="flex items-center gap-3">
          <div className="skeuo-dial w-12 h-12 overflow-hidden flex-shrink-0">
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.name}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <span className="font-black text-sm text-slate-700 dark:text-slate-300">
                {(student.name || "S").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 dark:text-white text-base leading-snug">{student.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 font-semibold">
              <Phone size={12} className="text-blue-500" /> {student.phone}
            </p>
          </div>
        </div>

        <Badge
          dot
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
      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-300 font-bold">
          <Armchair size={13} className="text-blue-500" />
          <span>
            {student.seatNumber > 0 ? `Seat #${student.seatNumber}` : "No Seat Assigned"}
          </span>
        </div>

        <div className="text-slate-550 text-[11px] font-bold truncate max-w-[180px]">
          {Array.isArray(student.batch) ? student.batch.join(", ") : student.batch || "No Batch"}
        </div>
      </div>

      {/* 48px Min Touch Height Action Buttons */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
        <button
          onClick={onView}
          className="skeuo-btn h-12 text-slate-600 dark:text-slate-300 text-xs font-black flex items-center justify-center gap-1"
        >
          <Eye size={14} className="text-blue-550" /> View
        </button>
        <button
          onClick={onEdit}
          className="skeuo-btn h-12 text-slate-600 dark:text-slate-300 text-xs font-black flex items-center justify-center gap-1"
        >
          <Edit2 size={14} className="text-amber-500" /> Edit
        </button>
        <button
          onClick={onDelete}
          className="skeuo-btn h-12 text-rose-500 text-xs font-black flex items-center justify-center gap-1"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </SaaSCard>
  );
};
