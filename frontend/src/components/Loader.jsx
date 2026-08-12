import React from "react";
import { Loader2 } from "lucide-react";

export const Loader = () => {
  return (
    <div className="flex items-center justify-center min-h-[50vh] w-full">
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
    </div>
  );
};
