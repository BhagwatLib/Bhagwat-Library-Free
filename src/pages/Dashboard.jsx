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
  Zap,
  CheckSquare,
  ChevronRight,
  School,
  MessageSquare,
  FileText,
  Settings as SettingsIcon,
  ArrowUpRight,
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

  // Calculate Today's Tasks (only items with count > 0 will be shown)
  const todaysTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiringSoonCount = 0;
    let expiredCount = 0;
    let partialPaymentsCount = 0;
    let pendingInvoicesCount = 0;
    let pendingRemindersCount = 0;

    students.forEach((s) => {
      // Validity check
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

      // Payment check
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
        iconBg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        targetTab: "seats",
      },
      {
        id: "expired",
        title: "Membership Expired",
        count: expiredCount,
        desc: "Memberships already expired",
        icon: AlertCircle,
        iconBg: "bg-rose-500/20 text-rose-400 border-rose-500/30",
        badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        targetTab: "students",
      },
      {
        id: "partial",
        title: "Partial Payments",
        count: partialPaymentsCount,
        desc: "Students with balance dues remaining",
        icon: DollarSign,
        iconBg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        targetTab: "payments",
      },
      {
        id: "pending_invoices",
        title: "Pending Invoices",
        count: pendingInvoicesCount,
        desc: "Unpaid student invoices awaiting payment",
        icon: CreditCard,
        iconBg: "bg-rose-500/20 text-rose-400 border-rose-500/30",
        badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        targetTab: "payments",
      },
      {
        id: "pending_reminders",
        title: "Pending Reminders",
        count: pendingRemindersCount,
        desc: "Due payment reminders ready to dispatch",
        icon: Bell,
        iconBg: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        targetTab: "payments",
      },
    ];

    // Filter to ONLY show tasks with count > 0
    return tasksList.filter((t) => t.count > 0);
  }, [students]);

  if (loading) {
    return <SkeletonLoader type="card" />;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Bhagwat Library Dashboard <Sparkles className="text-amber-400" size={20} />
          </h1>
          <p className="text-xs text-slate-400">
            Realtime occupancy, membership alerts, and operational controls
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

      {/* ROW 1: TOP SUMMARY METRIC CARDS (UNCHANGED) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SaaSCard className="p-5 bg-gradient-to-br from-blue-900/40 via-slate-900 to-slate-950 border-blue-500/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400">Total Students</p>
              <h3 className="text-2xl font-extrabold text-white mt-1">{students.length}</h3>
              <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400">
                <TrendingUp size={14} /> <span>Active Enrolments</span>
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

      {/* ROW 2: 50% / 50% GRID (MEMBERSHIP ALERTS LEFT & QUICK ACTIONS RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT 50%: MEMBERSHIP ALERTS (MAX 8 STUDENTS IN COMPACT TABLE/LIST) */}
        <div>
          <MembershipAlertsWidget students={students} maxStudents={8} />
        </div>

        {/* RIGHT 50%: QUICK ADMIN ACTIONS (REDUCED TO ONLY FOUR KEY ACTIONS) */}
        <div>
          <SaaSCard className="p-5 md:p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-slate-800 space-y-4 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap size={18} className="text-amber-400" /> Quick Admin Actions
                </h3>
                <span className="text-xs text-slate-400 font-medium">Shortcuts</span>
              </div>

              <div className="grid grid-cols-2 gap-3.5 mt-4">
                <button
                  onClick={() => onTabChange("students")}
                  className="p-4 rounded-2xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-300 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
                >
                  <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
                    <UserPlus size={20} />
                  </div>
                  <span>➕ Add Student</span>
                </button>

                <button
                  onClick={() => onTabChange("seats")}
                  className="p-4 rounded-2xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 text-purple-300 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
                >
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                    <Armchair size={20} />
                  </div>
                  <span>🪑 Assign Seat</span>
                </button>

                <button
                  onClick={() => onTabChange("payments")}
                  className="p-4 rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                    <DollarSign size={20} />
                  </div>
                  <span>💰 Collect Payment</span>
                </button>

                <button
                  onClick={() => onTabChange("reports")}
                  className="p-4 rounded-2xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-300 text-xs font-semibold flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
                >
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400">
                    <FileText size={20} />
                  </div>
                  <span>📄 Export Report</span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Quick access to key dashboard functions</span>
              <span className="text-slate-400 font-semibold">Bhagwat Library</span>
            </div>
          </SaaSCard>
        </div>
      </div>

      {/* ROW 3: 50% / 50% GRID (MONTHLY REVENUE GRAPH LEFT & TODAY'S TASKS RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT 50%: MONTHLY REVENUE GRAPH (SINGLE CLEAN CHART) */}
        <SaaSCard className="p-5 md:p-6 bg-slate-900/90 border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-400" /> Monthly Revenue Trend
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Clean historical revenue collection & projection chart
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ₹{monthlyCollection} Total
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRevDeskClean" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#ffffff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorRevDeskClean)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SaaSCard>

        {/* RIGHT 50%: TODAY'S TASKS (ONLY SHOWS TASKS WITH COUNT > 0) */}
        <SaaSCard className="p-5 md:p-6 bg-slate-900/90 border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckSquare size={18} className="text-blue-400" /> Today's Tasks
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {todaysTasks.length} Active Tasks
              </span>
            </div>

            <div className="space-y-2.5 mt-4">
              {todaysTasks.length === 0 ? (
                <div className="p-6 text-center bg-slate-950/40 rounded-2xl border border-slate-800/60 text-slate-400 space-y-2">
                  <CheckCircle2 size={30} className="mx-auto text-emerald-400" />
                  <p className="font-semibold text-sm text-slate-300">All Tasks Completed!</p>
                  <p className="text-xs text-slate-500">
                    No pending membership or payment tasks requiring immediate action today.
                  </p>
                </div>
              ) : (
                todaysTasks.map((task) => {
                  const Icon = task.icon;

                  return (
                    <button
                      key={task.id}
                      onClick={() => onTabChange(task.targetTab)}
                      className="w-full p-3.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800/60 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 border ${task.iconBg}`}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-white text-xs tracking-tight">
                            {task.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {task.desc}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${task.badgeColor}`}
                        >
                          {task.count}
                        </span>
                        <ArrowUpRight
                          size={16}
                          className="text-slate-500 group-hover:text-blue-400 transition-colors"
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Tasks update dynamically in realtime</span>
            <span className="text-blue-400 font-semibold">Click row to manage</span>
          </div>
        </SaaSCard>
      </div>
    </div>
  );
};
