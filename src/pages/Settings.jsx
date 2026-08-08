import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Building,
  Bell,
  QrCode,
  CheckCircle2,
  Palette,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import { clsx } from "clsx";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";
import { WhatsAppScanner } from "../components/WhatsAppScanner";
import { ReminderSettings } from "../components/ReminderSettings";
import { useTheme } from "../context/ThemeContext";

export const Settings = ({ initialTab = "whatsapp" }) => {
  const [activeSubTab, setActiveSubTab] = useState(initialTab);
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useTheme();

  const [formData, setFormData] = useState({
    libraryName: "Bhagwat Library",
    adminEmail: "admin@bhagwatlibrary.in",
    contactPhone: "+91 9876543210",
    totalCapacity: 100,
    currency: "INR (₹)",
  });

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const navTabs = [
    { id: "whatsapp", label: "WhatsApp Connection", icon: QrCode, desc: "QR scan & gateway pairing" },
    { id: "reminders", label: "Reminder Settings", icon: Bell, desc: "Scheduler & alert rules" },
    { id: "appearance", label: "Appearance & Theme", icon: Palette, desc: "Light, Dark, & System" },
    { id: "profile", label: "Library Profile", icon: Building, desc: "Branding & contact details" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            Admin Settings <span className="jewel-dot cyan" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure WhatsApp gateway, reminder schedules, appearance theme, and library branding
          </p>
        </div>

        {saved && (
          <Badge variant="success" className="py-2 px-4 text-xs">
            <CheckCircle2 size={16} className="mr-1.5" /> Settings Saved Successfully
          </Badge>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3 overflow-x-auto custom-scrollbar">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={clsx(
                "flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap",
                isActive
                  ? "skeuo-btn skeuo-btn-primary"
                  : "skeuo-btn text-slate-600 dark:text-slate-400"
              )}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: APPEARANCE (Exact User Request) */}
      {activeSubTab === "appearance" && (
        <SaaSCard className="p-6 space-y-6" withGrip>
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-wider">
              <Palette size={16} className="text-purple-500" /> Appearance & Theme Controls
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select your preferred luxury skeuomorphic workspace theme.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* 1. Light Mode */}
            <div
              onClick={() => setTheme("light")}
              className={clsx(
                "skeuo-card p-5 cursor-pointer flex flex-col items-center justify-between gap-4 transition-all hover:scale-[1.02] active:scale-95 text-center relative",
                theme === "light"
                  ? "ring-2 ring-blue-500 shadow-xl"
                  : "opacity-80"
              )}
            >
              <div className="skeuo-dial w-14 h-14 bg-gradient-to-tr from-amber-100 to-amber-200 text-amber-600">
                <Sun size={24} />
              </div>
              <div>
                <span className="font-black text-sm text-slate-800 dark:text-white block">
                  ○ Light Mode
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Soft gray (#ECECEC) & raised Apple-like surfaces
                </span>
              </div>
              {theme === "light" && <span className="jewel-dot cyan absolute top-3 right-3" />}
            </div>

            {/* 2. Dark Mode */}
            <div
              onClick={() => setTheme("dark")}
              className={clsx(
                "skeuo-card p-5 cursor-pointer flex flex-col items-center justify-between gap-4 transition-all hover:scale-[1.02] active:scale-95 text-center relative",
                theme === "dark"
                  ? "ring-2 ring-cyan-500 shadow-xl"
                  : "opacity-80"
              )}
            >
              <div className="skeuo-dial w-14 h-14 glow-purple text-purple-400">
                <Moon size={24} />
              </div>
              <div>
                <span className="font-black text-sm text-slate-800 dark:text-white block">
                  ○ Dark Mode
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Premium charcoal (#1A1D24) & neon glows
                </span>
              </div>
              {theme === "dark" && <span className="jewel-dot cyan absolute top-3 right-3" />}
            </div>

            {/* 3. System Default */}
            <div
              onClick={() => setTheme("system")}
              className={clsx(
                "skeuo-card p-5 cursor-pointer flex flex-col items-center justify-between gap-4 transition-all hover:scale-[1.02] active:scale-95 text-center relative",
                theme === "system"
                  ? "ring-2 ring-purple-500 shadow-xl"
                  : "opacity-80"
              )}
            >
              <div className="skeuo-dial w-14 h-14 text-slate-500">
                <Laptop size={24} />
              </div>
              <div>
                <span className="font-black text-sm text-slate-800 dark:text-white block">
                  ○ System Default
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Synchronizes automatically with your OS preference
                </span>
              </div>
              {theme === "system" && <span className="jewel-dot cyan absolute top-3 right-3" />}
            </div>
          </div>
        </SaaSCard>
      )}

      {/* TAB CONTENT: WHATSAPP SCANNER */}
      {activeSubTab === "whatsapp" && <WhatsAppScanner />}

      {/* TAB CONTENT: REMINDER SETTINGS */}
      {activeSubTab === "reminders" && <ReminderSettings />}

      {/* TAB CONTENT: LIBRARY PROFILE */}
      {activeSubTab === "profile" && (
        <form onSubmit={handleProfileSubmit} className="space-y-6">
          <SaaSCard className="p-6 space-y-4" withGrip>
            <h3 className="font-extrabold text-sm text-slate-800 dark:text-white flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 uppercase tracking-wider">
              <Building size={16} className="text-blue-500" /> Library Profile & Organization
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Library Name
                </label>
                <input
                  type="text"
                  value={formData.libraryName}
                  onChange={(e) => setFormData({ ...formData, libraryName: e.target.value })}
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  Total Seat Capacity
                </label>
                <input
                  type="number"
                  value={formData.totalCapacity}
                  readOnly
                  className="skeuo-input w-full px-4 py-2.5 text-xs font-medium opacity-60 cursor-not-allowed"
                />
              </div>
            </div>
          </SaaSCard>

          <div className="flex justify-end">
            <button
              type="submit"
              className="skeuo-btn skeuo-btn-primary px-6 py-3 text-xs flex items-center gap-2 shadow-lg"
            >
              <Save size={15} /> Save Profile Changes
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
