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
  Filter,
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
          const absDays = Math.abs(diffDays);
          statusLabel = absDays === 1 ? "Expired Yesterday" : `Expired ${absDays} days ago`;
          badgeColorClass = "bg-rose-950/80 text-rose-300 border-rose-800/80"; // Dark Red / Crimson
        } else if (diffDays === 0) {
          statusCategory = "today";
          statusLabel = "Expires Today";
          badgeColorClass = "bg-rose-600/20 text-rose-400 border-rose-500/30"; // Red
        } else if (diffDays === 1) {
          statusCategory = "tomorrow";
          statusLabel = "1 day remaining (Tomorrow)";
          badgeColorClass = "bg-amber-500/20 text-amber-400 border-amber-500/30"; // Orange
        } else if (diffDays === 2) {
          statusCategory = "2days";
          statusLabel = "2 days remaining";
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

  // Counts for Top Stats & Tabs
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
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400/30 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={20} className="text-white shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* BONUS COUNTER CARDS (CLICKABLE FILTERS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTab("Within 2 Days")}
          className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${
            activeTab === "Within 2 Days"
              ? "bg-amber-500/15 border-amber-500/40 ring-2 ring-amber-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-amber-500/30 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Expiring Soon</p>
              <h4 className="text-xl font-extrabold text-amber-400 mt-0.5">
                🟡 Expiring Soon : {counts.expiringSoon}
              </h4>
            </div>
          </div>
          <span className="text-xs font-medium text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Filter <ChevronRight size={14} />
          </span>
        </button>

        <button
          onClick={() => setActiveTab("Expired")}
          className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between group ${
            activeTab === "Expired"
              ? "bg-rose-950/40 border-rose-700/50 ring-2 ring-rose-500/20"
              : "bg-slate-900/80 border-slate-800 hover:border-rose-500/30 hover:bg-slate-900"
          }`}
        >
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400">Expired Memberships</p>
              <h4 className="text-xl font-extrabold text-rose-400 mt-0.5">
                🔴 Expired : {counts.expired}
              </h4>
            </div>
          </div>
          <span className="text-xs font-medium text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Filter <ChevronRight size={14} />
          </span>
        </button>
      </div>

      {/* MAIN MEMBERSHIP ALERTS CARD */}
      <SaaSCard className="p-5 md:p-6 bg-slate-900/90 border-slate-800 space-y-6">
        {/* Header & Bulk Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Bell className="text-amber-400" size={20} /> Membership Alerts
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Realtime membership validity tracking & one-click renewal notifications
            </p>
          </div>

          {/* Bulk Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() =>
                setConfirmModal({
                  type: "bulk_expiring",
                  count: expiringWithin2DaysList.length,
                })
              }
              disabled={expiringWithin2DaysList.length === 0}
              className="px-3.5 py-2 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold hover:bg-amber-500/25 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center space-x-2"
            >
              <Bell size={14} />
              <span>🔔 Send Reminder to All Expiring ({expiringWithin2DaysList.length})</span>
            </button>

            <button
              onClick={() =>
                setConfirmModal({
                  type: "bulk_expired",
                  count: expiredList.length,
                })
              }
              disabled={expiredList.length === 0}
              className="px-3.5 py-2 bg-rose-950/60 text-rose-300 border border-rose-700/50 rounded-xl text-xs font-semibold hover:bg-rose-900/60 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center space-x-2"
            >
              <AlertCircle size={14} />
              <span>🔴 Notify All Expired Members ({expiredList.length})</span>
            </button>
          </div>
        </div>

        {/* Auto Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === t.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Students Cards Grid / List */}
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800/60 text-slate-400 space-y-2">
            <CheckCircle2 size={32} className="mx-auto text-emerald-400/80" />
            <p className="font-semibold text-sm text-slate-300">No Membership Alerts</p>
            <p className="text-xs text-slate-500">
              There are currently no students matching this expiry filter.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(maxStudents ? filteredStudents.slice(0, maxStudents) : filteredStudents).map((student) => {
              const batchDisplay = Array.isArray(student.batch)
                ? student.batch.join(", ")
                : String(student.batch || "No Batch");

              const paymentStatus = student.status || "Unpaid";
              const isPaid = paymentStatus === "Paid";
              const isPartial = paymentStatus === "Partial";

              return (
                <div
                  key={student.id}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3 relative group"
                >
                  {/* Top Info & Days Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm tracking-tight flex items-center gap-1.5">
                          <User size={14} className="text-slate-400 shrink-0" />
                          <span>{student.name}</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium">
                          📞 {student.phone || "No Phone"}
                        </p>
                      </div>

                      {/* Expiry Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border shrink-0 ${student.badgeColorClass}`}
                      >
                        {student.statusLabel}
                      </span>
                    </div>

                    {/* Seat & Batch Info */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Seat
                        </span>
                        <span className="font-bold text-white flex items-center gap-1">
                          <Armchair size={12} className="text-blue-400" />
                          {student.seatNumber ? `#${student.seatNumber}` : "Unassigned"}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Batch
                        </span>
                        <span className="font-semibold text-slate-300 truncate block">
                          {batchDisplay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer & Action Icon */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Expires: {student.validityTo || "N/A"}
                      </span>
                      <span
                        className={`inline-block text-[10px] font-bold mt-0.5 ${
                          isPaid
                            ? "text-emerald-400"
                            : isPartial
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        Payment: {paymentStatus}
                      </span>
                    </div>

                    {/* Compact Reminder Action Icon */}
                    <button
                      onClick={() => setConfirmModal({ type: "single", student })}
                      className="p-2 rounded-xl bg-blue-600/15 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all shadow-sm group-hover:scale-105"
                      title="Send Payment Reminder"
                    >
                      <Bell size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SaaSCard>

      {/* CONFIRMATION DIALOG MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setConfirmModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Bell size={24} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">
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

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={sending}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmSend}
                disabled={sending}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
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
