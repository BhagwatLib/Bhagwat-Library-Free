import React, { useState, useMemo } from "react";
import {
  Bell,
  AlertTriangle,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { clsx } from "clsx";
import {
  sendMembershipReminder,
  sendBulkReminders,
} from "../services/whatsappService";

export const MembershipAlertsWidget = ({ students = [], maxStudents = 5 }) => {
  const [activeTab, setActiveTab] = useState("All");
  const [confirmModal, setConfirmModal] = useState(null);
  const [sending, setSending] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Parse student validity date & compute days remaining
  const processedStudents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return students
      .map((s) => {
        if (!s.validityTo) return null;
        const expiry = new Date(s.validityTo);
        if (isNaN(expiry.getTime())) return null;

        expiry.setHours(0, 0, 0, 0);
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let statusCategory = "normal";
        let statusLabel = "";

        if (diffDays < 0) {
          statusCategory = "expired";
          statusLabel = "Expired";
        } else if (diffDays === 0) {
          statusCategory = "today";
          statusLabel = "Today";
        } else if (diffDays === 1) {
          statusCategory = "tomorrow";
          statusLabel = "Tomorrow";
        } else if (diffDays === 2) {
          statusCategory = "2days";
          statusLabel = "In 2 Days";
        }

        return {
          ...s,
          diffDays,
          statusCategory,
          statusLabel,
        };
      })
      .filter((s) => s && s.diffDays <= 2);
  }, [students]);

  // Counts for Tabs
  const counts = useMemo(() => {
    let expiringSoon = 0;
    let expired = 0;
    let todayCount = 0;
    let tomorrowCount = 0;
    let within2DaysCount = 0;

    processedStudents.forEach((s) => {
      if (s.diffDays < 0) {
        expired++;
      } else {
        expiringSoon++;
        if (s.diffDays === 0) todayCount++;
        if (s.diffDays === 1) tomorrowCount++;
        if (s.diffDays >= 0 && s.diffDays <= 2) within2DaysCount++;
      }
    });

    return {
      expiringSoon,
      expired,
      todayCount,
      tomorrowCount,
      within2DaysCount,
      allCount: processedStudents.length,
    };
  }, [processedStudents]);

  // Filtered List based on Active Tab
  const filteredStudents = useMemo(() => {
    return processedStudents.filter((s) => {
      if (activeTab === "Today") return s.diffDays === 0;
      if (activeTab === "Tomorrow") return s.diffDays === 1;
      if (activeTab === "Within 2 Days") return s.diffDays >= 0 && s.diffDays <= 2;
      if (activeTab === "Expired") return s.diffDays < 0;
      return true; // All
    });
  }, [processedStudents, activeTab]);

  const expiringWithin2DaysList = useMemo(() => {
    return processedStudents.filter((s) => s.diffDays >= 0 && s.diffDays <= 2);
  }, [processedStudents]);

  const expiredList = useMemo(() => {
    return processedStudents.filter((s) => s.diffDays < 0);
  }, [processedStudents]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 3200);
  };

  const handleConfirmSend = async () => {
    if (!confirmModal) return;
    setSending(true);

    try {
      if (confirmModal.type === "single" && confirmModal.student) {
        const msgType = confirmModal.student.diffDays < 0 ? "Membership Expired" : "Membership Reminder";
        await sendMembershipReminder(confirmModal.student, msgType);
        showToast("Reminder Sent Successfully");
      } else if (confirmModal.type === "bulk_expiring") {
        await sendBulkReminders(expiringWithin2DaysList, "Membership Reminder");
        showToast("Reminder Sent Successfully");
      } else if (confirmModal.type === "bulk_expired") {
        await sendBulkReminders(expiredList, "Membership Expired");
        showToast("Reminder Sent Successfully");
      }
    } catch (err) {
      console.error("Failed to send reminder:", err);
      showToast("Failed to log reminder. Please try again.");
    } finally {
      setSending(false);
      setConfirmModal(null);
    }
  };

  const tabs = [
    { id: "All", label: `All (${counts.allCount})` },
    { id: "Today", label: `Today (${counts.todayCount})` },
    { id: "Tomorrow", label: `Tomorrow (${counts.tomorrowCount})` },
    { id: "Within 2 Days", label: `Within 2 Days (${counts.within2DaysCount})` },
    { id: "Expired", label: `Expired (${counts.expired})` },
  ];

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400/30 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={20} className="text-white shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* MINI STATUS PANELS (Expiring Soon & Expired Members) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Expiring Soon */}
        <div
          onClick={() => setActiveTab("Within 2 Days")}
          className={clsx(
            "skeuo-card p-4 flex items-center gap-3.5 cursor-pointer transition-all active:scale-98",
            activeTab === "Within 2 Days" ? "ring-1 ring-amber-400/50" : ""
          )}
        >
          <div className="skeuo-dial w-10 h-10 glow-amber flex-shrink-0">
            <Clock size={18} className="text-amber-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase block">
              Expiring Soon
            </span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-amber-400 mt-0.5 block">
              Soon : {counts.expiringSoon}
            </span>
          </div>
          <div className="skeuo-rivet ml-auto" />
        </div>

        {/* Expired Members */}
        <div
          onClick={() => setActiveTab("Expired")}
          className={clsx(
            "skeuo-card p-4 flex items-center gap-3.5 cursor-pointer transition-all active:scale-98",
            activeTab === "Expired" ? "ring-1 ring-rose-500/50" : ""
          )}
        >
          <div className="skeuo-dial w-10 h-10 glow-red flex-shrink-0">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase block">
              Expired Members
            </span>
            <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 block">
              Expired : {counts.expired}
            </span>
          </div>
          <div className="skeuo-rivet ml-auto" />
        </div>
      </div>

      {/* MAIN MEMBERSHIP ALERTS PANEL */}
      <div className="skeuo-card p-5 md:p-6 space-y-4 relative">
        {/* Grip Dots */}
        <div className="skeuo-grip absolute top-5 right-5">
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
        </div>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-amber-500" />
            <h3 className="font-extrabold text-slate-800 dark:text-white text-xs tracking-wider uppercase">
              Membership Alerts
            </h3>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="jewel-dot cyan" />
            <span className="jewel-dot emerald" />
            <span className="jewel-dot amber" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
              Realtime membership validity alerts
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={clsx(
                  "skeuo-badge px-3 py-1.5 text-[10px] font-bold rounded-xl cursor-pointer transition-all",
                  activeTab === t.id
                    ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40"
                    : "text-slate-600 dark:text-slate-400"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            className="skeuo-dial w-7 h-7 flex-shrink-0 text-slate-500 dark:text-slate-400"
            title="Filter Options"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        {/* Table Rows (Debossed / Inset Table Surface) */}
        <div className="space-y-2 pt-2">
          {/* Table Header */}
          <div className="grid grid-cols-12 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 pb-1">
            <span className="col-span-4">Name</span>
            <span className="col-span-2 text-center">Seat</span>
            <span className="col-span-3">Batch</span>
            <span className="col-span-2 text-center">Expiry</span>
            <span className="col-span-1 text-right">Action</span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 skuo-inset rounded-xl">
              No active membership alerts in this view.
            </div>
          ) : (
            filteredStudents.slice(0, maxStudents).map((s) => {
              const initial = (s.name || "S").charAt(0).toUpperCase();
              const isExpired = s.diffDays < 0;

              return (
                <div
                  key={s.id}
                  className="skeuo-card p-2.5 flex items-center justify-between text-xs rounded-xl hover:scale-[1.01] transition-all"
                >
                  <div className="grid grid-cols-12 w-full items-center">
                    {/* Name + Initial Avatar Disc */}
                    <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                      <div className="skeuo-dial w-7 h-7 font-extrabold text-[11px] text-slate-700 dark:text-slate-200 flex-shrink-0">
                        {initial}
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white truncate">
                        {s.name}
                      </span>
                    </div>

                    {/* Seat */}
                    <div className="col-span-2 text-center">
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        Seat {s.seatNumber || "-"}
                      </span>
                    </div>

                    {/* Batch */}
                    <div className="col-span-3 truncate text-[11px] text-slate-600 dark:text-slate-400">
                      {Array.isArray(s.batch)
                        ? s.batch.join(", ")
                        : s.batch || "A Shift"}
                    </div>

                    {/* Expiry Badge */}
                    <div className="col-span-2 text-center">
                      <span
                        className={clsx(
                          "skeuo-badge px-2.5 py-0.5 text-[10px]",
                          isExpired
                            ? "text-rose-600 dark:text-rose-400 border-rose-500/30"
                            : "text-amber-600 dark:text-amber-400 border-amber-500/30"
                        )}
                      >
                        {isExpired ? "Expired" : s.statusLabel}
                      </span>
                    </div>

                    {/* Action Bell */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() =>
                          setConfirmModal({ type: "single", student: s })
                        }
                        className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-amber-400 active:scale-95"
                        title="Send WhatsApp Alert"
                      >
                        <Bell size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions Strip */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
            Showing max {maxStudents} alerts
          </span>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() =>
                setConfirmModal({
                  type: "bulk_expiring",
                  count: expiringWithin2DaysList.length,
                })
              }
              disabled={expiringWithin2DaysList.length === 0}
              className="skeuo-btn px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400 border-amber-500/30 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Bell size={13} className="text-amber-500" />
              <span>Notify All Expiring</span>
            </button>

            <button
              onClick={() =>
                setConfirmModal({
                  type: "bulk_expired",
                  count: expiredList.length,
                })
              }
              disabled={expiredList.length === 0}
              className="skeuo-btn px-3 py-1.5 text-xs text-rose-700 dark:text-rose-400 border-rose-500/30 disabled:opacity-40 flex items-center gap-1.5"
            >
              <AlertTriangle size={13} className="text-rose-500" />
              <span>Notify All Expired</span>
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="skeuo-card max-w-sm w-full p-6 space-y-4">
            <h4 className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-2">
              <Send size={16} className="text-blue-500" /> Confirm WhatsApp Reminder
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {confirmModal.type === "single"
                ? `Send direct membership reminder to ${confirmModal.student?.name} via WhatsApp?`
                : `Send bulk WhatsApp reminders to ${confirmModal.count} students?`}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="skeuo-btn px-3.5 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={sending}
                className="skeuo-btn skeuo-btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
              >
                {sending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={13} /> Send Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
