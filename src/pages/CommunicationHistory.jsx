import React, { useState, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Search,
  Calendar,
  Filter,
  Eye,
  X,
  FileText,
  Bell,
  CheckCircle,
  XCircle,
  HelpCircle,
  Users,
} from "lucide-react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { Pagination } from "../components/Pagination";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { clsx } from "clsx";

export const CommunicationHistory = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [selectedLog, setSelectedLog] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Subscribe to Firestore communicationHistory collection in realtime
  useEffect(() => {
    setLoading(true);
    const logsRef = collection(db, "communicationHistory");
    const q = query(logsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setLogs(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error subscribing to communication logs:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter logs based on search query, type, and date range
  const filteredLogs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);

    return logs.filter((log) => {
      // 1. Search Query Match (Name, Phone, Seat)
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        log.studentName?.toLowerCase().includes(term) ||
        log.phone?.includes(term) ||
        String(log.seatNumber).includes(term);

      // 2. Message Type Filter
      const matchesType =
        typeFilter === "All" ||
        log.messageType?.toLowerCase() === typeFilter.toLowerCase();

      // 3. Date Timeframe Filter
      let matchesDate = true;
      if (log.createdAt) {
        // Handle Firestore Timestamp or JSON date
        const logDate = log.createdAt.seconds
          ? new Date(log.createdAt.seconds * 1000)
          : new Date(log.createdAt);

        if (dateFilter === "Today") {
          matchesDate = logDate >= today;
        } else if (dateFilter === "This Week") {
          matchesDate = logDate >= oneWeekAgo;
        } else if (dateFilter === "This Month") {
          matchesDate = logDate >= oneMonthAgo;
        }
      }

      return matchesSearch && matchesType && matchesDate;
    });
  }, [logs, searchTerm, typeFilter, dateFilter]);

  // Paginated Logs
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;

  // Format date helper
  const formatDateTime = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);
    
    return {
      date: date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  if (loading) {
    return <SkeletonLoader type="table" rows={6} />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
          Communication History <span className="jewel-dot cyan" />
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Realtime dispatch ledger of student payment invoices and WhatsApp renewal notices
        </p>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search logs by student, phone, seat..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="skeuo-input w-full pl-10 pr-4 py-2.5 text-xs font-medium placeholder:text-slate-400"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {["All", "Invoice", "Reminder"].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTypeFilter(t);
                  setCurrentPage(1);
                }}
                className={clsx(
                  "skeuo-badge px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-all rounded-xl cursor-pointer",
                  typeFilter === t
                    ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40 font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Time filters */}
        <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800/60 pt-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
            <Calendar size={13} /> Timeframe:
          </span>
          {["All", "Today", "This Week", "This Month"].map((d) => (
            <button
              key={d}
              onClick={() => {
                setDateFilter(d);
                setCurrentPage(1);
              }}
              className={clsx(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateFilter === d
                  ? "skeuo-dial text-blue-600 dark:text-cyan-400 border border-blue-500/30 px-3"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden lg:block">
        <div className="mb-3 text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
          Ledger contains {filteredLogs.length} logged events
        </div>

        <SaaSCard className="overflow-hidden p-0" withGrip>
          <div className="overflow-x-auto custom-scrollbar p-2">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Phone Number</th>
                  <th className="px-5 py-3.5 text-center">Seat</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Message Type</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Time</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {paginatedLogs.map((log) => {
                  const isInv = log.messageType === "invoice";
                  const isSuccess = log.status === "sent" || log.status === "success";
                  const dt = formatDateTime(log.createdAt || log.sentAt);

                  return (
                    <tr key={log.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-white">
                        {log.studentName}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-medium">
                        {log.phone}
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-slate-800 dark:text-white">
                        {log.seatNumber ? `#${log.seatNumber}` : "None"}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                        {log.batch || "N/A"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge dot variant={isInv ? "success" : "warning"}>
                          {isInv ? "Invoice" : "Reminder"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge dot variant={isSuccess ? "success" : "danger"}>
                          {isSuccess ? "Sent" : "Failed"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                        {dt.date}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                        {dt.time}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400"
                          title="View Details"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedLogs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-500 italic">
                      No communication records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={setItemsPerPage}
              totalItems={filteredLogs.length}
            />
          </div>
        </SaaSCard>
      </div>

      {/* MOBILE LIST */}
      <div className="block lg:hidden space-y-3">
        <div className="mb-1 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
          Log contains {filteredLogs.length} entries
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paginatedLogs.map((log) => {
            const isInv = log.messageType === "invoice";
            const isSuccess = log.status === "sent" || log.status === "success";
            const dt = formatDateTime(log.createdAt || log.sentAt);

            return (
              <SaaSCard key={log.id} className="p-4 space-y-3" withGrip>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">{log.studentName}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{log.phone}</p>
                  </div>
                  <Badge dot variant={isSuccess ? "success" : "danger"}>
                    {isSuccess ? "Sent" : "Failed"}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 bg-slate-200/50 dark:bg-slate-950 p-2.5 rounded-xl text-[11px] skeuo-inset">
                  <div>
                    <p className="text-slate-400">Seat</p>
                    <p className="font-bold text-slate-800 dark:text-white mt-0.5">{log.seatNumber ? `#${log.seatNumber}` : "None"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Type</p>
                    <p className="font-bold text-blue-600 dark:text-cyan-400 mt-0.5 capitalize">{log.messageType}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Time</p>
                    <p className="font-semibold text-slate-600 dark:text-slate-355 mt-0.5">{dt.time}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                  <span>{dt.date}</span>
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="text-blue-600 dark:text-cyan-400 font-bold flex items-center gap-1"
                  >
                    <Eye size={12} /> View Details
                  </button>
                </div>
              </SaaSCard>
            );
          })}

          {paginatedLogs.length === 0 && (
            <p className="py-12 text-center text-slate-500 text-xs italic">
              No communication logs matching selected filters.
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
            totalItems={filteredLogs.length}
          />
        </div>
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="skeuo-card w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider flex items-center gap-1.5">
                Log Entry Details <span className="jewel-dot cyan" />
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="skeuo-dial w-7 h-7 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs skeuo-inset p-4">
              <div className="flex justify-between">
                <span className="text-slate-550">Student Name:</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLog.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Phone:</span>
                <span className="font-semibold text-slate-800 dark:text-white">{selectedLog.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Seat Number:</span>
                <span className="font-bold text-slate-800 dark:text-white">{selectedLog.seatNumber ? `#${selectedLog.seatNumber}` : "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Assigned Batch:</span>
                <span className="font-semibold text-slate-800 dark:text-white">{selectedLog.batch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Message Type:</span>
                <Badge dot variant={selectedLog.messageType === "invoice" ? "success" : "warning"}>
                  {selectedLog.messageType}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Delivery Status:</span>
                <Badge dot variant={selectedLog.status === "sent" || selectedLog.status === "success" ? "success" : "danger"}>
                  {selectedLog.status}
                </Badge>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
                <span className="text-slate-550">Sent Date:</span>
                <span className="text-slate-800 dark:text-white font-bold">
                  {formatDateTime(selectedLog.createdAt || selectedLog.sentAt).date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-550">Sent Time:</span>
                <span className="text-slate-800 dark:text-white font-bold">
                  {formatDateTime(selectedLog.createdAt || selectedLog.sentAt).time}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="skeuo-btn w-full py-2.5 text-xs font-bold"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
