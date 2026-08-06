import React, { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  DollarSign,
  AlertCircle,
  FileText,
  Bell,
  ChevronRight,
  CheckCircle2,
  ListTodo,
} from "lucide-react";
import { SaaSCard } from "./SaaSCard";

export const TodaysTasksWidget = ({ students = [], onTabChange, onFilterAlerts }) => {
  const taskMetrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiredCount = 0;
    let expiringWithin2DaysCount = 0;
    let unpaidCount = 0;
    let partialCount = 0;
    let pendingInvoicesCount = 0;

    students.forEach((s) => {
      // Expiry parsing
      if (s.validityTo) {
        const expiry = new Date(s.validityTo);
        if (!isNaN(expiry.getTime())) {
          expiry.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) expiredCount++;
          else if (diffDays >= 0 && diffDays <= 2) expiringWithin2DaysCount++;
        }
      }

      // Payment parsing
      const paid = Number(s.paidAmount || 0);
      const total = Number(s.totalAmount || 0);
      if (paid === 0) {
        unpaidCount++;
        pendingInvoicesCount++;
      } else if (paid > 0 && paid < total) {
        partialCount++;
        pendingInvoicesCount++;
      }
    });

    const pendingRemindersCount = expiredCount + expiringWithin2DaysCount + unpaidCount + partialCount;

    return [
      {
        id: "expired_memberships",
        title: "Memberships Expired",
        count: expiredCount,
        colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        badgeBg: "bg-rose-950 text-rose-300 border-rose-800",
        icon: AlertTriangle,
        badgePrefix: "🔴",
        onClick: () => {
          if (onFilterAlerts) onFilterAlerts("Expired");
        },
      },
      {
        id: "expiring_2days",
        title: "Expiring Within 2 Days",
        count: expiringWithin2DaysCount,
        colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/30",
        badgeBg: "bg-amber-950/80 text-amber-300 border-amber-700/60",
        icon: Clock,
        badgePrefix: "🟡",
        onClick: () => {
          if (onFilterAlerts) onFilterAlerts("Within 2 Days");
        },
      },
      {
        id: "unpaid_students",
        title: "Unpaid Students",
        count: unpaidCount,
        colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        badgeBg: "bg-rose-900/60 text-rose-300 border-rose-700/60",
        icon: DollarSign,
        badgePrefix: "💰",
        onClick: () => onTabChange("payments"),
      },
      {
        id: "partial_students",
        title: "Partially Paid Students",
        count: partialCount,
        colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/30",
        badgeBg: "bg-amber-900/60 text-amber-300 border-amber-700/60",
        icon: AlertCircle,
        badgePrefix: "⚠",
        onClick: () => onTabChange("payments"),
      },
      {
        id: "pending_invoices",
        title: "Pending Invoices",
        count: pendingInvoicesCount,
        colorClass: "text-blue-400 bg-blue-500/10 border-blue-500/30",
        badgeBg: "bg-blue-950 text-blue-300 border-blue-800",
        icon: FileText,
        badgePrefix: "📄",
        onClick: () => onTabChange("payments"),
      },
      {
        id: "pending_reminders",
        title: "Pending Reminders",
        count: pendingRemindersCount,
        colorClass: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
        badgeBg: "bg-indigo-950 text-indigo-300 border-indigo-800",
        icon: Bell,
        badgePrefix: "🔔",
        onClick: () => onTabChange("communication"),
      },
    ];
  }, [students, onTabChange, onFilterAlerts]);

  return (
    <SaaSCard className="p-5 md:p-6 bg-slate-900/90 border-slate-800 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <ListTodo className="text-blue-400" size={20} /> Today's Tasks
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Actionable items requiring admin attention today (Click row to navigate)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {taskMetrics.map((task) => {
          const Icon = task.icon;
          return (
            <button
              key={task.id}
              onClick={task.onClick}
              className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 hover:border-blue-500/40 hover:bg-slate-900 transition-all flex items-center justify-between group text-left cursor-pointer shadow-sm"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${task.colorClass}`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-xs text-slate-200 group-hover:text-white truncate">
                    {task.title}
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium group-hover:text-blue-400 transition-colors flex items-center gap-0.5 mt-0.5">
                    Action required <ChevronRight size={12} />
                  </span>
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-xl text-xs font-extrabold border shrink-0 flex items-center space-x-1 ${task.badgeBg}`}
              >
                <span>{task.badgePrefix}</span>
                <span>{task.count}</span>
              </div>
            </button>
          );
        })}
      </div>
    </SaaSCard>
  );
};
