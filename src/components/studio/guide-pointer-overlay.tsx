"use client";

import { ArrowUpFromLine } from "lucide-react";

/**
 * Подсказка под кнопкой «инструкция»: готовая иконка Lucide (ровный штрих) + текст.
 * Скрывается при открытии инструкции в родителе.
 */
export function GuidePointerOverlay({
  subtitle,
}: {
  subtitle?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-[55] mt-1 w-[6rem] -translate-x-1/2"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center">
        <div className="-mb-1 -mt-3 text-[#1F4E3D]/75" aria-hidden>
          <ArrowUpFromLine
            className="h-[4.85rem] w-11"
            strokeWidth={2.75}
            absoluteStrokeWidth
          />
        </div>

        <p
          className="max-w-[5.75rem] text-center text-[11px] font-medium italic leading-tight tracking-wide text-[#2E5A43]/80"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.88)" }}
        >
          Лучше прочитать
        </p>
        {subtitle ? (
          <p
            className="mt-0.5 max-w-[6.5rem] text-center text-[9px] font-normal leading-snug text-[#64748B]/88"
            style={{ textShadow: "0 1px 0 rgba(255,255,255,0.82)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
