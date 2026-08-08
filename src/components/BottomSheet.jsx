import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "max-h-[88vh]",
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/75 backdrop-blur-md">
          {/* Backdrop Touch Dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          {/* Modal / Sheet Container */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={`relative z-10 w-full md:max-w-2xl bg-[var(--card-bg)] border-t md:border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col ${maxHeight}`}
          >
            {/* Top Drag Handle Indicator (Mobile only) */}
            <div className="pt-3 pb-1 flex md:hidden justify-center cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            {title && (
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-[var(--card-bg)] sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                    {title}
                  </h3>
                  <span className="jewel-dot cyan" />
                </div>
                <button
                  onClick={onClose}
                  className="skeuo-dial w-7 h-7 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Scrollable Sheet Content */}
            <div className="p-5 md:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4 pb-8">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
