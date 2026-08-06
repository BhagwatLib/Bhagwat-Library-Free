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
            {student.lastMessageSent && (
              <p className="text-[9px] text-emerald-400 font-semibold mt-1">
                {formatLastMessage(student.lastMessageSent)}
              </p>
            )}
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
          <Edit2 size={16} /> Collect Fee
        </button>

        {status === "Paid" ? (
          <button
            disabled={isSending}
            onClick={() => onSendWhatsApp("invoice")}
            className={clsx(
              "h-12 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border",
              student.lastMessageSent?.type === "invoice"
                ? "bg-slate-800 border-slate-700 text-slate-400"
                : "bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/10"
            )}
          >
            {isSending ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : student.lastMessageSent?.type === "invoice" ? (
              "✓ Invoice Sent"
            ) : (
              "Send Invoice"
            )}
          </button>
        ) : (
          <button
            disabled={isSending}
            onClick={() => onSendWhatsApp("reminder")}
            className={clsx(
              "h-12 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border",
              student.lastMessageSent?.type === "reminder"
                ? "bg-slate-800 border-slate-700 text-slate-400"
                : "bg-amber-600 border-amber-500 hover:bg-amber-500 text-white shadow-md shadow-amber-600/10"
            )}
          >
            {isSending ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : student.lastMessageSent?.type === "reminder" ? (
              "✓ Reminder Sent"
            ) : (
              "Send Reminder"
            )}
          </button>
        )}
      </div>
    </SaaSCard>
  );
};
