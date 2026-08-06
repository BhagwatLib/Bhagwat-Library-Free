import React, { useState, useMemo } from "react";
import {
  Bell,
  AlertTriangle,
  Clock,
  Calendar,
  User,
  Armchair,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { SaaSCard } from "./SaaSCard";
import { Badge } from "./Badge";
import {
  sendMembershipReminder,
  sendBulkReminders,
} from "../services/whatsappService";

export const MembershipAlertsWidget = ({ students = [], maxStudents }) => {
  const [activeTab, setActiveTab] = useState("All");
  const [confirmModal, setConfirmModal] = useState(null); // { type: "single"|"bulk_expiring"|"bulk_expired", student?: object, count?: number }
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

        let statusCategory = "normal"; // green > 2 days
        let statusLabel = "";
        let badgeColorClass = "";

        if (diffDays < 0) {
          statusCategory = "expired";
          statusLabel = "Expired";
          badgeColorClass = "bg-rose-950/80 text-rose-300 border-rose-800/80"; // Dark Red / Crimson
        } else if (diffDays === 0) {
          statusCategory = "today";
          statusLabel = "Today";
          badgeColorClass = "bg-rose-600/20 text-rose-400 border-rose-500/30"; // Red
        } else if (diffDays === 1) {
          statusCategory = "tomorrow";
          statusLabel = "Tomorrow";
          badgeColorClass = "bg-amber-500/20 text-amber-400 border-amber-500/30"; // Orange
        } else if (diffDays === 2) {
          statusCategory = "2days";
          statusLabel = "2 days";
          badgeColorClass = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"; // Yellow
        }

        return {
          ...s,
          diffDays,
          statusCategory,
          statusLabel,
          badgeColorClass,
        };
      })
      .filter((s) => s && s.diffDays <= 2); // Show only <= 2 days or already expired
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
      if (activeTab === "Expiring Today") return s.diffDays === 0;
      if (activeTab === "Tomorrow") return s.diffDays === 1;
      if (activeTab === "Within 2 Days") return s.diffDays >= 0 && s.diffDays <= 2;
      if (activeTab === "Expired") return s.diffDays < 0;
      return true; // All
    });
  }, [processedStudents, activeTab]);

  // Lists for Bulk Actions
  const expiringWithin2DaysList = useMemo(() => {
    return processedStudents.filter((s) => s.diffDays >= 0 && s.diffDays <= 2);
  }, [processedStudents]);

  const expiredList = useMemo(() => {
    return processedStudents.filter((s) => s.diffDays < 0);
  }, [processedStudents]);

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 3200);
  };

  // Execute Dispatch Actions
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
    { id: "Expiring Today", label: `Today (${counts.todayCount})` },
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

      {/* BONUS COUNTER CARDS (CLICKABLE FILTERS) */}
      <div className="grid grid-cols-2 gap-3.5">
        <button
          onClick={() => setActiveTab("Within 2 Days")}
          className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between group ${
            activeTab === "Within 2 Days"
              ? "bg-amber-500/15 border-amber-500/40 ring-2 ring-amber-500/20"
              : "bg-slate-900/80 border-slate-800/80 hover:border-amber-500/30 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 leading-none">Expiring Soon</p>
              <h4 className="text-sm font-extrabold text-amber-400 mt-1">
                🟡 Soon : {counts.expiringSoon}
              </h4>
            </div>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("Expired")}
          className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between group ${
            activeTab === "Expired"
              ? "bg-rose-950/40 border-rose-700/50 ring-2 ring-rose-500/20"
              : "bg-slate-900/80 border-slate-800/80 hover:border-rose-500/30 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
              <AlertTriangle size={16} />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 leading-none">Expired Members</p>
              <h4 className="text-sm font-extrabold text-rose-400 mt-1">
                🔴 Expired : {counts.expired}
              </h4>
            </div>
          </div>
        </button>
      </div>

      {/* MAIN MEMBERSHIP ALERTS CARD */}
      <SaaSCard className="p-4 md:p-5 bg-slate-900/90 border-slate-800/80 space-y-4">
        {/* Header Title */}
        <div className="pb-3 border-b border-slate-800/80">
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Bell className="text-amber-400" size={16} /> Membership Alerts
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Realtime membership validity alerts
          </p>
        </div>

        {/* Auto Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                activeTab === t.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Students Table/List */}
        {filteredStudents.length === 0 ? (
          <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800/60 text-slate-400">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400/80 mb-2" />
            <p className="font-semibold text-xs text-slate-300">No Membership Alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 overflow-hidden">
            {/* Desktop Table Header */}
            <div className="hidden md:flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2 px-1">
              <div className="w-8 shrink-0"></div>
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-20 text-center shrink-0">Seat</div>
              <div className="w-24 shrink-0">Batch</div>
              <div className="w-20 text-center shrink-0">Expiry</div>
              <div className="w-10 text-right shrink-0">Action</div>
            </div>

            <div className="space-y-1.5 md:space-y-0 md:divide-y md:divide-slate-800/40 max-h-[384px] overflow-y-auto custom-scrollbar">
              {(maxStudents ? filteredStudents.slice(0, maxStudents) : filteredStudents).map((student) => {
                const batchDisplay = Array.isArray(student.batch)
                  ? student.batch.join(", ")
                  : String(student.batch || "No Batch");

                const firstLetter = student.name.charAt(0).toUpperCase();

                return (
                  <div
                    key={student.id}
                    className="flex flex-col md:flex-row md:items-center p-3 md:py-2 md:px-1 rounded-xl md:rounded-none bg-slate-950/40 md:bg-transparent border border-slate-800/80 md:border-none gap-2 md:gap-3 hover:bg-slate-800/25 transition-colors min-h-[48px]"
                  >
                    {/* Avatar & Name */}
                    <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                        {firstLetter}
                      </div>
                      <span className="font-bold text-white text-xs truncate leading-none">
                        {student.name}
                      </span>
                    </div>

                    {/* Seat */}
                    <div className="md:w-20 md:text-center shrink-0 flex md:block items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="md:hidden text-[10px] text-slate-500 font-bold uppercase">Seat:</span>
                      <span className="font-semibold text-slate-200">
                        {student.seatNumber ? `Seat ${student.seatNumber}` : "N/A"}
                      </span>
                    </div>

                    {/* Batch */}
                    <div className="md:w-24 shrink-0 flex md:block items-center gap-1.5 text-[11px] text-slate-400 truncate">
                      <span className="md:hidden text-[10px] text-slate-500 font-bold uppercase">Batch:</span>
                      <span className="font-medium text-slate-300 truncate">
                        {batchDisplay}
                      </span>
                    </div>

                    {/* Expiry Status */}
                    <div className="md:w-20 md:text-center shrink-0 flex md:block items-center gap-1.5">
                      <span className="md:hidden text-[10px] text-slate-500 font-bold uppercase">Expiry:</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border inline-block text-center min-w-[56px] leading-tight ${student.badgeColorClass}`}
                      >
                        {student.statusLabel}
                      </span>
                    </div>

                    {/* Action Icon */}
                    <div className="md:w-10 text-right shrink-0 flex md:block justify-end pt-1 md:pt-0">
                      <button
                        onClick={() => setConfirmModal({ type: "single", student })}
                        className="p-1.5 rounded-lg bg-blue-600/15 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        title="Send Renewal Reminder"
                      >
                        <Bell size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions (Bulks) */}
        {filteredStudents.length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[10px] text-slate-500">
              Showing max {maxStudents || filteredStudents.length} alerts
            </span>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() =>
                  setConfirmModal({
                    type: "bulk_expiring",
                    count: expiringWithin2DaysList.length,
                  })
                }
                disabled={expiringWithin2DaysList.length === 0}
                className="px-2.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40 flex items-center space-x-1"
              >
                <Bell size={12} />
                <span>🔔 Notify All Expiring</span>
              </button>

              <button
                onClick={() =>
                  setConfirmModal({
                    type: "bulk_expired",
                    count: expiredList.length,
                  })
                }
                disabled={expiredList.length === 0}
                className="px-2.5 py-1.5 bg-rose-950/50 text-rose-400 border border-rose-800/40 rounded-lg text-[10px] font-bold hover:bg-rose-950 hover:text-rose-300 transition-all disabled:opacity-40 flex items-center space-x-1"
              >
                <AlertCircle size={12} />
                <span>🔴 Notify All Expired</span>
              </button>
            </div>
          </div>
        )}
      </SaaSCard>

      {/* CONFIRMATION DIALOG MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setConfirmModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Bell size={20} />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">
                {confirmModal.type === "single"
                  ? "Send Renewal Reminder?"
                  : confirmModal.type === "bulk_expiring"
                  ? "Send Reminders to Expiring Students?"
                  : "Notify Expired Members?"}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {confirmModal.type === "single"
                  ? `Are you sure you want to send a membership renewal reminder to ${confirmModal.student?.name}?`
                  : confirmModal.type === "bulk_expiring"
                  ? `Send reminder to all ${confirmModal.count} students whose membership expires within the next 2 days?`
                  : `Send expiry notice to all ${confirmModal.count} members whose membership has already expired?`}
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-1">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={sending}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmSend}
                disabled={sending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-lg shadow-blue-600/35 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send</span>
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
