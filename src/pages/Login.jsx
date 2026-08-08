import React from "react";
import { Lock, ShieldCheck, KeyRound } from "lucide-react";
import { SaaSCard } from "../components/SaaSCard";

export const Login = ({ onLogin }) => {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === "admin853203") {
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000); // Clear error after 2s
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-sm">
        <SaaSCard className="p-8 relative" withRivet withGrip>
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="skeuo-dial w-20 h-20 glow-purple text-purple-400 p-1">
              <img
                src="/logo.jpg"
                alt="Logo"
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5">
                <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">
                  Bhagwat Library
                </h1>
                <span className="jewel-dot cyan" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Admin Security Terminal
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`skeuo-input w-full pl-10 pr-4 py-3 text-sm font-semibold tracking-widest text-center ${
                    error ? "border-rose-500 ring-2 ring-rose-500/30" : ""
                  }`}
                  placeholder="••••••••••••"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-rose-500 text-xs text-center mt-2 font-bold animate-in fade-in">
                  Incorrect access key. Please retry.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="skeuo-btn skeuo-btn-primary w-full py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <ShieldCheck size={16} /> Access Portal
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Automated Cloud Sync Active
            </p>
          </div>
        </SaaSCard>
      </div>
    </div>
  );
};
