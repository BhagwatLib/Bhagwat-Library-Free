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
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="text-blue-500" size={26} /> Communication History
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Realtime dispatch history of student payment invoices and WhatsApp due alerts
        </p>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search logs by student, phone, seat..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
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
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border",
                  typeFilter === t
                    ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Time filters */}
        <div className="flex items-center gap-2 border-t border-slate-800/60 pt-3">
          <span className="text-xs text-slate-400 flex items-center gap-1">
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
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                dateFilter === d
                  ? "bg-slate-800 text-white border border-slate-700"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden lg:block">
        <div className="mb-3 text-xs text-slate-400 font-medium">
          Showing {filteredLogs.length} logged communication entries
        </div>

        <SaaSCard className="overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4 text-center">Seat</th>
                  <th className="px-6 py-4">Batch</th>
                  <th className="px-6 py-4">Message Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedLogs.map((log) => {
                  const isInv = log.messageType === "invoice";
                  const isSuccess = log.status === "sent" || log.status === "success";
                  const dt = formatDateTime(log.createdAt || log.sentAt);

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">
                        {log.studentName}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-medium">
                        {log.phone}
                      </td>
                      <td className="px-6 py-4 text-center font-semibold text-slate-200">
                        {log.seatNumber ? `#${log.seatNumber}` : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {log.batch || "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={isInv ? "success" : "warning"}>
                          <span className="flex items-center gap-1">
                            {isInv ? <FileText size={10} /> : <Bell size={10} />}
                            {isInv ? "Invoice" : "Reminder"}
                          </span>
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={isSuccess ? "success" : "danger"}>
                          <span className="flex items-center gap-1">
                            {isSuccess ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {isSuccess ? "Sent" : "Failed"}
                          </span>
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {dt.date}
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {dt.time}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedLogs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500 italic">
                      No communication records found.
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
              totalItems={filteredLogs.length}
            />
          </div>
        </SaaSCard>
      </div>

      {/* MOBILE LIST */}
      <div className="block lg:hidden space-y-3">
        <div className="mb-1 text-xs text-slate-400 font-medium">
          Showing {filteredLogs.length} logged communication entries
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paginatedLogs.map((log) => {
            const isInv = log.messageType === "invoice";
            const isSuccess = log.status === "sent" || log.status === "success";
            const dt = formatDateTime(log.createdAt || log.sentAt);

            return (
              <SaaSCard key={log.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{log.studentName}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{log.phone}</p>
                  </div>
                  <Badge variant={isSuccess ? "success" : "danger"}>
                    {isSuccess ? "Sent" : "Failed"}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 border-t border-b border-slate-800/60 bg-slate-950 p-2.5 rounded-xl text-[11px]">
                  <div>
                    <p className="text-slate-400">Seat</p>
                    <p className="font-bold text-white mt-0.5">{log.seatNumber ? `#${log.seatNumber}` : "None"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Type</p>
                    <p className="font-bold text-blue-400 mt-0.5 capitalize">{log.messageType}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Time</p>
                    <p className="font-semibold text-slate-300 mt-0.5">{dt.time}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>{dt.date}</span>
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="text-blue-400 font-bold flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Log Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Student Name:</span>
                <span className="font-bold text-white">{selectedLog.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="font-medium text-white">{selectedLog.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Seat Number:</span>
                <span className="font-bold text-white">{selectedLog.seatNumber ? `#${selectedLog.seatNumber}` : "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Batch:</span>
                <span className="font-medium text-white">{selectedLog.batch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Type:</span>
                <span className="font-bold text-blue-400 capitalize">{selectedLog.messageType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Delivery Status:</span>
                <Badge variant={selectedLog.status === "sent" || selectedLog.status === "success" ? "success" : "danger"}>
                  {selectedLog.status}
                </Badge>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-3">
                <span className="text-slate-400">Sent Date:</span>
                <span className="text-white font-medium">
                  {formatDateTime(selectedLog.createdAt || selectedLog.sentAt).date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sent Time:</span>
                <span className="text-white font-medium">
                  {formatDateTime(selectedLog.createdAt || selectedLog.sentAt).time}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold py-2.5 rounded-xl border border-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
