import React, { useState } from "react";
import { Plus, UserPlus, DollarSign, Armchair, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const FloatingActionButton = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { id: "add_student", label: "Add Student", icon: UserPlus, color: "bg-blue-600 text-white" },
    { id: "assign_seat", label: "Assign Seat", icon: Armchair, color: "bg-purple-600 text-white" },
    { id: "collect_payment", label: "Collect Payment", icon: DollarSign, color: "bg-emerald-600 text-white" },
  ];

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3">
      {/* Speed Dial Action Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="flex flex-col items-end gap-2.5 mb-1"
          >
            {actions.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  onClick={() => {
                    setIsOpen(false);
                    onAction(act.id);
                  }}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900 border border-slate-800 shadow-xl text-white active:scale-95 transition-all"
                >
                  <span className="text-xs font-semibold">{act.label}</span>
                  <div className={`w-8 h-8 rounded-full ${act.color} flex items-center justify-center shadow-md`}>
                    <Icon size={16} />
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Trigger FAB */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-600/50 border border-blue-400/30 flex items-center justify-center transition-all"
        title="Quick Actions"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Plus size={28} />
        </motion.div>
      </motion.button>
    </div>
  );
};
