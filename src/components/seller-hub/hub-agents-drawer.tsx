"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { hub, hubSans } from "./hub-ui";

/**
 * Выдвижная панель справа: настройки агента и журнал открываются поверх главного экрана, а не отдельными вкладками.
 * Заголовок и одна строка пояснения; закрывается Esc, кликом по затемнению и кнопкой.
 */
export function AgentDrawer({ open, title, subtitle, onClose, children, wide, modal }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; /** Окно по центру экрана вместо панели справа. */ modal?: boolean }) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={`fixed inset-0 z-[120] flex ${modal ? "items-center justify-center p-3 sm:p-6" : "justify-end"}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="hub-fade-in absolute inset-0" style={{ backgroundColor: "rgba(1, 20, 8, 0.28)", backdropFilter: "blur(2px)" }} onMouseDown={onClose} aria-hidden />
      <div ref={panel} tabIndex={-1} className={`hub-fade-in relative flex w-full flex-col outline-none ${modal ? "h-[min(86vh,720px)] max-w-[760px] rounded-[26px]" : `h-full ${wide ? "max-w-[1180px]" : "max-w-[640px]"}`}`} style={{ backgroundColor: hub.canvas, boxShadow: modal ? "0 30px 90px -30px rgba(1, 20, 8, 0.55), 0 0 0 1px rgba(1, 20, 8, 0.06)" : "-24px 0 60px -30px rgba(1, 20, 8, 0.45)" }}>
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6 sm:px-8">
          <div className="min-w-0">
            <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[14px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ color: hub.text }}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2 sm:px-8">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
