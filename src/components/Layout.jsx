import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Armchair,
  MoreHorizontal,
  School,
  FileText,
  Settings as SettingsIcon,
  Bell,
  Sparkles,
  LogOut,
  ChevronRight,
  MessageSquare,
  Layers,
  Sun,
  Moon,
} from "lucide-react";
import { clsx } from "clsx";
import { BottomSheet } from "./BottomSheet";
import { FloatingActionButton } from "./FloatingActionButton";
import { useTheme } from "../context/ThemeContext";

export const Layout = ({
  children,
  activeTab,
  onTabChange,
  onOpenQuickAction,
}) => {
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const { theme, setTheme, isDark } = useTheme();

  const desktopNavItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "students", label: "Students", icon: Users },
    { id: "seats", label: "Seats & Matrix", icon: Armchair },
    { id: "payments", label: "Payments", icon: CreditCard },
    {
      id: "communication",
      label: "Communication History",
      icon: MessageSquare,
    },
    { id: "batches", label: "Batches & Shifts", icon: School },
    { id: "reports", label: "Reports & Export", icon: FileText },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  const mainBottomTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "students", label: "Students", icon: Users },
    { id: "seats", label: "Seats", icon: Armchair },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "more", label: "More", icon: MoreHorizontal },
  ];

  const moreMenuItems = [
    {
      id: "communication",
      label: "Communication History",
      icon: MessageSquare,
      desc: "Message dispatch logs",
    },
    {
      id: "batches",
      label: "Batches & Shifts",
      icon: School,
      desc: "Manage shift timings & pricing",
    },
    {
      id: "reports",
      label: "Reports & Export",
      icon: FileText,
      desc: "Generate PDF/Excel reports",
    },
    {
      id: "settings",
      label: "Admin Settings",
      icon: SettingsIcon,
      desc: "Library profile & preferences",
    },
  ];

  const handleLogout = () => {
    sessionStorage.removeItem("isLoggedIn");
    window.location.reload();
  };

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-[#878B8F] dark:bg-[#1A1D24] text-[#1A1C1E] dark:text-slate-100 font-sans flex transition-colors duration-300">
      {/* DESKTOP SKEUOMORPHIC SIDEBAR */}
      <aside className="hidden lg:flex w-72 flex-col p-4 shrink-0 h-screen sticky top-0 z-30 justify-between">
        <div className="space-y-6">
          {/* Header Brand Capsule */}
          <div className="flex items-center gap-3.5 px-2 pt-2">
            <div className="skeuo-dial w-11 h-11 flex-shrink-0">
              <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 dark:text-white tracking-wider leading-none text-sm uppercase">
                Bhagwat Library
              </h3>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold tracking-wider uppercase mt-0.5 block"></span>
            </div>
          </div>

          {/* Navigation Pill List */}
          <nav className="space-y-2.5">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={clsx(
                    "skeuo-nav-pill w-full px-3.5 py-3 flex items-center justify-between text-xs font-semibold tracking-wide",
                    isActive
                      ? "active text-[#1A1C1E] dark:text-white"
                      : "text-[#3C4048] dark:text-slate-400",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={clsx(
                        "skeuo-dial w-7 h-7 flex items-center justify-center transition-all",
                        isActive
                          ? "text-[#00CEC9] dark:text-cyan-400"
                          : "text-[#3C4048] dark:text-slate-400",
                      )}
                    >
                      <Icon size={14} />
                    </div>
                    <span>{item.label}</span>
                  </div>

                  {/* Active Indicator Jewel or subtle hardware dot */}
                  {isActive ? (
                    <div className="jewel-dot cyan mr-1" />
                  ) : (
                    <div className="skeuo-rivet mr-1" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Rotary Admin Switch & Theme Quick Toggle */}
        <div className="space-y-3 pt-4">
          <div className="skeuo-card p-3 flex items-center justify-between rounded-2xl">
            <div className="flex items-center gap-3">
              {/* Skeuomorphic Rotary Dial */}
              <div className="skeuo-dial w-10 h-10 glow-cyan">
                <div className="w-4 h-4 rounded-full bg-slate-700 dark:bg-slate-900 border border-cyan-400 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#1A1C1E] dark:text-white leading-tight">
                  Admin Workspace
                </span>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">
                  Super Administrator
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleTheme}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="skeuo-dial w-8 h-8 text-slate-600 dark:text-amber-400 hover:scale-105"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              <button
                onClick={handleLogout}
                title="Logout"
                className="skeuo-dial w-8 h-8 text-slate-400 hover:text-red-500"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT VIEWPORT */}
      <div className="flex-1 min-w-0 overflow-x-hidden flex flex-col h-screen overflow-y-auto">
        {/* Mobile Header Bar */}
        <header className="lg:hidden px-4 py-3 border-b border-[#757A7E]/40 dark:border-slate-800/80 flex items-center justify-between bg-[#878B8F]/95 dark:bg-[#1A1D24]/90 backdrop-blur-xl sticky top-0 z-30 flex-shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="skeuo-dial w-9 h-9">
              <Layers className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-[#1A1C1E] dark:text-white tracking-tight flex items-center gap-1">
                Bhagwat Library{" "}
                <Sparkles className="text-amber-400" size={13} />
              </h1>
              <p className="text-[10px] text-[#3C4048] dark:text-slate-400 font-semibold">
                SaaS Admin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="skeuo-dial w-9 h-9 text-slate-700 dark:text-amber-400 active:scale-95"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={() => onTabChange("payments")}
              aria-label="Payment Alerts"
              className="skeuo-dial w-9 h-9 text-slate-600 dark:text-slate-300 relative active:scale-95"
            >
              <Bell size={16} />
              <span className="jewel-dot amber absolute top-1.5 right-1.5" />
            </button>
          </div>
        </header>

        {/* Viewport Content Area */}
        <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 pb-28 lg:pb-8 custom-scrollbar overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">{children}</div>
        </main>
      </div>

      {/* MOBILE FLOATING ACTION BUTTON */}
      <div className="lg:hidden">
        <FloatingActionButton
          onAction={(actionId) => {
            if (actionId === "add_student") onTabChange("students");
            else if (actionId === "assign_seat") onTabChange("seats");
            else if (actionId === "collect_payment") onTabChange("payments");
            if (onOpenQuickAction) onOpenQuickAction(actionId);
          }}
        />
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#878B8F]/95 dark:bg-[#1A1D24]/95 border-t border-[#757A7E]/40 dark:border-slate-800/90 backdrop-blur-2xl px-2 pt-1.5 mobile-safe-bottom flex items-center justify-around shadow-2xl">
        {mainBottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.id === "more"
              ? isMoreSheetOpen ||
                ["batches", "reports", "settings"].includes(activeTab)
              : activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "more") {
                  setIsMoreSheetOpen(true);
                } else {
                  setIsMoreSheetOpen(false);
                  onTabChange(tab.id);
                }
              }}
              className={clsx(
                "flex flex-col items-center justify-center flex-1 max-w-[72px] h-14 rounded-2xl transition-all duration-200 active:scale-90",
                isActive
                  ? "text-[#00CEC9] dark:text-cyan-400 font-black"
                  : "text-[#3C4048] dark:text-slate-400 hover:text-[#1A1C1E] dark:hover:text-slate-200",
              )}
            >
              <div
                className={clsx(
                  "p-1.5 rounded-full transition-all",
                  isActive
                    ? "skeuo-dial text-[#00CEC9] dark:text-cyan-400 scale-110 shadow-lg"
                    : "",
                )}
              >
                <Icon size={19} />
              </div>
              <span className="text-[10px] font-bold tracking-tight mt-0.5">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* "More Options" Bottom Sheet */}
      <BottomSheet
        isOpen={isMoreSheetOpen}
        onClose={() => setIsMoreSheetOpen(false)}
        title="More Admin Features"
      >
        <div className="grid grid-cols-1 gap-2.5">
          {moreMenuItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setIsMoreSheetOpen(false);
                  onTabChange(item.id);
                }}
                className={clsx(
                  "p-4 rounded-2xl text-left flex items-center gap-4 transition-all active:scale-98 skeuo-card",
                  isSelected
                    ? "border-[#00CEC9]/50 text-[#00CEC9] dark:text-cyan-400"
                    : "text-[#1A1C1E] dark:text-slate-300",
                )}
              >
                <div
                  className={clsx(
                    "skeuo-dial w-11 h-11 flex items-center justify-center flex-shrink-0",
                    isSelected
                      ? "text-[#00CEC9] dark:text-cyan-400"
                      : "text-[#3C4048] dark:text-slate-400",
                  )}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight text-[#1A1C1E] dark:text-white">
                    {item.label}
                  </h4>
                  <p className="text-xs text-[#3C4048] dark:text-slate-400 mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
};
