import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Download,
  FileSpreadsheet,
  DollarSign,
  Users,
  Armchair,
  TrendingUp,
  School,
  Calendar,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { subscribeStudents } from "../services/studentsService";
import { subscribeBatches } from "../services/batchesService";
import { getSeatMatrix } from "../utils/seatLogic";
import { exportToPDF, exportToExcel } from "../utils/exportUtils";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { clsx } from "clsx";

export const Reports = () => {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState("revenue");

  useEffect(() => {
    setLoading(true);
    const unsubStudents = subscribeStudents((sList) => {
      setStudents(sList);
      setLoading(false);
    });

    const unsubBatches = subscribeBatches((bList) => {
      setBatches(bList);
    });

    return () => {
      unsubStudents();
      unsubBatches();
    };
  }, []);

  const seatMatrix = useMemo(() => getSeatMatrix(students, 100), [students]);

  // Total Revenue Metrics
  const revenueSummary = useMemo(() => {
    let expected = 0;
    let collected = 0;
    students.forEach((s) => {
      expected += Number(s.totalAmount) || 0;
      collected += Number(s.paidAmount) || 0;
    });
    return {
      expected,
      collected,
      pending: Math.max(0, expected - collected),
    };
  }, [students]);

  // Export Table Data
  const reportExportData = useMemo(() => {
    return students.map((s) => ({
      "Student Name": s.name,
      Phone: s.phone,
      Batch: Array.isArray(s.batch) ? s.batch.join(", ") : s.batch,
      "Seat Number": s.seatNumber || "Unassigned",
      "Total Fee (₹)": s.totalAmount || 0,
      "Paid Amount (₹)": s.paidAmount || 0,
      "Balance (₹)": Math.max(0, (s.totalAmount || 0) - (s.paidAmount || 0)),
      Status: s.status || "Unpaid",
      "Admission Date": s.admissionDate || "-",
      "Validity Expiry": s.validityTo || "-",
    }));
  }, [students]);

  const handleExportPDF = () => {
    const headers = [
      "Student",
      "Phone",
      "Batch",
      "Seat #",
      "Total Fee",
      "Paid",
      "Balance",
      "Status",
    ];
    const rows = students.map((s) => [
      s.name,
      s.phone,
      Array.isArray(s.batch) ? s.batch.join(", ") : s.batch || "-",
      s.seatNumber || "-",
      `Rs.${s.totalAmount || 0}`,
      `Rs.${s.paidAmount || 0}`,
      `Rs.${Math.max(0, (s.totalAmount || 0) - (s.paidAmount || 0))}`,
      s.status || "Unpaid",
    ]);

    exportToPDF("Bhagwat Library Financial & Enrollment Report", headers, rows, "bhagwat_library_report.pdf");
  };

  const handleExportExcel = () => {
    exportToExcel(reportExportData, "bhagwat_library_report.xlsx", "Students & Financials");
  };

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Reports & Analytics <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Export library ledger balance, check seat occupancy, and shift metrics
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            className="skeuo-btn px-4 py-2.5 text-xs font-bold flex items-center gap-2"
          >
            <Download size={14} className="text-rose-500" /> Export PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="skeuo-btn skeuo-btn-primary px-4 py-2.5 text-xs font-bold flex items-center gap-2"
          >
            <FileSpreadsheet size={14} /> Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto custom-scrollbar">
        {[
          { id: "revenue", label: "Revenue Analytics", icon: DollarSign },
          { id: "occupancy", label: "Seat Occupancy", icon: Armchair },
          { id: "batches", label: "Batch Performance", icon: School },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSel = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id)}
              className={clsx(
                "skeuo-badge px-4 py-2 text-xs font-bold cursor-pointer transition-all whitespace-nowrap rounded-xl",
                isSel
                  ? "bg-blue-600 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-300 border border-blue-400/40 font-black"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              )}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Revenue Tab View */}
      {activeReportTab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="skeuo-inset p-5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Expected</span>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">₹{revenueSummary.expected}</h3>
            </div>

            <div className="skeuo-inset p-5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Collected</span>
              <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">₹{revenueSummary.collected}</h3>
            </div>

            <div className="skeuo-inset p-5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Pending Balance</span>
              <h3 className="text-2xl font-black text-rose-500 mt-1">₹{revenueSummary.pending}</h3>
            </div>
          </div>

          <SaaSCard className="p-6" withGrip>
            <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-wider">Revenue Breakdown Chart</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Expected", amount: revenueSummary.expected, fill: "#3b82f6" },
                    { name: "Collected", amount: revenueSummary.collected, fill: "#10b981" },
                    { name: "Pending Dues", amount: revenueSummary.pending, fill: "#f43f5e" },
                  ]}
                >
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SaaSCard>
        </div>
      )}

      {/* Seat Occupancy Tab View */}
      {activeReportTab === "occupancy" && (
        <div className="space-y-6">
          <SaaSCard className="p-6" withGrip>
            <h3 className="text-xs font-black text-slate-800 dark:text-white mb-1 uppercase tracking-wider">Library Seat Utilization</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
              Shift slot occupancy details for all 100 available seat pods
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="skeuo-inset p-4 text-center">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Base Seats</span>
                <p className="text-2xl font-black text-slate-800 dark:text-white mt-1">100</p>
              </div>
              <div className="skeuo-inset p-4 text-center">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Occupied seats</span>
                <p className="text-2xl font-black text-emerald-655 dark:text-emerald-400 mt-1">
                  {seatMatrix.filter((s) => s.occupiedSlotsCount > 0).length}
                </p>
              </div>
              <div className="skeuo-inset p-4 text-center">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Fully Available</span>
                <p className="text-2xl font-black text-blue-500 mt-1">
                  {seatMatrix.filter((s) => s.occupiedSlotsCount === 0).length}
                </p>
              </div>
              <div className="skeuo-inset p-4 text-center">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Total Allocated Slots</span>
                <p className="text-2xl font-black text-purple-500 mt-1">
                  {seatMatrix.reduce((acc, curr) => acc + curr.occupiedSlotsCount, 0)} / 400
                </p>
              </div>
            </div>
          </SaaSCard>
        </div>
      )}

      {/* Batch Performance Tab View */}
      {activeReportTab === "batches" && (
        <div className="space-y-6">
          <SaaSCard className="p-6" withGrip>
            <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-wider">Universal Batch Performance Metrics</h3>
            <div className="space-y-3">
              {batches.map((b) => {
                const bStudents = students.filter((s) => {
                  const bStr = Array.isArray(s.batch) ? s.batch.join(" ") : String(s.batch || "");
                  return (
                    bStr.includes(b.name) ||
                    bStr.includes(b.time) ||
                    (b.slotKey === "all" && (bStr.includes("All Batch") || bStr.includes("All")))
                  );
                });
                const revenue = bStudents.reduce((sum, s) => sum + (s.paidAmount || 0), 0);

                return (
                  <div key={b.id} className="skeuo-inset p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-slate-800 dark:text-white text-sm">{b.name || b.time}</p>
                        <Badge dot variant="purple">{b.duration || "4 Hours"}</Badge>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">{b.time}</p>
                      <p className="text-slate-400 text-[11px] mt-1 font-medium">
                        {bStudents.length} Students active • Revenue Collected: <span className="text-emerald-500 font-bold">₹{revenue}</span>
                      </p>
                    </div>
                    <Badge dot variant="success">
                      ₹{b.price} / Month
                    </Badge>
                  </div>
                );
              })}
            </div>
          </SaaSCard>
        </div>
      )}
    </div>
  );
};
