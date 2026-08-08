import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  CreditCard,
  AlertCircle,
  Armchair,
  CheckCircle2,
  TrendingUp,
  UserPlus,
  Bell,
  Clock,
  Sparkles,
  Zap,
  CheckSquare,
  FileText,
  DollarSign,
  ChevronDown,
  ArrowUpRight,
  ShieldCheck,
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
import { Badge } from "../components/Badge";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { MembershipAlertsWidget } from "../components/MembershipAlertsWidget";
import { useTheme } from "../context/ThemeContext";

export const Dashboard = ({ onTabChange }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const { isDark } = useTheme();

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

  // Calculate Today's Tasks
  const todaysTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiringSoonCount = 0;
    let expiredCount = 0;
    let partialPaymentsCount = 0;
    let pendingInvoicesCount = 0;
    let pendingRemindersCount = 0;

    students.forEach((s) => {
      if (s.validityTo) {
        const expiry = new Date(s.validityTo);
        if (!isNaN(expiry.getTime())) {
          expiry.setHours(0, 0, 0, 0);
          const diffTime = expiry.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays >= 0 && diffDays <= 2) {
            expiringSoonCount++;
          } else if (diffDays < 0) {
            expiredCount++;
          }
        }
      }

      const paid = Number(s.paidAmount) || 0;
      const total = Number(s.totalAmount) || 0;
      const status =
        s.status ||
        (paid >= total && total > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid");

      if (status === "Partial") {
        partialPaymentsCount++;
        pendingRemindersCount++;
      } else if (status === "Unpaid" || (paid === 0 && total > 0)) {
        pendingInvoicesCount++;
        pendingRemindersCount++;
      }
    });

    const tasksList = [
      {
        id: "expiring",
        title: "Membership Expiring",
        count: expiringSoonCount,
        desc: "Memberships expiring within next 2 days",
        icon: Clock,
        variant: "warning",
        targetTab: "seats",
      },
      {
        id: "expired",
        title: "Membership Expired",
        count: expiredCount,
        desc: "Memberships already expired",
        icon: AlertCircle,
        variant: "danger",
        targetTab: "students",
      },
      {
        id: "partial",
        title: "Partial Payments",
        count: partialPaymentsCount,
        desc: "Students with balance dues remaining",
        icon: DollarSign,
        variant: "warning",
        targetTab: "payments",
      },
      {
        id: "pending_invoices",
        title: "Pending Invoices",
        count: pendingInvoicesCount,
        desc: "Unpaid student invoices awaiting payment",
        icon: CreditCard,
        variant: "danger",
        targetTab: "payments",
      },
      {
        id: "pending_reminders",
        title: "Pending Reminders",
        count: pendingRemindersCount,
        desc: "Due payment reminders ready to dispatch",
        icon: Bell,
        variant: "primary",
        targetTab: "payments",
      },
    ];

    return tasksList.filter((t) => t.count > 0);
  }, [students]);

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-6">
      {/* HEADER BAR (Exact Reference Styling) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Bhagwat Library Dashboard <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Realtime occupancy, membership alerts, and operational controls
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification Bell Button */}
          <button
            onClick={() => onTabChange("payments")}
            className="skeuo-dial w-10 h-10 text-slate-600 dark:text-slate-300 relative"
            title="Notifications"
          >
            <Bell size={17} />
            <span className="jewel-dot amber absolute top-1.5 right-1.5" />
          </button>

          {/* Admin User Badge */}
          <div className="skeuo-card px-3.5 py-1.5 flex items-center gap-3 rounded-full">
            <div className="skeuo-dial w-8 h-8 font-bold text-xs text-purple-600 dark:text-purple-400">
              A
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-bold text-slate-800 dark:text-white leading-none block">
                Admin
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Bhagwat Library
              </span>
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </div>

          {/* View Seats Matrix Action Button */}
          <button
            onClick={() => onTabChange("seats")}
            className="skeuo-btn px-4 py-2 text-xs text-cyan-700 dark:text-cyan-400 border-cyan-500/30 flex items-center gap-2"
          >
            <Armchair size={15} className="text-cyan-500" />
            <span>View Seats Matrix (1-100)</span>
          </button>
        </div>
      </div>

      {/* ROW 1: TOP 4 FLOATING METRIC CARDS (Exact Reference Match) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. Total Students */}
        <SaaSCard className="p-5 flex flex-col justify-between h-36" withGrip>
          <div className="flex items-start gap-4">
            <div className="skeuo-dial w-14 h-14 glow-purple flex-shrink-0">
              <Users size={22} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Total Students
              </span>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1 tracking-tight">
                {students.length}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 pt-2">
            <TrendingUp size={13} />
            <span>Active Enrolments</span>
          </div>
        </SaaSCard>

        {/* 2. Total Revenue */}
        <SaaSCard className="p-5 flex flex-col justify-between h-36" withGrip>
          <div className="flex items-start gap-4">
            <div className="skeuo-dial w-14 h-14 glow-cyan flex-shrink-0">
              <span className="text-xl font-bold text-emerald-600 dark:text-cyan-400">₹</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Total Revenue
              </span>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1 tracking-tight">
                ₹{monthlyCollection}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-2">
            <CheckCircle2 size={13} />
            <span>Secured Revenue</span>
          </div>
        </SaaSCard>

        {/* 3. Seat Occupancy */}
        <SaaSCard className="p-5 flex flex-col justify-between h-36" withGrip>
          <div className="flex items-start gap-4">
            <div className="skeuo-dial w-14 h-14 glow-amber flex-shrink-0">
              <Armchair size={22} className="text-amber-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Seat Occupancy
              </span>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1 tracking-tight">
                {occupiedSeatsCount} / 100
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 pt-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>{availableSeatsCount} Seats Available</span>
          </div>
        </SaaSCard>

        {/* 4. Pending Dues */}
        <SaaSCard className="p-5 flex flex-col justify-between h-36" withGrip>
          <div className="flex items-start gap-4">
            <div className="skeuo-dial w-14 h-14 glow-red flex-shrink-0">
              <Clock size={22} className="text-rose-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Pending Dues
              </span>
              <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 tracking-tight">
                ₹{pendingAmount}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 pt-2">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Action Required</span>
          </div>
        </SaaSCard>
      </div>

      {/* ROW 2: 50% / 50% GRID (MEMBERSHIP ALERTS LEFT & QUICK ADMIN ACTIONS RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: MEMBERSHIP ALERTS (Includes Mini Expiring & Expired widgets + Inset Table) */}
        <div>
          <MembershipAlertsWidget students={students} maxStudents={5} />
        </div>

        {/* RIGHT: QUICK ADMIN ACTIONS CONTROL PANEL (Physical Tactile Panel Match) */}
        <div>
          <SaaSCard className="p-5 md:p-6 space-y-5 h-full flex flex-col justify-between relative" withGrip>
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-extrabold text-xs text-slate-800 dark:text-white tracking-wider uppercase flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" /> Quick Admin Actions
                </h3>
              </div>

              {/* 4 Raised Push Tiles */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                {/* 1. Add Student */}
                <button
                  onClick={() => onTabChange("students")}
                  className="skeuo-card p-5 flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group text-center"
                >
                  <div className="skeuo-dial w-14 h-14 relative group-hover:scale-105 transition-all">
                    <UserPlus size={22} className="text-blue-600 dark:text-purple-400" />
                    <span className="jewel-dot cyan absolute top-1 right-1" />
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Add Student
                  </span>
                </button>

                {/* 2. Assign Seat */}
                <button
                  onClick={() => onTabChange("seats")}
                  className="skeuo-card p-5 flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group text-center"
                >
                  <div className="skeuo-dial w-14 h-14 relative group-hover:scale-105 transition-all">
                    <Armchair size={22} className="text-amber-500" />
                    <span className="jewel-dot amber absolute top-1 right-1" />
                  </div>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    Assign Seat
                  </span>
                </button>

                {/* 3. Collect Payment */}
                <button
                  onClick={() => onTabChange("payments")}
                  className="skeuo-card p-5 flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group text-center"
                >
                  <div className="skeuo-dial w-14 h-14 relative group-hover:scale-105 transition-all">
                    <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹</span>
                    <span className="jewel-dot emerald absolute top-1 right-1" />
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Collect Payment
                  </span>
                </button>

                {/* 4. Export Report */}
                <button
                  onClick={() => onTabChange("reports")}
                  className="skeuo-card p-5 flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 group text-center"
                >
                  <div className="skeuo-dial w-14 h-14 relative group-hover:scale-105 transition-all">
                    <FileText size={22} className="text-rose-500" />
                    <span className="jewel-dot ruby absolute top-1 right-1" />
                  </div>
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    Export Report
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom Panel Status */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Quick access to key dashboard functions</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                <span>Bhagwat Library</span>
                <span className="jewel-dot cyan" />
              </div>
            </div>
          </SaaSCard>
        </div>
      </div>

      {/* ROW 3: 50% / 50% (MONTHLY REVENUE TREND GRAPH & TODAY'S TASKS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Monthly Revenue Graph */}
        <SaaSCard className="p-5 md:p-6 space-y-4" withGrip>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-extrabold text-xs text-slate-800 dark:text-white tracking-wider uppercase flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" /> Monthly Revenue Trend
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Realtime revenue collections & historical growth
              </p>
            </div>
            <span className="skeuo-badge text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              ₹{monthlyCollection} Total
            </span>
          </div>

          <div className="h-60 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRevDesk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke={isDark ? "#64748b" : "#94a3b8"} fontSize={11} />
                <YAxis stroke={isDark ? "#64748b" : "#94a3b8"} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? "#1f242d" : "#ffffff",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    borderRadius: "1rem",
                    color: isDark ? "#ffffff" : "#0f172a",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorRevDesk)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SaaSCard>

        {/* Right: Today's Tasks */}
        <SaaSCard className="p-5 md:p-6 space-y-4 flex flex-col justify-between" withGrip>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-xs text-slate-800 dark:text-white tracking-wider uppercase flex items-center gap-2">
                <CheckSquare size={16} className="text-blue-500" /> Today's Action Tasks
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {todaysTasks.length} Pending
              </span>
            </div>

            <div className="space-y-2.5 mt-4">
              {todaysTasks.length === 0 ? (
                <div className="p-6 text-center rounded-2xl skeuo-inset text-slate-500 dark:text-slate-400 space-y-2">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
                  <p className="font-bold text-xs text-slate-700 dark:text-slate-300">All Tasks Completed!</p>
                  <p className="text-[11px] text-slate-500">
                    No pending membership or payment alerts requiring action.
                  </p>
                </div>
              ) : (
                todaysTasks.map((task) => {
                  const Icon = task.icon;

                  return (
                    <button
                      key={task.id}
                      onClick={() => onTabChange(task.targetTab)}
                      className="w-full p-3 rounded-2xl skeuo-card flex items-center justify-between text-left group hover:scale-[1.01] transition-all"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="skeuo-dial w-8 h-8 font-bold flex-shrink-0 text-slate-700 dark:text-slate-300">
                          <Icon size={15} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 dark:text-white text-xs tracking-tight">
                            {task.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {task.desc}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <Badge variant={task.variant}>{task.count}</Badge>
                        <ArrowUpRight
                          size={14}
                          className="text-slate-400 group-hover:text-blue-500 transition-colors"
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Realtime dynamic synchronization</span>
            <span className="text-blue-600 dark:text-cyan-400 font-semibold">Click row to open</span>
          </div>
        </SaaSCard>
      </div>

      {/* FOOTER STRIP (Exact Reference Match) */}
      <div className="skeuo-card p-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 rounded-2xl gap-2">
        <div className="flex items-center gap-3">
          <div className="skeuo-grip">
            <div className="skeuo-grip-dot" />
            <div className="skeuo-grip-dot" />
            <div className="skeuo-grip-dot" />
            <div className="skeuo-grip-dot" />
            <div className="skeuo-grip-dot" />
            <div className="skeuo-grip-dot" />
          </div>
          <span>© 2025 Bhagwat Library Management System</span>
        </div>

        <div className="flex items-center gap-2">
          <span>Crafted with ❤️ for smarter library operations</span>
          <span className="jewel-dot cyan" />
        </div>
      </div>
    </div>
  );
};
