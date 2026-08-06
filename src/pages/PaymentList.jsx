import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Bell,
  DollarSign,
  Clock,
  History,
  XCircle,
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
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="text-emerald-400" size={24} /> Payments & Invoices
          </h1>
          <p className="text-xs text-slate-400">
            Realtime fee collection & pending balance tracking
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
          className="h-11 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all flex-shrink-0"
        >
          <Bell size={16} /> Notify ({metrics.unpaidCount + metrics.partialCount})
        </button>
      </div>

      {/* TOP METRIC CARDS (Mobile Scroll Horizontally or Stack) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SaaSCard className="p-3.5 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 border-blue-500/30">
          <p className="text-[11px] font-semibold text-slate-400">Expected</p>
          <h3 className="text-lg font-extrabold text-white mt-0.5">
            ₹{metrics.totalExpected.toLocaleString("en-IN")}
          </h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border-emerald-500/30">
          <p className="text-[11px] font-semibold text-slate-400">Collected</p>
          <h3 className="text-lg font-extrabold text-emerald-400 mt-0.5">
            ₹{metrics.totalCollected.toLocaleString("en-IN")}
          </h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border-rose-500/30">
          <p className="text-[11px] font-semibold text-slate-400">Pending</p>
          <h3 className="text-lg font-extrabold text-rose-400 mt-0.5">
            ₹{metrics.totalPending.toLocaleString("en-IN")}
          </h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-gradient-to-br from-purple-950 via-slate-900 to-slate-950 border-purple-500/30">
          <p className="text-[11px] font-semibold text-slate-400">Paid Ratio</p>
          <h3 className="text-lg font-extrabold text-purple-300 mt-0.5">
            {metrics.paidCount} / {metrics.totalStudents}
          </h3>
        </SaaSCard>
      </div>

      {/* STICKY SEARCH & STATUS FILTER */}
      <div className="space-y-3 sticky top-[60px] z-20 bg-slate-950/90 backdrop-blur-md pt-1 pb-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search student or phone..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-12 bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500 shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar-hidden py-1">
          {["All", "Paid", "Partial", "Unpaid"].map((status) => (
            <button
              key={status}
              onClick={() => {
                setFilterStatus(status);
                setCurrentPage(1);
              }}
              className={clsx(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
                filterStatus === status
                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE PAYMENT CARDS LIST */}
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

      {/* Pagination Controls */}
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
