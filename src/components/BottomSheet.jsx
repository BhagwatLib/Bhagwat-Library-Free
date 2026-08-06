import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "max-h-[85vh]",
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
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm">
          {/* Backdrop Touch Dismiss */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />

          {/* Bottom Sheet Container */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={`relative z-10 w-full bg-slate-900 border-t border-slate-800 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col ${maxHeight}`}
          >
            {/* Top Drag Handle Indicator */}
            <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-slate-700/80" />
            </div>

            {/* Header */}
            {title && (
              <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between">
                <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Scrollable Sheet Content */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4 pb-12">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
