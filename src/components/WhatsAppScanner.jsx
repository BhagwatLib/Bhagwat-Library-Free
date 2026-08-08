import React, { useState, useEffect, useRef } from "react";
import {
  QrCode,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Clock,
  RotateCcw,
  Sparkles,
  Info,
  LogOut,
  Play,
} from "lucide-react";
import { SaaSCard } from "./SaaSCard";
import { Badge } from "./Badge";
import { clsx } from "clsx";
import {
  getWhatsAppStatus,
  startWhatsAppGateway,
  logoutWhatsApp,
  refreshWhatsAppQR,
} from "../services/whatsappService";

export const WhatsAppScanner = () => {
  const [statusData, setStatusData] = useState({
    isReady: false,
    status: "DISCONNECTED",
    qrCode: null,
    lastConnectedTime: null,
    clientInfo: null,
    timestamp: null,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const pollIntervalRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStatus = async () => {
    try {
      const data = await getWhatsAppStatus();
      setStatusData((prev) => ({
        ...prev,
        ...data,
      }));
    } catch (err) {
      console.error("Failed to fetch WhatsApp status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Setup SSE stream for instant real-time updates
    let eventSource = null;
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
      eventSource = new EventSource(`${backendUrl}/api/whatsapp/events`);
      eventSource.addEventListener("status", (e) => {
        try {
          const parsed = JSON.parse(e.data);
          setStatusData((prev) => ({ ...prev, ...parsed }));
          setLoading(false);
        } catch (_) {}
      });
      eventSource.addEventListener("qr", (e) => {
        try {
          const parsed = JSON.parse(e.data);
          setStatusData((prev) => ({
            ...prev,
            qrCode: parsed.qrDataUrl,
            status: "QR_READY",
            isReady: false,
          }));
        } catch (_) {}
      });
    } catch (err) {
      console.warn("SSE connection error, falling back to polling:", err);
    }

    // Fallback periodic poll every 3.5s
    pollIntervalRef.current = setInterval(fetchStatus, 3500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (eventSource) eventSource.close();
    };
  }, []);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      showToast("Starting WhatsApp gateway & generating QR code...", "info");
      const res = await startWhatsAppGateway();
      if (res.data) {
        setStatusData((prev) => ({ ...prev, ...res.data }));
      }
      setTimeout(fetchStatus, 1500);
    } catch (err) {
      showToast("Failed to start WhatsApp. Please check backend connection.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshQR = async () => {
    setActionLoading(true);
    try {
      await refreshWhatsAppQR();
      showToast("Generating fresh QR code...");
      setTimeout(fetchStatus, 1500);
    } catch (err) {
      showToast("Failed to refresh QR code.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to disconnect WhatsApp and free server memory?")) {
      return;
    }
    setActionLoading(true);
    try {
      await logoutWhatsApp();
      showToast("WhatsApp disconnected and browser resources freed.");
      setStatusData({
        isReady: false,
        status: "DISCONNECTED",
        qrCode: null,
        lastConnectedTime: null,
        clientInfo: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      showToast("Failed to logout WhatsApp.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const isConnected = Boolean(statusData.isReady || statusData.status === "CONNECTED");
  const isConnecting = statusData.status === "CONNECTING" || statusData.status === "AUTHENTICATED";
  const hasQR = Boolean(statusData.qrCode && !isConnected);

  const formatTime = (timeStr) => {
    if (!timeStr) return "Never";
    try {
      const date = new Date(timeStr);
      return date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border animate-in fade-in slide-in-from-top-4 ${
            toast.type === "error"
              ? "bg-rose-950 border-rose-800 text-rose-200"
              : toast.type === "info"
              ? "bg-blue-950 border-blue-800 text-blue-200"
              : "bg-emerald-950 border-emerald-800 text-emerald-200"
          }`}
        >
          {toast.type === "error" ? (
            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="skeuo-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4" withGrip>
        <div className="flex items-center space-x-3.5">
          <div
            className={clsx(
              "skeuo-dial w-12 h-12 flex items-center justify-center",
              isConnected
                ? "text-emerald-500 glow-cyan"
                : isConnecting
                ? "text-amber-500 glow-amber animate-pulse"
                : "text-slate-400"
            )}
          >
            {isConnected ? (
              <Wifi size={22} className="animate-pulse" />
            ) : isConnecting ? (
              <RotateCcw size={22} className="animate-spin" />
            ) : (
              <WifiOff size={22} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-800 dark:text-white tracking-tight uppercase">
                WhatsApp Web Gateway
              </h2>
              <Badge
                dot
                variant={isConnected ? "success" : isConnecting ? "warning" : "danger"}
                className="text-[10px]"
              >
                {isConnected
                  ? "Connected & Active"
                  : isConnecting
                  ? "Generating QR / Pairing..."
                  : hasQR
                  ? "Ready to Scan"
                  : "Idle (Disconnected)"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              On-demand temporary session • Instant reminders & invoice dispatch
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!isConnected && !isConnecting && (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="skeuo-btn skeuo-btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              title="Start WhatsApp Gateway & Generate QR"
            >
              <Play size={13} className={actionLoading ? "animate-spin" : ""} />
              <span>Start Gateway</span>
            </button>
          )}

          {(isConnecting || hasQR) && (
            <button
              onClick={handleRefreshQR}
              disabled={actionLoading}
              className="skeuo-btn px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              title="Request new QR code"
            >
              <RefreshCw size={13} className={actionLoading ? "animate-spin" : ""} />
              <span>Refresh QR</span>
            </button>
          )}

          {isConnected && (
            <button
              onClick={handleLogout}
              disabled={actionLoading}
              className="skeuo-btn px-4 py-2 text-xs font-bold flex items-center gap-1.5 text-rose-500 hover:text-rose-600 disabled:opacity-50"
              title="Disconnect and free browser resources"
            >
              <LogOut size={13} className={actionLoading ? "animate-spin" : ""} />
              <span>Disconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: QR Area or Connected Success Card */}
        <div className="lg:col-span-2 space-y-4">
          <SaaSCard className="p-6 md:p-8 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[380px]" withGrip>
            {isConnected ? (
              /* CONNECTED STATE */
              <div className="space-y-5 max-w-md py-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="skeuo-dial w-20 h-20 text-emerald-500 glow-cyan mx-auto">
                  <CheckCircle2 size={40} />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">
                    WhatsApp Connected Successfully!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Active temporary session is ready to dispatch reminders and invoices.
                  </p>
                </div>

                <div className="skeuo-inset p-4 text-left space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Smartphone size={14} className="text-blue-400" /> Account:
                    </span>
                    <span className="font-bold text-white">
                      {statusData.clientInfo?.pushname || "Bhagwat Library Admin"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-amber-400" /> Connected At:
                    </span>
                    <span className="font-semibold text-slate-300">
                      {formatTime(statusData.lastConnectedTime)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-400" /> Status:
                    </span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      Ready to Dispatch
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleLogout}
                    disabled={actionLoading}
                    className="text-xs text-rose-400 hover:text-rose-300 hover:underline font-semibold transition-colors flex items-center justify-center gap-1 mx-auto"
                  >
                    <LogOut size={13} />
                    <span>Disconnect WhatsApp & Free Memory</span>
                  </button>
                </div>
              </div>
            ) : hasQR ? (
              /* QR CODE SCANNER DISPLAY */
              <div className="space-y-6 max-w-md animate-in fade-in duration-300">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
                    <QrCode className="text-blue-400" size={20} /> Scan QR Code with WhatsApp
                  </h3>
                  <p className="text-xs text-slate-400">
                    Open WhatsApp on your phone to link your temporary session
                  </p>
                </div>

                {/* QR Container */}
                <div className="relative inline-block p-3 rounded-2xl bg-white shadow-2xl shadow-blue-500/10 border-4 border-slate-800">
                  <img
                    src={statusData.qrCode}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-lg"
                  />
                  <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-blue-600"></div>
                  <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-blue-600"></div>
                  <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-blue-600"></div>
                  <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-blue-600"></div>
                </div>

                <div className="flex items-center justify-center gap-2 text-[11px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl">
                  <Clock size={13} className="animate-spin" />
                  <span>Scan with WhatsApp camera on your phone</span>
                </div>
              </div>
            ) : isConnecting ? (
              /* CONNECTING / INITIALIZING */
              <div className="space-y-4 max-w-sm py-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                  <RotateCcw size={32} className="animate-spin text-blue-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">
                    Starting WhatsApp Browser...
                  </h3>
                  <p className="text-xs text-slate-400">
                    Generating a fresh QR code for pairing
                  </p>
                </div>
              </div>
            ) : (
              /* IDLE STATE */
              <div className="space-y-4 max-w-sm py-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <WifiOff size={30} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">
                    Gateway is Idle
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click below to start WhatsApp and generate a pairing QR code.
                  </p>
                </div>
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="skeuo-btn skeuo-btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 mx-auto"
                >
                  <Play size={14} className={actionLoading ? "animate-spin" : ""} />
                  <span>Start WhatsApp & Scan QR</span>
                </button>
              </div>
            )}
          </SaaSCard>
        </div>

        {/* Right 1 Col: Instructions & Status Overview */}
        <div className="space-y-4">
          <SaaSCard className="p-5 space-y-4 bg-slate-900/90">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <Info size={15} className="text-blue-400" /> How to Connect
            </h3>

            <ol className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>Click <strong>Start WhatsApp & Scan QR</strong>.</span>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>Open <strong>WhatsApp</strong> on your phone.</span>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>
                  Tap <strong>Menu</strong> (Android: 3 dots) or <strong>Settings</strong> (iPhone) → <strong>Linked Devices</strong>.
                </span>
              </li>

              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  4
                </span>
                <span>Scan the QR code displayed on this screen.</span>
              </li>
            </ol>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300 flex items-start gap-2">
              <Sparkles size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Cloud-Optimized:</strong> Operates on-demand with minimal memory footprint on Render.
              </span>
            </div>
          </SaaSCard>

          {/* Connection Metadata Summary */}
          <SaaSCard className="p-5 space-y-3 bg-slate-900/90 text-xs">
            <h4 className="font-bold text-white text-xs border-b border-slate-800 pb-2">
              Session Details
            </h4>

            <div className="space-y-2 text-slate-400 text-[11px]">
              <div className="flex justify-between">
                <span>Session Type:</span>
                <span className="font-medium text-slate-200">Temporary QR (NoAuth)</span>
              </div>
              <div className="flex justify-between">
                <span>Memory Policy:</span>
                <span className="font-medium text-emerald-400">On-demand (0 idle RAM)</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-slate-300 font-semibold">{statusData.status}</span>
              </div>
            </div>
          </SaaSCard>
        </div>
      </div>
    </div>
  );
};
