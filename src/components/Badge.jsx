import React from "react";
import { clsx } from "clsx";

export const Badge = ({
  children,
  variant = "default",
  className = "",
  dot = false,
}) => {
  const variantStyles = {
    default: "text-slate-400 dark:text-slate-400 border-slate-300 dark:border-slate-700",
    success: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    danger: "text-rose-600 dark:text-rose-400 border-rose-500/30",
    warning: "text-amber-600 dark:text-amber-400 border-amber-500/30",
    primary: "text-blue-600 dark:text-blue-400 border-blue-500/30",
    purple: "text-purple-600 dark:text-purple-400 border-purple-500/30",
    cyan: "text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  };

  const dotColors = {
    default: "bg-slate-400",
    success: "jewel-dot emerald",
    danger: "jewel-dot ruby",
    warning: "jewel-dot amber",
    primary: "jewel-dot cyan",
    purple: "jewel-dot purple",
    cyan: "jewel-dot cyan",
  };

  return (
    <span
      className={clsx(
        "skeuo-badge inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold transition-all",
        variantStyles[variant] || variantStyles.default,
        className
      )}
    >
      {dot && <span className={clsx("w-1.5 h-1.5 rounded-full", dotColors[variant] || dotColors.default)} />}
      {children}
    </span>
  );
};

