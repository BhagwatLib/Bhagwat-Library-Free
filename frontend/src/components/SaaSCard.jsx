import React from "react";
import { clsx } from "clsx";
import { motion } from "framer-motion";

export const SaaSCard = ({
  children,
  className = "",
  hover = true,
  withRivets = false,
  withGrip = false,
}) => {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : {}}
      className={clsx(
        "skeuo-card relative",
        className
      )}
    >
      {withRivets && (
        <>
          <div className="skeuo-rivet absolute top-3.5 left-3.5" />
          <div className="skeuo-rivet absolute top-3.5 right-3.5" />
          <div className="skeuo-rivet absolute bottom-3.5 left-3.5" />
          <div className="skeuo-rivet absolute bottom-3.5 right-3.5" />
        </>
      )}

      {withGrip && (
        <div className="skeuo-grip absolute top-4 right-4">
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
          <div className="skeuo-grip-dot" />
        </div>
      )}

      {children}
    </motion.div>
  );
};

