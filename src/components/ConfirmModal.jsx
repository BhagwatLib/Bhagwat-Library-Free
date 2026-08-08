import React from "react";
import { AlertTriangle, CheckCircle, X, Trash2 } from "lucide-react";
import { clsx } from "clsx";

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Delete Record",
  cancelText = "Cancel",
  variant = "danger",
  showCancel = true,
  isLoading = false,
  loadingText = "Processing...",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="skeuo-card w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div
            className={clsx(
              "skeuo-dial w-12 h-12",
              variant === "danger"
                ? "text-rose-500 glow-red"
                : variant === "success"
                ? "text-emerald-500 glow-cyan"
                : "text-blue-500 glow-purple"
            )}
          >
            {variant === "success" ? (
              <CheckCircle size={22} />
            ) : variant === "danger" ? (
              <Trash2 size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
          </div>
          <button
            onClick={onClose}
            className="skeuo-dial w-7 h-7 text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <h3 className="text-base font-extrabold text-slate-800 dark:text-white mb-1.5">
          {title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex gap-3">
          {showCancel && (
            <button
              onClick={onClose}
              disabled={isLoading}
              className={clsx(
                "skeuo-btn flex-1 py-2.5 text-xs font-bold",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => {
              if (!isLoading) {
                onConfirm?.();
              }
            }}
            disabled={isLoading}
            className={clsx(
              "skeuo-btn flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5",
              variant === "danger"
                ? "skeuo-btn-danger"
                : variant === "success"
                ? "skeuo-btn-success"
                : "skeuo-btn-primary",
              isLoading && "opacity-70 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{loadingText}</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
