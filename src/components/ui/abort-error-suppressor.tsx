"use client";

import { useEffect } from "react";

/**
 * Подавляет AbortError в unhandledrejection, чтобы Next.js не показывал
 * оверлей ошибки при отмене запросов (навигация, unmount и т.д.).
 */
export function AbortErrorSuppressor() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const err = event.reason;
      if (err?.name === "AbortError" || (err?.message?.includes?.("aborted") ?? false)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  return null;
}
