import React from "react";

export const SkeletonLoader = ({ type = "table", rows = 5 }) => {
  if (type === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 h-36">
            <div className="h-4 bg-slate-800 rounded w-1/3 mb-4"></div>
            <div className="h-8 bg-slate-800 rounded w-2/3 mb-2"></div>
            <div className="h-3 bg-slate-800/60 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-3 animate-pulse">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-xl h-24 p-3 flex flex-col justify-between">
            <div className="h-4 bg-slate-800 rounded w-8"></div>
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 animate-pulse space-y-4">
      <div className="h-6 bg-slate-800 rounded w-1/4 mb-6"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-800/50">
          <div className="w-10 h-10 rounded-full bg-slate-800"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-800 rounded w-1/3"></div>
            <div className="h-3 bg-slate-800/60 rounded w-1/4"></div>
          </div>
          <div className="w-16 h-6 rounded-full bg-slate-800"></div>
        </div>
      ))}
    </div>
  );
};
