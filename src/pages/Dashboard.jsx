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
  Calendar,
  Clock,
  Sparkles,
  ShieldAlert,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { subscribeStudents } from "../services/studentsService";
import { getSeatMatrix } from "../utils/seatLogic";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";

export const Dashboard = ({ onTabChange }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [isActivityOpen, setIsActivityOpen] = useState(true);

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

  const activeStudents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return students.filter((s) => {
      if (!s.validityTo) return true;
      return new Date(s.validityTo) >= today;
    }).length;
  }, [students]);

  const pendingAmount = useMemo(() => {
    return students.reduce((sum, s) => {
      const balance = Math.max(0, (s.totalAmount || 0) - (s.paidAmount || 0));
      return sum + balance;
    }, 0);
  }, [students]);

  const monthlyCollection = useMemo(() => {
    return students.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
  }, [students]);

  const todayAttendance = useMemo(() => {
    return Math.round(activeStudents * 0.85);
  }, [activeStudents]);

  const revenueChartData = [
    { month: "Jan", revenue: Math.round(monthlyCollection * 0.6) },
    { month: "Feb", revenue: Math.round(monthlyCollection * 0.7) },
    { month: "Mar", revenue: Math.round(monthlyCollection * 0.85) },
    { month: "Apr", revenue: Math.round(monthlyCollection * 0.75) },
    { month: "May", revenue: Math.round(monthlyCollection * 0.9) },
    { month: "Jun", revenue: monthlyCollection },
  ];

  const studentGrowthData = [
    { month: "Jan", count: Math.max(1, Math.round(students.length * 0.4)) },
    { month: "Feb", count: Math.max(1, Math.round(students.length * 0.55)) },
    { month: "Mar", count: Math.max(1, Math.round(students.length * 0.7)) },
    { month: "Apr", count: Math.max(1, Math.round(students.length * 0.82)) },
    { month: "May", count: Math.max(1, Math.round(students.length * 0.9)) },
    { month: "Jun", count: students.length },
  ];

  const paymentBreakdownData = [
    { name: "Paid", value: students.filter((s) => s.paidAmount >= s.totalAmount && s.totalAmount > 0).length || 1, color: "#10b981" },
    { name: "Partial", value: students.filter((s) => s.paidAmount > 0 && s.paidAmount < s.totalAmount).length || 0, color: "#f59e0b" },
    { name: "Unpaid", value: students.filter((s) => (s.paidAmount || 0) === 0).length || 0, color: "#f43f5e" },
  ];

  const batchOccupancyData = useMemo(() => {
    const batches = { Morning: 0, Noon: 0, Afternoon: 0, Evening: 0 };
    students.forEach((s) => {
      const bStr = Array.isArray(s.batch) ? s.batch.join(" ") : String(s.batch || "");
      if (bStr.toLowerCase().includes("morning") || bStr.includes("6AM-10AM")) batches.Morning++;
      if (bStr.toLowerCase().includes("noon") || bStr.includes("10AM-2PM")) batches.Noon++;
      if (bStr.toLowerCase().includes("afternoon") || bStr.includes("2PM-6PM")) batches.Afternoon++;
      if (bStr.toLowerCase().includes("evening") || bStr.includes("6PM-10PM")) batches.Evening++;
    });

    return [
      { name: "Morning", students: batches.Morning },
      { name: "Noon", students: batches.Noon },
      { name: "Afternoon", students: batches.Afternoon },
      { name: "Evening", students: batches.Evening },
    ];
  }, [students]);

  const expiringMemberships = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return students.filter((s) => {
      if (!s.validityTo) return false;
      const expiry = new Date(s.validityTo);
      const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });
  }, [students]);

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Mobile Top Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">
            Dashboard <Sparkles className="text-amber-400" size={18} />
          </h1>
          <p className="text-xs text-slate-400">
            Realtime Library Statistics & Controls
          </p>
        </div>

        <button
          onClick={() => onTabChange("seats")}
          className="h-10 px-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Armchair size={15} /> 100 Seats
        </button>
      </div>

      {/* QUICK ACTIONS HORIZONTAL SCROLL SECTION */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap size={14} className="text-amber-400" /> Quick Actions
        </h3>
        <div className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar-hidden pb-1">
          <button
            onClick={() => onTabChange("students")}
            className="flex-shrink-0 min-w-[130px] p-3.5 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-300 text-xs font-bold flex flex-col items-center gap-2 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md">
              <UserPlus size={18} />
            </div>
            <span>Add Student</span>
          </button>

          <button
            onClick={() => onTabChange("seats")}
            className="flex-shrink-0 min-w-[130px] p-3.5 rounded-2xl bg-purple-600/15 border border-purple-500/30 text-purple-300 text-xs font-bold flex flex-col items-center gap-2 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md">
              <Armchair size={18} />
            </div>
            <span>Assign Seat</span>
          </button>

          <button
            onClick={() => onTabChange("payments")}
            className="flex-shrink-0 min-w-[130px] p-3.5 rounded-2xl bg-emerald-600/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex flex-col items-center gap-2 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <DollarSign size={18} />
            </div>
            <span>Collect Fee</span>
          </button>

          <button
            onClick={() => onTabChange("payments")}
            className="flex-shrink-0 min-w-[130px] p-3.5 rounded-2xl bg-amber-600/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex flex-col items-center gap-2 active:scale-95 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-md">
              <Bell size={18} />
            </div>
            <span>Send Reminder</span>
          </button>
        </div>
      </div>

      {/* VERTICALLY STACKED MOBILE METRIC CARDS */}
      <div className="grid grid-cols-2 gap-3">
        <SaaSCard className="p-4 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 border-blue-500/30">
          <p className="text-xs font-semibold text-slate-400">Total Enrolled</p>
          <h3 className="text-2xl font-extrabold text-white mt-1">{students.length}</h3>
          <p className="text-[10px] text-blue-400 mt-1 font-semibold flex items-center gap-1">
            <TrendingUp size={12} /> Active Students
          </p>
        </SaaSCard>

        <SaaSCard className="p-4 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border-emerald-500/30">
          <p className="text-xs font-semibold text-slate-400">Total Revenue</p>
          <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">₹{monthlyCollection}</h3>
          <p className="text-[10px] text-emerald-400 mt-1 font-semibold">Collected in full</p>
        </SaaSCard>

        <SaaSCard className="p-4 bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 border-amber-500/30">
          <p className="text-xs font-semibold text-slate-400">Seat Occupancy</p>
          <h3 className="text-2xl font-extrabold text-white mt-1">{occupiedSeatsCount} / 100</h3>
          <p className="text-[10px] text-amber-400 mt-1 font-semibold">{availableSeatsCount} Seats Free</p>
        </SaaSCard>

        <SaaSCard className="p-4 bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border-rose-500/30">
          <p className="text-xs font-semibold text-slate-400">Pending Fee</p>
          <h3 className="text-2xl font-extrabold text-rose-400 mt-1">₹{pendingAmount}</h3>
          <p className="text-[10px] text-rose-400 mt-1 font-semibold">Due collection</p>
        </SaaSCard>
      </div>

      {/* HORIZONTALLY SCROLLABLE CHARTS CONTAINERS */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Analytics Charts</h3>

        {/* Monthly Revenue Chart */}
        <SaaSCard className="p-4 overflow-x-auto custom-scrollbar-hidden">
          <h4 className="text-xs font-bold text-white mb-3">Monthly Revenue Trend</h4>
          <div className="h-44 min-w-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRevM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevM)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SaaSCard>

        {/* Batch Shift Occupancy Bar Chart */}
        <SaaSCard className="p-4 overflow-x-auto custom-scrollbar-hidden">
          <h4 className="text-xs font-bold text-white mb-3">Batch Shift Occupancy</h4>
          <div className="h-44 min-w-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={batchOccupancyData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                <Bar dataKey="students" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SaaSCard>
      </div>

      {/* COLLAPSIBLE RECENT ACTIVITY STREAM */}
      <SaaSCard className="p-4">
        <div
          onClick={() => setIsActivityOpen(!isActivityOpen)}
          className="flex items-center justify-between cursor-pointer"
        >
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-rose-400" /> Expiring Memberships ({expiringMemberships.length})
          </h3>
          <button className="text-slate-400 hover:text-white">
            {isActivityOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        <AnimatePresence>
          {isActivityOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 mt-3 overflow-hidden"
            >
              {expiringMemberships.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-white">{s.name}</p>
                    <p className="text-[10px] text-slate-400">Seat #{s.seatNumber || "N/A"}</p>
                  </div>
                  <Badge variant="warning">Due: {s.validityTo}</Badge>
                </div>
              ))}

              {expiringMemberships.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-2">
                  No memberships expiring within 7 days.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SaaSCard>
    </div>
  );
};
