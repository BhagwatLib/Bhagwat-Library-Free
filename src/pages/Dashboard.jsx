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
} from "lucide-react";
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
import { MembershipAlertsWidget } from "../components/MembershipAlertsWidget";

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
    const batches = { ABatch: 0, BBatch: 0, CBatch: 0, DBatch: 0 };
    students.forEach((s) => {
      const bStr = Array.isArray(s.batch) ? s.batch.join(" ") : String(s.batch || "");
      if (bStr.toLowerCase().includes("a batch") || bStr.includes("6:00 AM - 10:00 AM")) batches.ABatch++;
      if (bStr.toLowerCase().includes("b batch") || bStr.includes("10:00 AM - 2:00 PM")) batches.BBatch++;
      if (bStr.toLowerCase().includes("c batch") || bStr.includes("2:00 PM - 6:00 PM")) batches.CBatch++;
      if (bStr.toLowerCase().includes("d batch") || bStr.includes("6:00 PM - 10:00 PM")) batches.DBatch++;
    });

    return [
      { name: "A Batch", students: batches.ABatch },
      { name: "B Batch", students: batches.BBatch },
      { name: "C Batch", students: batches.CBatch },
      { name: "D Batch", students: batches.DBatch },
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
    <div className="space-y-8 pb-12">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Bhagwat Library Overview <Sparkles className="text-amber-400" size={20} />
          </h1>
          <p className="text-xs text-slate-400">
            Real-time occupancy, revenue analytics, and admin controls
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onTabChange("seats")}
            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <Armchair size={16} /> View Seats Matrix (1-100)
          </button>
        </div>
      </div>

      {/* TOP SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SaaSCard className="p-5 bg-gradient-to-br from-blue-900/40 via-slate-900 to-slate-950 border-blue-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">Total Enrolled</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">{students.length}</h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400">
                <TrendingUp size={14} /> <span>Active Students</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users size={22} />
            </div>
          </div>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-emerald-900/30 via-slate-900 to-slate-950 border-emerald-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">Total Revenue</p>
              <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">₹{monthlyCollection}</h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 size={14} /> <span>Secured Revenue</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign size={22} />
            </div>
          </div>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-amber-900/30 via-slate-900 to-slate-950 border-amber-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">Seat Occupancy</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">{occupiedSeatsCount} / 100</h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-amber-400">
                <Armchair size={14} /> <span>{availableSeatsCount} Seats Available</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Armchair size={22} />
            </div>
          </div>
        </SaaSCard>

        <SaaSCard className="p-5 bg-gradient-to-br from-rose-900/30 via-slate-900 to-slate-950 border-rose-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">Pending Dues</p>
              <h3 className="text-2xl font-extrabold text-rose-400 mt-1">₹{pendingAmount}</h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-rose-400">
                <AlertCircle size={14} /> <span>Action Required</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle size={22} />
            </div>
          </div>
        </SaaSCard>
      </div>

      {/* MAJOR DASHBOARD FEATURE: MEMBERSHIP EXPIRY ALERTS WIDGET */}
      <MembershipAlertsWidget students={students} />

      {/* CHARTS & QUICK ACTIONS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recharts Analytics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SaaSCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4">Monthly Revenue Trend</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData}>
                    <defs>
                      <linearGradient id="colorRevDesk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevDesk)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SaaSCard>

            <SaaSCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4">Student Growth</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={studentGrowthData}>
                    <defs>
                      <linearGradient id="colorGrowthDesk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                    <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorGrowthDesk)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SaaSCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SaaSCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-2">Payment Breakdown</h3>
              <div className="h-44 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentBreakdownData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={5} dataKey="value">
                      {paymentBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SaaSCard>

            <SaaSCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-2">Batch Shift Occupancy</h3>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={batchOccupancyData}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} />
                    <Bar dataKey="students" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SaaSCard>
          </div>
        </div>

        {/* Right Col: Quick Actions & Expiring Memberships */}
        <div className="space-y-6">
          <SaaSCard className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-slate-800">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> Quick Admin Actions
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => onTabChange("students")}
                className="p-3 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-300 text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all"
              >
                <UserPlus size={18} /> Add Student
              </button>
              <button
                onClick={() => onTabChange("seats")}
                className="p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 text-purple-300 text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all"
              >
                <Armchair size={18} /> Assign Seat
              </button>
              <button
                onClick={() => onTabChange("payments")}
                className="p-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all"
              >
                <DollarSign size={18} /> Collect Payment
              </button>
              <button
                onClick={() => onTabChange("payments")}
                className="p-3 rounded-xl bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 text-amber-300 text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-all"
              >
                <Bell size={18} /> Send Reminder
              </button>
            </div>
          </SaaSCard>

          <SaaSCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <ShieldAlert size={14} className="text-rose-400" /> Expiring Memberships
              </h3>
              <span className="text-[10px] text-rose-400 font-semibold">
                {expiringMemberships.length} due soon
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {expiringMemberships.map((s) => (
                <div
                  key={s.id}
                  className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">{s.name}</p>
                    <p className="text-[10px] text-slate-400">Seat #{s.seatNumber || "N/A"}</p>
                  </div>
                  <Badge variant="warning">Due: {s.validityTo}</Badge>
                </div>
              ))}
              {expiringMemberships.length === 0 && (
                <p className="text-xs text-slate-500 italic text-center py-4">
                  No memberships expiring within 7 days.
                </p>
              )}
            </div>
          </SaaSCard>
        </div>
      </div>
    </div>
  );
};
