"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { hub, hubSans } from "./hub-ui";

export type HubToastState = {
  message: string;
  tone: "ok" | "error" | "warn";
  id: number;
};

const TONE_COLORS: Record<HubToastState["tone"], { bg: string; text: string; border: string }> = {
  ok: { bg: hub.greenSoft, text: hub.green, border: "rgba(46,90,67,0.2)" },
  error: { bg: hub.dangerSoft, text: hub.danger, border: "rgba(192,57,43,0.2)" },
  warn: { bg: hub.warnSoft, text: hub.warn, border: "rgba(180,83,9,0.2)" },
};

export function HubToast({
  toast,
  onDismiss,
}: {
  toast: HubToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5_000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const colors = TONE_COLORS[toast.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9999] flex max-w-sm items-start gap-3 rounded-[14px] border px-4 py-3 shadow-[0_4px_24px_rgba(10,12,10,0.14)] animate-in fade-in slide-in-from-bottom-3 duration-200"
      style={{ backgroundColor: colors.bg, borderColor: colors.border, ...hubSans }}
    >
      <p className="flex-1 text-[13.5px] leading-[1.55]" style={{ color: colors.text }}>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-0.5 shrink-0 rounded-[6px] p-0.5 opacity-60 transition-opacity hover:opacity-100"
        style={{ color: colors.text }}
        aria-label="Закрыть"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useHubToast() {
  return {
    makeToast: (message: string, tone: HubToastState["tone"]): HubToastState => ({
      message,
      tone,
      id: Date.now(),
    }),
  };
}
