import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  CreditCard,
  AlertCircle,
  Armchair,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  UserPlus,
  Bell,
  Sparkles,
  FileText,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { subscribeStudents } from "../services/studentsService";
import { getSeatMatrix } from "../utils/seatLogic";
import { SaaSCard } from "../components/SaaSCard";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { MembershipAlertsWidget } from "../components/MembershipAlertsWidget";
import { TodaysTasksWidget } from "../components/TodaysTasksWidget";

export const Dashboard = ({ onTabChange }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const seatMatrix = useMemo(() => getSeatMatrix(students, 100), [students]);

  const occupiedSeatsCount = useMemo(() => {
    return seatMatrix.filter((s) => s.occupiedSlotsCount > 0).length;
  }, [seatMatrix]);

  const availableSeatsCount = 100 - occupiedSeatsCount;

  const paidCount = useMemo(() => {
    return students.filter(
      (s) => s.status === "Paid" || (s.paidAmount >= s.totalAmount && s.totalAmount > 0)
    ).length;
  }, [students]);

  const partialCount = useMemo(() => {
    return students.filter(
      (s) => s.status === "Partial" || (s.paidAmount > 0 && s.paidAmount < s.totalAmount)
    ).length;
  }, [students]);

  const unpaidCount = useMemo(() => {
    return students.filter((s) => (s.paidAmount || 0) === 0).length;
  }, [students]);

  const monthlyCollection = useMemo(() => {
    return students.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
  }, [students]);

  const revenueChartData = [
    { month: "Jan", revenue: Math.round(monthlyCollection * 0.6) },
    { month: "Feb", revenue: Math.round(monthlyCollection * 0.7) },
    { month: "Mar", revenue: Math.round(monthlyCollection * 0.85) },
    { month: "Apr", revenue: Math.round(monthlyCollection * 0.75) },
    { month: "May", revenue: Math.round(monthlyCollection * 0.9) },
    { month: "Jun", revenue: monthlyCollection },
  ];

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER & QUICK ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Dashboard <Sparkles className="text-amber-400" size={20} />
          </h1>
          <p className="text-xs text-slate-400">
            Action-first workspace & realtime library operations
          </p>
        </div>

        {/* QUICK ACTIONS ICON BUTTONS BAR */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => onTabChange("students")}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-md shadow-blue-600/20"
          >
            <Plus size={14} />
            <span>Add Student</span>
          </button>

          <button
            onClick={() => onTabChange("payments")}
            className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <CreditCard size={14} />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => onTabChange("seats")}
            className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <Armchair size={14} />
            <span>Assign Seat</span>
          </button>

          <button
            onClick={() => onTabChange("reports")}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <FileText size={14} />
            <span>Export Report</span>
          </button>

          <button
            onClick={() => onTabChange("communication")}
            className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <Bell size={14} />
            <span>Send Reminder</span>
          </button>
        </div>
      </div>

      {/* QUICK STATS (7 COMPACT METRIC CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <SaaSCard className="p-3.5 bg-slate-900 border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400">Total Students</p>
          <h3 className="text-xl font-extrabold text-white mt-1">{students.length}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-emerald-500/20">
          <p className="text-[11px] font-semibold text-emerald-400">Paid</p>
          <h3 className="text-xl font-extrabold text-emerald-400 mt-1">{paidCount}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-amber-500/20">
          <p className="text-[11px] font-semibold text-amber-400">Partial</p>
          <h3 className="text-xl font-extrabold text-amber-400 mt-1">{partialCount}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-rose-500/20">
          <p className="text-[11px] font-semibold text-rose-400">Unpaid</p>
          <h3 className="text-xl font-extrabold text-rose-400 mt-1">{unpaidCount}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-blue-500/20">
          <p className="text-[11px] font-semibold text-blue-400">Available Seats</p>
          <h3 className="text-xl font-extrabold text-blue-400 mt-1">{availableSeatsCount}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-purple-500/20">
          <p className="text-[11px] font-semibold text-purple-400">Occupied Seats</p>
          <h3 className="text-xl font-extrabold text-purple-400 mt-1">{occupiedSeatsCount}</h3>
        </SaaSCard>

        <SaaSCard className="p-3.5 bg-slate-900 border-slate-800 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-slate-400">Revenue (Month)</p>
          <h3 className="text-xl font-extrabold text-emerald-400 mt-1">₹{monthlyCollection}</h3>
        </SaaSCard>
      </div>

      {/* TODAY'S TASKS WIDGET */}
      <TodaysTasksWidget students={students} onTabChange={onTabChange} />

      {/* MEMBERSHIP EXPIRY ALERTS WIDGET */}
      <MembershipAlertsWidget students={students} />

      {/* SMALL MONTHLY REVENUE CHART AT VERY BOTTOM */}
      <SaaSCard className="p-5 bg-slate-900/80 border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white">Monthly Revenue Trend</h3>
            <p className="text-[11px] text-slate-400">Historical collection overview</p>
          </div>
          <span className="text-xs font-semibold text-emerald-400">₹{monthlyCollection} Total</span>
        </div>

        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="smallRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#smallRevGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SaaSCard>
    </div>
  );
};
