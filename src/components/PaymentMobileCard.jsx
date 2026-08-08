import React from "react";
import { Users, DollarSign, Bell, Edit2, Calendar } from "lucide-react";
import { Badge } from "./Badge";
import { SaaSCard } from "./SaaSCard";
import { clsx } from "clsx";

export const PaymentMobileCard = ({ student, onEdit, onSendWhatsApp, isSending, onView }) => {
  const status =
    student.status ||
    (student.paidAmount >= student.totalAmount && student.totalAmount > 0
      ? "Paid"
      : student.paidAmount > 0
      ? "Partial"
      : "Unpaid");

  const balance = Math.max(0, (student.totalAmount || 0) - (student.paidAmount || 0));

  const formatLastMessage = (lastMsg) => {
    if (!lastMsg || !lastMsg.sentAt) return null;
    const date = new Date(lastMsg.sentAt);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const typeLabel = lastMsg.type === "invoice" ? "Invoice Sent" : "Reminder Sent";
    return `${typeLabel} on ${dateStr} at ${timeStr}`;
  };

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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
              {Array.isArray(student.batch) ? student.batch.join(", ") : student.batch || "No Batch"}
            </p>
            {student.lastMessageSent && (
              <p className="text-[9px] text-emerald-600 dark:text-cyan-400 font-extrabold mt-1">
                {formatLastMessage(student.lastMessageSent)}
              </p>
            )}
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

      {/* Financial Details Grid */}
      <div className="grid grid-cols-3 gap-2 p-3 text-center text-xs skeuo-inset">
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total Fee</p>
          <p className="font-extrabold text-slate-800 dark:text-white mt-0.5">₹{student.totalAmount || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Paid</p>
          <p className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">₹{student.paidAmount || 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Balance</p>
          <p className="font-extrabold text-rose-500 mt-0.5">₹{balance}</p>
        </div>
      </div>

      {/* Validity Date Range */}
      {student.validityFrom && student.validityTo && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 justify-between font-medium">
          <span className="flex items-center gap-1 font-bold">
            <Calendar size={13} className="text-blue-500" /> Validity:
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-300">
            {student.validityFrom} to {student.validityTo}
          </span>
        </div>
      )}

      {/* 48px Min Touch Height Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onEdit}
          className="skeuo-btn h-12 text-slate-700 dark:text-slate-300 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-md"
        >
          <Edit2 size={14} className="text-blue-550" /> Collect Fee
        </button>

        {status === "Paid" ? (
          <button
            disabled={isSending}
            onClick={() => onSendWhatsApp("invoice")}
            className={clsx(
              "skeuo-btn h-12 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all",
              student.lastMessageSent?.type === "invoice"
                ? "opacity-60 cursor-not-allowed"
                : "skeuo-btn-primary"
            )}
          >
            {isSending ? (
              <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-700 border-t-transparent rounded-full" />
            ) : student.lastMessageSent?.type === "invoice" ? (
              "✓ Sent"
            ) : (
              "Send Invoice"
            )}
          </button>
        ) : (
          <button
            disabled={isSending}
            onClick={() => onSendWhatsApp("reminder")}
            className={clsx(
              "skeuo-btn h-12 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all",
              student.lastMessageSent?.type === "reminder"
                ? "opacity-60 cursor-not-allowed"
                : "skeuo-btn-danger"
            )}
          >
            {isSending ? (
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : student.lastMessageSent?.type === "reminder" ? (
              "✓ Sent"
            ) : (
              "Send Reminder"
            )}
          </button>
        )}
      </div>
    </SaaSCard>
  );
};
