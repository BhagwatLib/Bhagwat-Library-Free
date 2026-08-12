import { useEffect } from "react";

/**
 * Custom hook to lock body & background viewport scrolling when any modal,
 * bottom sheet, or popup is open.
 * Works seamlessly across iOS Safari, Android Chrome, and desktop browsers.
 */
export const useBodyScrollLock = (isLocked = true) => {
  useEffect(() => {
    if (!isLocked) return;

    // 1. Lock document.body and html styles
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";

    // 2. Add global lock class so CSS can lock underlying <main> & viewport containers
    document.body.classList.add("modal-open-scroll-lock");

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.classList.remove("modal-open-scroll-lock");
    };
  }, [isLocked]);
};
