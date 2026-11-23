"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { hub, hubSans } from "./hub-ui";

/**
 * Микро-кнопка «?» с пояснением в аккуратном окошке: формулы и смысл показателей лежат здесь, а не отдельной строкой на странице.
 * Закрывается кликом в сторону и клавишей Esc.
 */
export function HelpTip({ title, children, align = "right", label = "Как это считается" }: { title: string; children: ReactNode; align?: "left" | "right"; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 items-center justify-center rounded-full border text-[12.5px] font-bold leading-none outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
        style={{ ...hubSans, color: hub.textMuted, borderColor: "rgba(1, 20, 8, 0.28)", backgroundColor: open ? "#FFFFFF" : "rgba(255, 255, 255, 0.6)" }}
      >
        ?
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className="absolute top-8 z-40 w-[min(340px,82vw)] rounded-[18px] border bg-white p-5 text-left"
          style={{ [align === "right" ? "right" : "left"]: 0, borderColor: "rgba(1, 20, 8, 0.16)", boxShadow: "0 18px 40px -16px rgba(1, 20, 8, 0.35), 0 2px 6px rgba(1, 20, 8, 0.08)" }}
        >
          <p className="text-[16px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
            {title}
          </p>
          <div className="mt-2.5 space-y-2.5 text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Строка формулы внутри пояснения: сама формула выделена, ниже живой пример с числами магазина. */
export function Formula({ children, example }: { children: ReactNode; example?: ReactNode }) {
  return (
    <div className="rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
      <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {children}
      </p>
      {example ? (
        <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
          {example}
        </p>
      ) : null}
    </div>
  );
}
