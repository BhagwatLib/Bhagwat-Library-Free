import React from "react";
import { clsx } from "clsx";
import { motion } from "framer-motion";

export const SaaSCard = ({ children, className = "", hover = true, glass = false }) => {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : {}}
      className={clsx(
        "rounded-2xl border transition-all duration-300 relative overflow-hidden",
        glass
          ? "bg-slate-900/60 backdrop-blur-xl border-white/10 shadow-2xl"
          : "bg-slate-900/90 border-slate-800/80 hover:border-slate-700/80 shadow-lg shadow-black/20",
        className
      )}
    >
      {children}
    </motion.div>
  );
};
