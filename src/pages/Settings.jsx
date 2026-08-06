import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Building,
  Bell,
  Shield,
  Palette,
  CheckCircle2,
} from "lucide-react";
import { SaaSCard } from "../components/SaaSCard";
import { Badge } from "../components/Badge";

export const Settings = () => {
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    libraryName: "Bhagwat Library",
    adminEmail: "admin@bhagwatlibrary.in",
    contactPhone: "+91 9876543210",
    totalCapacity: 100,
    currency: "INR (₹)",
    autoReminder: true,
    reminderDays: 3,
    theme: "Dark SaaS",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <SettingsIcon className="text-blue-400" size={26} /> Admin Settings
          </h1>
          <p className="text-xs text-slate-400">
            Configure library branding, seat capacity defaults, and automated notification triggers
          </p>
        </div>

        {saved && (
          <Badge variant="success" className="py-2 px-4 text-xs">
            <CheckCircle2 size={16} className="mr-1.5" /> Settings Saved Successfully
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Library Info */}
        <SaaSCard className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Building size={16} className="text-blue-400" /> Library Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Library Name</label>
              <input
                type="text"
                value={formData.libraryName}
                onChange={(e) => setFormData({ ...formData, libraryName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Admin Email</label>
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Contact Phone</label>
              <input
                type="text"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Total Seat Capacity</label>
              <input
                type="number"
                value={formData.totalCapacity}
                readOnly
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-500 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </SaaSCard>

        {/* Notifications & Reminders */}
        <SaaSCard className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Bell size={16} className="text-amber-400" /> Automated Reminders & Alerts
          </h3>

          <div className="space-y-3 text-xs">
            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoReminder}
                onChange={(e) => setFormData({ ...formData, autoReminder: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
              />
              <div>
                <p className="font-bold text-white">Automated SMS & WhatsApp Payment Reminders</p>
                <p className="text-slate-400 text-[10px]">Automatically notify students before membership validity expires</p>
              </div>
            </label>
          </div>
        </SaaSCard>

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};
