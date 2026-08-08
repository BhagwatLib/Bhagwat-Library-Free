import React, { useState, useEffect } from "react";
import {
  Bell,
  Clock,
  CheckCircle2,
  Save,
  MessageSquare,
  Sparkles,
  Info,
  ShieldCheck,
} from "lucide-react";
import { SaaSCard } from "./SaaSCard";
import { Badge } from "./Badge";
import {
  getReminderSettings,
  saveReminderSettings,
} from "../services/reminderService";

export const ReminderSettings = () => {
  const [settings, setSettings] = useState({
    whatsappEnabled: true,
    automatedScheduler: true,
    reminderTime: "14:30",
    libraryName: "Bhagwat Library",
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Time preset suggestions within working hours
  const timePresets = [
    { label: "11:00 AM", value: "11:00" },
    { label: "02:30 PM (Default)", value: "14:30" },
    { label: "04:00 PM", value: "16:00" },
    { label: "06:00 PM", value: "18:00" },
  ];

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getReminderSettings();
        if (data) {
          setSettings({
            whatsappEnabled: data.whatsappEnabled ?? true,
            automatedScheduler: data.automatedScheduler ?? data.enabled ?? true,
            reminderTime: data.reminderTime || "14:30",
            libraryName: data.libraryName || "Bhagwat Library",
          });
        }
      } catch (err) {
        console.error("Failed to load reminder settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveReminderSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="skeuo-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3" withGrip>
        <div className="flex items-center space-x-3.5">
          <div className="skeuo-dial w-12 h-12 text-blue-500 glow-purple flex items-center justify-center">
            <Bell size={22} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-800 dark:text-white tracking-tight uppercase">
              Reminder Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure automated WhatsApp membership renewal alerts & due notifications
            </p>
          </div>
        </div>

        {savedSuccess && (
          <Badge dot variant="success" className="py-1.5 px-3 text-xs animate-in fade-in">
            <CheckCircle2 size={13} className="mr-1" /> Settings Saved
          </Badge>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Settings Card */}
        <SaaSCard className="p-6 md:p-8 space-y-6" withGrip>
          {/* 1. WhatsApp Reminder Toggle */}
          <div className="flex items-center justify-between p-4 skeuo-inset">
            <div className="flex items-start space-x-3.5">
              <div className="skeuo-dial w-9 h-9 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">WhatsApp Reminders</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Enable or disable sending automated reminder alerts via WhatsApp
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.whatsappEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, whatsappEnabled: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 2. Automated Reminder System Toggle */}
          <div className="flex items-center justify-between p-4 skeuo-inset">
            <div className="flex items-start space-x-3.5">
              <div className="skeuo-dial w-9 h-9 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Automated Reminder System</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatically check membership validity expiry and dispatch daily reminders
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.automatedScheduler}
                onChange={(e) =>
                  setSettings({ ...settings, automatedScheduler: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 3. Reminder Time */}
          <div className="p-4 skeuo-inset space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="skeuo-dial w-9 h-9 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                <Clock size={16} />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Daily Reminder Time</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Select the daily dispatch time during library working hours (default: 02:30 PM)
                </p>
              </div>
            </div>

            <div className="pl-12 space-y-3">
              {/* Quick Presets */}
              <div className="flex flex-wrap gap-2">
                {timePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSettings({ ...settings, reminderTime: preset.value })}
                    className={clsx(
                      "skeuo-badge px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                      settings.reminderTime === preset.value
                        ? "bg-blue-600 text-blue-700 dark:text-cyan-300 border-blue-400 font-extrabold"
                        : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Time Input */}
              <div className="flex items-center space-x-3 pt-1">
                <span className="text-xs text-slate-500 font-bold">Custom Time:</span>
                <input
                  type="time"
                  min="08:00"
                  max="20:00"
                  value={settings.reminderTime}
                  onChange={(e) => setSettings({ ...settings, reminderTime: e.target.value })}
                  className="skeuo-input px-3.5 py-1.5 text-xs font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400">(08:00 AM – 08:00 PM)</span>
              </div>
            </div>
          </div>

          {/* Automated Behavior Summary */}
          <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-black text-blue-600 dark:text-cyan-400 uppercase tracking-wider text-[11px]">
              <Info size={14} />
              <span>Automated Membership Reminder Logic</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[11px] pl-1 leading-relaxed">
              <li>
                <strong>Due Tomorrow:</strong> If a student's monthly library membership expires tomorrow, an automatic WhatsApp renewal reminder is sent today.
              </li>
              <li>
                <strong>Overdue / Expired:</strong> If the validity date passes, one reminder is sent daily until their membership is renewed or payment is cleared.
              </li>
              <li>
                <strong>Auto-Stop:</strong> As soon as the student's renewal is recorded or payment status marked Paid, all future reminders stop automatically.
              </li>
            </ul>
          </div>

        </SaaSCard>

        {/* Save Changes Button */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="skeuo-btn skeuo-btn-primary px-6 py-3 text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? "Saving Changes..." : "Save Settings"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
