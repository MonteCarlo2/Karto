"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { hub, hubSans } from "./hub-ui";

/**
 * Окно настроек: слева меню разделов, справа сами настройки выбранного раздела.
 * Открывается по центру поверх экрана, закрывается Esc, кликом по затемнению и крестиком. На телефоне меню становится полосой сверху.
 */

export type SettingsNavItem<T extends string> = { id: T; label: string; icon: LucideIcon; /** Короткая подпись в меню. */ hint?: string; /** Описание под заголовком справа. */ description?: string };

export function SettingsWindow<T extends string>({
  open,
  onClose,
  title,
  items,
  active,
  onSelect,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: Array<SettingsNavItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

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

  // При переходе в другой раздел правая часть начинается с самого верха.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [active]);

  if (!open || typeof document === "undefined") return null;
  const current = items.find((i) => i.id === active) ?? items[0]!;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="hub-fade-in absolute inset-0" style={{ backgroundColor: "rgba(1, 20, 8, 0.32)", backdropFilter: "blur(3px)" }} onMouseDown={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        className="hub-fade-in relative flex h-[min(88vh,780px)] w-full max-w-[1020px] flex-col overflow-hidden rounded-[26px] outline-none md:flex-row"
        style={{ backgroundColor: hub.canvas, boxShadow: "0 30px 80px -28px rgba(1, 20, 8, 0.45), 0 0 0 1px rgba(1, 20, 8, 0.08)" }}
      >
        <nav aria-label={title} className="flex shrink-0 flex-col md:w-[232px] md:border-r" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] md:hidden" style={{ color: hub.textSubtle }}>
            <X className="h-5 w-5" aria-hidden />
          </button>
          <ul className="flex gap-1 overflow-x-auto px-3 pb-2 pt-4 [scrollbar-width:none] md:flex-1 md:flex-col md:gap-1 md:overflow-y-auto md:overflow-x-visible md:px-0 md:pb-4 md:pt-9 [&::-webkit-scrollbar]:hidden" role="tablist" aria-orientation="vertical">
            {items.map((it) => {
              const on = it.id === active;
              return (
                <li key={it.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => onSelect(it.id)}
                    className="group/nav relative flex w-full items-center gap-3 py-3.5 pl-7 pr-4 text-left outline-none transition-colors duration-200 hover:bg-[rgba(1,20,8,0.03)] focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]"
                  >
                    <span className="absolute inset-y-1.5 left-0 w-[2.5px] rounded-full transition-opacity duration-200" style={{ backgroundColor: hub.ink, opacity: on ? 1 : 0 }} aria-hidden />
                    <it.icon className="h-[18px] w-[18px] shrink-0 transition-colors duration-200" style={{ color: on ? hub.text : hub.textSubtle }} strokeWidth={1.7} aria-hidden />
                    <span className="whitespace-nowrap text-[15px] leading-5 transition-colors duration-200" style={{ ...hubSans, color: on ? hub.text : hub.textMuted, fontWeight: on ? 600 : 500 }}>
                      {it.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute right-4 top-4 z-10 hidden h-10 w-10 items-center justify-center rounded-full outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] md:flex" style={{ color: hub.textSubtle }}>
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-12 sm:px-10 md:pt-10" role="tabpanel" aria-label={current.label}>
            <header className="mb-8 border-b pb-6 pr-10" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
              <h3 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                {current.label}
              </h3>
              {current.description ? (
                <p className="mt-1.5 max-w-[58ch] text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                  {current.description}
                </p>
              ) : null}
            </header>
            <div key={active} className="hub-fade-in">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
