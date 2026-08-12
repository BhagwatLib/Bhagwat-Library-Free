import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Bell,
  DollarSign,
  Clock,
  History,
  XCircle,
  Users,
  Edit2,
  FileText,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { subscribeStudents } from "../services/studentsService";
import { sendWhatsAppInvoice, sendWhatsAppReminder } from "../services/whatsappService";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { Pagination } from "../components/Pagination";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { StudentForm } from "../components/StudentForm";
import { StudentProfile } from "../components/StudentProfile";
import { ConfirmModal } from "../components/ConfirmModal";
import { PaymentMobileCard } from "../components/PaymentMobileCard";

export const PaymentList = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editingStudent, setEditingStudent] = useState(null);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [notificationSent, setNotificationSent] = useState(null);
  const [historyModalStudent, setHistoryModalStudent] = useState(null);
  const [sendingMap, setSendingMap] = useState({});
  const [confirmMessage, setConfirmMessage] = useState(null); // { student, type, title, message }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSendWhatsApp = async (student, type) => {
    setSendingMap((prev) => ({ ...prev, [student.id]: true }));
    try {
      if (type === "invoice") {
        await sendWhatsAppInvoice(student);
      } else {
        await sendWhatsAppReminder(student);
      }
      
      const balance = Math.max(0, (Number(student.totalAmount) || 0) - (Number(student.paidAmount) || 0));
      setNotificationSent({
        name: student.name || "",
        amount: balance
      });
    } catch (err) {
      alert(`WhatsApp Dispatch Failed: ${err.message}`);
    } finally {
      setSendingMap((prev) => ({ ...prev, [student.id]: false }));
    }
  };

  const formatLastMessage = (lastMsg) => {
    if (!lastMsg || !lastMsg.sentAt) return null;
    const date = new Date(lastMsg.sentAt);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const typeLabel = lastMsg.type === "invoice" ? "Invoice Sent" : "Reminder Sent";
    return `${typeLabel} on ${dateStr} at ${timeStr}`;
  };

  // Realtime subscription to students collection
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Summary Metrics calculated in realtime from Firestore data
  const metrics = useMemo(() => {
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let totalPending = 0;

    students.forEach((s) => {
      const total = Number(s.totalAmount) || 0;
      const paid = Number(s.paidAmount) || 0;
      totalPending += Math.max(0, total - paid);

      const status =
        s.status ||
        (paid >= total && total > 0
          ? "Paid"
          : paid > 0
          ? "Partial"
          : "Unpaid");

      if (status === "Paid") paidCount++;
      else if (status === "Partial") partialCount++;
      else unpaidCount++;
    });

    return {
      paidCount,
      partialCount,
      unpaidCount,
      totalPending,
      totalStudents: students.length,
    };
  }, [students]);

  // Filtered Students matching active filter status and search term
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.includes(searchTerm);

      const status =
        s.status ||
        (s.paidAmount >= s.totalAmount && s.totalAmount > 0
          ? "Paid"
          : s.paidAmount > 0
          ? "Partial"
          : "Unpaid");

      const matchesFilter = filterStatus === "All" || status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [students, searchTerm, filterStatus]);

  // Paginated Data
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;

  if (loading) {
    return <SkeletonLoader type="table" rows={6} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Payments & Invoicing <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Realtime Firestore synchronized billing ledger & payment management
          </p>
        </div>

        <button
          onClick={() => {
            const unpaidNames = students
              .filter((s) => s.paidAmount < s.totalAmount)
              .map((s) => s.name)
              .slice(0, 3)
              .join(", ");
            setNotificationSent({
              name: unpaidNames ? `${unpaidNames}...` : "All Unpaid Students",
              amount: metrics.totalPending,
            });
          }}
          className="skeuo-btn px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-2 self-start md:self-auto"
        >
          <Bell size={15} className="text-amber-500" /> Notify Unpaid ({metrics.unpaidCount + metrics.partialCount})
        </button>
      </div>

      {/* TOP SKEUOMORPHIC CARD FILTERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Enrolled Card */}
        <div
          onClick={() => {
            setFilterStatus("All");
            setCurrentPage(1);
          }}
          className={clsx(
            "skeuo-card p-5 cursor-pointer flex flex-col justify-between h-32 transition-all active:scale-98 relative",
            filterStatus === "All"
              ? "ring-2 ring-blue-500"
              : "opacity-90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Enrolled
            </span>
            <span className="jewel-dot cyan" />
          </div>
          <h3 className="text-3xl font-black text-slate-800 dark:text-white">
            {metrics.totalStudents}
          </h3>
          <span className="text-[10px] text-blue-600 dark:text-cyan-400 font-semibold">Click to show all</span>
        </div>

        {/* Paid Card */}
        <div
          onClick={() => {
            setFilterStatus("Paid");
            setCurrentPage(1);
          }}
          className={clsx(
            "skeuo-card p-5 cursor-pointer flex flex-col justify-between h-32 transition-all active:scale-98 relative",
            filterStatus === "Paid"
              ? "ring-2 ring-emerald-500"
              : "opacity-90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Paid Students
            </span>
            <span className="jewel-dot emerald" />
          </div>
          <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {metrics.paidCount}
          </h3>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Click to filter list</span>
        </div>

        {/* Partially Paid Card */}
        <div
          onClick={() => {
            setFilterStatus("Partial");
            setCurrentPage(1);
          }}
          className={clsx(
            "skeuo-card p-5 cursor-pointer flex flex-col justify-between h-32 transition-all active:scale-98 relative",
            filterStatus === "Partial"
              ? "ring-2 ring-amber-500"
              : "opacity-90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Partially Paid
            </span>
            <span className="jewel-dot amber" />
          </div>
          <h3 className="text-3xl font-black text-amber-600 dark:text-amber-400">
            {metrics.partialCount}
          </h3>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Click to filter list</span>
        </div>

        {/* Unpaid Card */}
        <div
          onClick={() => {
            setFilterStatus("Unpaid");
            setCurrentPage(1);
          }}
          className={clsx(
            "skeuo-card p-5 cursor-pointer flex flex-col justify-between h-32 transition-all active:scale-98 relative",
            filterStatus === "Unpaid"
              ? "ring-2 ring-rose-500"
              : "opacity-90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Unpaid Students
            </span>
            <span className="jewel-dot ruby" />
          </div>
          <h3 className="text-3xl font-black text-rose-600 dark:text-rose-400">
            {metrics.unpaidCount}
          </h3>
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">Click to filter list</span>
        </div>
      </div>

      {/* SEARCH & FILTER CONTROLS */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search payments by student name or phone..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="skeuo-input w-full pl-10 pr-4 py-2.5 text-xs font-medium placeholder:text-slate-400"
          />
        </div>


        <div className="flex items-center gap-2">
          {["All", "Paid", "Partial", "Unpaid"].map((status) => (
            <button
              key={status}
              onClick={() => {
                setFilterStatus(status);
                setCurrentPage(1);
              }}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border",
                filterStatus === status
                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {status === "Partial" ? "Partially Paid" : status}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW (1024px and above) */}
      <div className="hidden lg:block">
        {/* Realtime Match Active Filter Badge */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">
              {filterStatus === "All"
                ? `Showing ${filteredStudents.length} Total Students`
                : filterStatus === "Paid"
                ? `Showing ${filteredStudents.length} Paid Students`
                : filterStatus === "Partial"
                ? `Showing ${filteredStudents.length} Partially Paid Students`
                : `Showing ${filteredStudents.length} Unpaid Students`
              }
            </span>
            <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">
              {filteredStudents.length}
            </span>
          </div>
        </div>

        <SaaSCard className="overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Batch</th>
                  <th className="px-6 py-4">Validity</th>
                  <th className="px-6 py-4">Total Fee</th>
                  <th className="px-6 py-4">Paid</th>
                  <th className="px-6 py-4">Balance</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedStudents.map((student) => {
                  const status =
                    student.status ||
                    (student.paidAmount >= student.totalAmount &&
                    student.totalAmount > 0
                      ? "Paid"
                      : student.paidAmount > 0
                      ? "Partial"
                      : "Unpaid");

                  const balance = Math.max(
                    0,
                    (student.totalAmount || 0) - (student.paidAmount || 0)
                  );

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div
                          onClick={() => setViewingStudent(student)}
                          className="flex items-center gap-3 cursor-pointer group/profile"
                        >
                          <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-700">
                            {student.photo ? (
                              <img
                                src={student.photo}
                                alt={student.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Users size={16} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-white group-hover/profile:text-blue-400 transition-colors">
                              {student.name}
                            </p>
                            <p className="text-[10px] text-slate-400">{student.phone}</p>
                            {student.lastMessageSent && (
                              <p className="text-[9px] text-emerald-400 font-semibold mt-0.5">
                                {formatLastMessage(student.lastMessageSent)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-slate-300">
                        {Array.isArray(student.batch)
                          ? student.batch.join(", ")
                          : student.batch}
                      </td>

                      <td className="px-6 py-4 text-slate-400">
                        {student.validityFrom && student.validityTo ? (
                          <span>{student.validityFrom} - {student.validityTo}</span>
                        ) : (
                          <span className="italic text-slate-600">Not set</span>
                        )}
                      </td>

                      <td className="px-6 py-4 font-semibold text-white">
                        ₹{student.totalAmount || 0}
                      </td>

                      <td className="px-6 py-4 font-semibold text-emerald-400">
                        ₹{student.paidAmount || 0}
                      </td>

                      <td className="px-6 py-4 font-semibold text-rose-400">
                        ₹{balance}
                      </td>

                      <td className="px-6 py-4">
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
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {status === "Paid" ? (
                            <button
                              disabled={sendingMap[student.id]}
                              onClick={() => setConfirmMessage({
                                student,
                                type: "invoice",
                                title: "Send Invoice",
                                message: "Are you sure you want to send the payment invoice to this student?"
                              })}
                              className={clsx(
                                "p-2 rounded-lg border transition-all active:scale-95 disabled:opacity-50",
                                student.lastMessageSent?.type === "invoice"
                                  ? "bg-slate-800 border-slate-700 text-slate-400"
                                  : "bg-emerald-600/20 border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white"
                              )}
                              title="Send Invoice"
                            >
                              {sendingMap[student.id] ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FileText size={15} />
                              )}
                            </button>
                          ) : (
                            <button
                              disabled={sendingMap[student.id]}
                              onClick={() => setConfirmMessage({
                                student,
                                type: "reminder",
                                title: "Send Payment Reminder",
                                message: "Are you sure you want to send a payment reminder to this student?"
                              })}
                              className={clsx(
                                "p-2 rounded-lg border transition-all active:scale-95 disabled:opacity-50",
                                student.lastMessageSent?.type === "reminder"
                                  ? "bg-slate-800 border-slate-700 text-slate-400"
                                  : "bg-amber-600/20 border-amber-500/30 hover:bg-amber-600 text-amber-400 hover:text-white"
                              )}
                              title="Send Payment Reminder"
                            >
                              {sendingMap[student.id] ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Bell size={15} />
                              )}
                            </button>
                          )}

                          <button
                            onClick={() => setEditingStudent(student)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800/80 rounded-lg transition-colors"
                            title="Edit Payment"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setHistoryModalStudent(student)}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 border border-slate-800/80 rounded-lg transition-colors"
                            title="Payment History"
                          >
                            <History size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginatedStudents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      No payment records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-800">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={setItemsPerPage}
              totalItems={filteredStudents.length}
            />
          </div>
        </SaaSCard>
      </div>

      {/* MOBILE CARDS LIST (< 1024px) */}
      <div className="block lg:hidden space-y-3">
        {/* Mobile Filter Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">
            {filterStatus === "All"
              ? `Showing ${filteredStudents.length} Total Students`
              : filterStatus === "Paid"
              ? `Showing ${filteredStudents.length} Paid Students`
              : filterStatus === "Partial"
              ? `Showing ${filteredStudents.length} Partially Paid Students`
              : `Showing ${filteredStudents.length} Unpaid Students`
            }
          </span>
          <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20 font-bold">
            {filteredStudents.length}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {paginatedStudents.map((student) => (
            <PaymentMobileCard
              key={student.id}
              student={student}
              onView={() => setViewingStudent(student)}
              onEdit={() => setEditingStudent(student)}
              isSending={sendingMap[student.id]}
              onSendWhatsApp={(type) => {
                const isInv = type === "invoice";
                setConfirmMessage({
                  student,
                  type,
                  title: isInv ? "Send Invoice" : "Send Payment Reminder",
                  message: isInv
                    ? "Are you sure you want to send the payment invoice to this student?"
                    : "Are you sure you want to send a payment reminder to this student?"
                });
              }}
            />
          ))}

          {paginatedStudents.length === 0 && (
            <p className="col-span-full py-12 text-center text-slate-500 text-xs italic">
              No payment records found matching criteria.
            </p>
          )}
        </div>

        <div className="pt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
            totalItems={filteredStudents.length}
          />
        </div>
      </div>

      {/* Student Form Modal for Editing Payment */}
      {editingStudent && (
        <StudentForm
          student={editingStudent}
          mode="payment"
          onClose={() => setEditingStudent(null)}
          onSuccess={() => setEditingStudent(null)}
        />
      )}

      {/* Student Profile Modal */}
      {viewingStudent && (
        <StudentProfile
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
          onEdit={() => {
            setEditingStudent(viewingStudent);
            setViewingStudent(null);
          }}
          onUpdate={() => {}}
        />
      )}

      {/* Send WhatsApp Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmMessage}
        onClose={() => setConfirmMessage(null)}
        title={confirmMessage?.title || "Confirm Message Dispatch"}
        message={confirmMessage?.message || ""}
        confirmText="Send"
        cancelText="Cancel"
        variant="primary"
        showCancel={true}
        onConfirm={async () => {
          if (confirmMessage) {
            const { student, type } = confirmMessage;
            setConfirmMessage(null);
            await handleSendWhatsApp(student, type);
          }
        }}
      />

      {/* Notification Confirmation Sheet */}
      <ConfirmModal
        isOpen={!!notificationSent}
        onClose={() => setNotificationSent(null)}
        onConfirm={() => setNotificationSent(null)}
        title="Payment Reminder Dispatched"
        message={`Automated SMS & WhatsApp reminder sent to ${notificationSent?.name} regarding due balance of ₹${notificationSent?.amount}.`}
        confirmText="Done"
        variant="success"
        showCancel={false}
      />
    </div>
  );
};
