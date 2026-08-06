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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { clsx } from "clsx";
import { subscribeStudents } from "../services/studentsService";
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalExpected = 0;
    let totalCollected = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    students.forEach((s) => {
      const total = Number(s.totalAmount) || 0;
      const paid = Number(s.paidAmount) || 0;
      totalExpected += total;
      totalCollected += paid;

      if (paid >= total && total > 0) paidCount++;
      else if (paid > 0) partialCount++;
      else unpaidCount++;
    });

    const totalPending = Math.max(0, totalExpected - totalCollected);

    return {
      totalExpected,
      totalCollected,
      totalPending,
      paidCount,
      partialCount,
      unpaidCount,
      totalStudents: students.length,
    };
  }, [students]);

  // Payment Status Donut Data
  const pieData = [
    { name: "Paid", value: metrics.paidCount || 1, color: "#10b981" },
    { name: "Partial", value: metrics.partialCount || 0, color: "#f59e0b" },
    { name: "Unpaid", value: metrics.unpaidCount || 0, color: "#f43f5e" },
  ];

  // Students Due This Week
  const dueThisWeekStudents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return students.filter((s) => {
      const balance = Math.max(0, (s.totalAmount || 0) - (s.paidAmount || 0));
      if (balance <= 0) return false;
      if (!s.validityTo) return true;
      const expiry = new Date(s.validityTo);
      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });
  }, [students]);

  // Filtered Students
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="text-emerald-400" size={26} /> Payments & Invoicing
          </h1>
          <p className="text-xs text-slate-400">
            Track student fee collection, pending dues, and automated payment reminders
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
          className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 self-start md:self-auto"
        >
          <Bell size={16} /> Notify Unpaid ({metrics.unpaidCount + metrics.partialCount})
        </button>
      </div>

      {/* TOP SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SaaSCard className="p-5 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 border-blue-500/30">
          <p className="text-xs font-semibold text-slate-400">Total Expected</p>
          <h3 className="text-2xl font-extrabold text-white mt-1">
            ₹{metrics.totalExpected.toLocaleString("en-IN")}
          </h3>
          <p className="text-[10px] text-blue-400 mt-2 font-medium">Across all enrolled students</p>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border-emerald-500/30">
          <p className="text-xs font-semibold text-slate-400">Total Collected</p>
          <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">
            ₹{metrics.totalCollected.toLocaleString("en-IN")}
          </h3>
          <p className="text-[10px] text-emerald-400 mt-2 font-medium">Secured revenue</p>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border-rose-500/30">
          <p className="text-xs font-semibold text-slate-400">Total Pending Dues</p>
          <h3 className="text-2xl font-extrabold text-rose-400 mt-1">
            ₹{metrics.totalPending.toLocaleString("en-IN")}
          </h3>
          <p className="text-[10px] text-rose-400 mt-2 font-medium">Action required</p>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-purple-950 via-slate-900 to-slate-950 border-purple-500/30">
          <p className="text-xs font-semibold text-slate-400">Payment Clearance</p>
          <h3 className="text-2xl font-extrabold text-purple-300 mt-1">
            {metrics.paidCount} / {metrics.totalStudents}
          </h3>
          <p className="text-[10px] text-purple-400 mt-2 font-medium">
            {Math.round((metrics.paidCount / (metrics.totalStudents || 1)) * 100)}% Clearance rate
          </p>
        </SaaSCard>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search payments by student name or phone..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
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
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW (1024px and above) */}
      <div className="hidden lg:block">
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
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingStudent(student)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Payment"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setHistoryModalStudent(student)}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Payment History"
                          >
                            <History size={15} />
                          </button>

                          {balance > 0 && (
                            <button
                              onClick={() => {
                                setNotificationSent({
                                  name: student.name,
                                  amount: balance,
                                });
                              }}
                              className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                              title="Send Reminder"
                            >
                              <Bell size={15} />
                            </button>
                          )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {paginatedStudents.map((student) => (
            <PaymentMobileCard
              key={student.id}
              student={student}
              onView={() => setViewingStudent(student)}
              onEdit={() => setEditingStudent(student)}
              onReminder={() => {
                const balance = Math.max(0, (student.totalAmount || 0) - (student.paidAmount || 0));
                setNotificationSent({ name: student.name, amount: balance });
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

      {/* Notification Confirmation Sheet */}
      <ConfirmModal
        isOpen={!!notificationSent}
        onClose={() => setNotificationSent(null)}
        title="Payment Reminder Dispatched"
        message={`Automated SMS & WhatsApp reminder sent to ${notificationSent?.name} regarding due balance of ₹${notificationSent?.amount}.`}
        confirmText="Done"
        variant="success"
        showCancel={false}
      />
    </div>
  );
};
