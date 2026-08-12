import React from "react";
import { FolderOpen } from "lucide-react";
import { motion } from "framer-motion";

export const EmptyState = ({
  icon: Icon = FolderOpen,
  title = "No records found",
  description = "There are no items matching your criteria.",
  actionLabel,
  onAction,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/60 my-6"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
        <Icon size={28} />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
};
