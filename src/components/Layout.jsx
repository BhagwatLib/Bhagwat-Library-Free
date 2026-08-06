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
  CalendarCheck,
  Bell,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { BottomSheet } from "./BottomSheet";
import { FloatingActionButton } from "./FloatingActionButton";

export const Layout = ({ children, activeTab, onTabChange, onOpenQuickAction }) => {
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  const mainBottomTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "students", label: "Students", icon: Users },
    { id: "seats", label: "Seats", icon: Armchair },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "more", label: "More", icon: MoreHorizontal },
  ];

  const moreMenuItems = [
    { id: "attendance", label: "Attendance Log", icon: CalendarCheck, desc: "Track daily check-ins" },
    { id: "batches", label: "Batches & Shifts", icon: School, desc: "Manage shift timings & pricing" },
    { id: "reports", label: "Reports & Export", icon: FileText, desc: "Generate PDF/Excel reports" },
    { id: "settings", label: "Admin Settings", icon: SettingsIcon, desc: "Library profile & preferences" },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 overflow-hidden">
      {/* Sticky Compact Mobile Top Header */}
      <header className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 backdrop-blur-xl sticky top-0 z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 flex items-center justify-center shadow-md">
            <img
              src="/logo.jpg"
              alt="Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="font-extrabold text-base text-white tracking-tight flex items-center gap-1">
              Bhagwat Library <Sparkles className="text-amber-400" size={14} />
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Native Android Admin</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTabChange("payments")}
            className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center transition-colors relative"
            title="Notifications"
          >
            <Bell size={18} />
            <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2 animate-ping" />
            <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2" />
          </button>
        </div>
      </header>

      {/* Main Viewport Content Area (Safe Bottom Area pb-24) */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6 pb-28">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* Fixed Android Floating Action Button (FAB) */}
      <FloatingActionButton
        onAction={(actionId) => {
          if (actionId === "add_student") onTabChange("students");
          else if (actionId === "assign_seat") onTabChange("seats");
          else if (actionId === "collect_payment") onTabChange("payments");
          if (onOpenQuickAction) onOpenQuickAction(actionId);
        }}
      />

      {/* Fixed Android Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 border-t border-slate-800/90 backdrop-blur-2xl px-2 py-1.5 flex items-center justify-around shadow-2xl">
        {mainBottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.id === "more"
              ? isMoreSheetOpen || ["attendance", "batches", "reports", "settings"].includes(activeTab)
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
                "flex flex-col items-center justify-center min-w-[64px] h-14 rounded-2xl transition-all duration-200 active:scale-95",
                isActive
                  ? "text-blue-400 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <div
                className={clsx(
                  "p-1.5 rounded-full transition-all",
                  isActive ? "bg-blue-600/20 text-blue-400 scale-110" : ""
                )}
              >
                <Icon size={20} />
              </div>
              <span className="text-[11px] font-medium tracking-tight mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* "More Options" Native Android Slide-Up Bottom Sheet */}
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
                  "p-4 rounded-2xl border text-left flex items-center gap-4 transition-all active:scale-98",
                  isSelected
                    ? "bg-blue-600/20 border-blue-500/40 text-white shadow-lg"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                )}
              >
                <div
                  className={clsx(
                    "w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0",
                    isSelected ? "bg-blue-600 text-white" : "bg-slate-800 text-blue-400"
                  )}
                >
                  <Icon size={22} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">{item.label}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
};
