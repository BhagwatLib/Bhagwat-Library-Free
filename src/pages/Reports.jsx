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
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { getStudents, getBatches } from "../utils/store";
import { getSeatMatrix } from "../utils/seatLogic";
import { exportToPDF, exportToExcel } from "../utils/exportUtils";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";

export const Reports = () => {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReportTab, setActiveReportTab] = useState("revenue");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [sList, bList] = await Promise.all([getStudents(), getBatches()]);
      setStudents(sList);
      setBatches(bList);
      setLoading(false);
    };
    load();
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="text-emerald-400" size={26} /> Comprehensive Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400">
            Generate and export library financial reports, seat occupancy, and batch performance
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95"
          >
            <Download size={16} /> Export PDF Report
          </button>
          <button
            onClick={handleExportExcel}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95"
          >
            <FileSpreadsheet size={16} /> Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: "revenue", label: "Revenue Analytics", icon: DollarSign },
          { id: "occupancy", label: "Seat Occupancy", icon: Armchair },
          { id: "batches", label: "Batch Performance", icon: School },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeReportTab === tab.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Revenue Tab View */}
      {activeReportTab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SaaSCard className="p-5">
              <p className="text-xs text-slate-400 font-semibold">Total Revenue Expected</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">₹{revenueSummary.expected}</h3>
            </SaaSCard>

            <SaaSCard className="p-5">
              <p className="text-xs text-slate-400 font-semibold">Total Revenue Collected</p>
              <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">₹{revenueSummary.collected}</h3>
            </SaaSCard>

            <SaaSCard className="p-5">
              <p className="text-xs text-slate-400 font-semibold">Total Pending Dues</p>
              <h3 className="text-2xl font-extrabold text-rose-400 mt-1">₹{revenueSummary.pending}</h3>
            </SaaSCard>
          </div>

          <SaaSCard className="p-6">
            <h3 className="text-sm font-bold text-white mb-4">Financial Collection Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Total Expected", amount: revenueSummary.expected, fill: "#3b82f6" },
                    { name: "Total Collected", amount: revenueSummary.collected, fill: "#10b981" },
                    { name: "Total Pending", amount: revenueSummary.pending, fill: "#f43f5e" },
                  ]}
                >
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                  <Bar dataKey="amount" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SaaSCard>
        </div>
      )}

      {/* Seat Occupancy Tab View */}
      {activeReportTab === "occupancy" && (
        <div className="space-y-6">
          <SaaSCard className="p-6">
            <h3 className="text-sm font-bold text-white mb-2">Library Seat Utilization (Seats 1-100)</h3>
            <p className="text-xs text-slate-400 mb-4">
              Virtual slot occupancy breakdown across 4 time shifts
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xs text-slate-400">Total Base Seats</p>
                <p className="text-2xl font-extrabold text-white mt-1">100</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xs text-slate-400">Occupied Seats</p>
                <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                  {seatMatrix.filter((s) => s.occupiedSlotsCount > 0).length}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xs text-slate-400">Fully Available Seats</p>
                <p className="text-2xl font-extrabold text-blue-400 mt-1">
                  {seatMatrix.filter((s) => s.occupiedSlotsCount === 0).length}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xs text-slate-400">Shift Slots Allocated</p>
                <p className="text-2xl font-extrabold text-purple-400 mt-1">
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
          <SaaSCard className="p-6">
            <h3 className="text-sm font-bold text-white mb-4">Batch Performance Breakdown</h3>
            <div className="space-y-3">
              {batches.map((b) => {
                const bStudents = students.filter((s) => {
                  const bStr = Array.isArray(s.batch) ? s.batch.join(" ") : String(s.batch || "");
                  return bStr.includes(b.time);
                });
                return (
                  <div key={b.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-white">{b.time}</p>
                      <p className="text-slate-400 mt-0.5">{bStudents.length} Students enrolled</p>
                    </div>
                    <Badge variant="purple">₹{b.price} / Month</Badge>
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
