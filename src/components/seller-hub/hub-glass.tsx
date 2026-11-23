"use client";

import type { ReactNode } from "react";

/**
 * ПРОБА «жидкое стекло»: оболочка раздела. Внутри блоки с атрибутом data-glass получают преломление фона (SVG-фильтр),
 * блик по кромке и мягкую подсветку там, где находится курсор. Откат: заменить обёртку на обычный div.
 */
export function HubGlassScope({ children, className }: { children: ReactNode; className?: string }) {
  function track(e: React.PointerEvent<HTMLDivElement>) {
    const host = (e.target as HTMLElement).closest?.("[data-glass]") as HTMLElement | null;
    if (!host) return;
    const box = host.getBoundingClientRect();
    host.style.setProperty("--mx", `${e.clientX - box.left}px`);
    host.style.setProperty("--my", `${e.clientY - box.top}px`);
    // вложенные плитки тоже подсвечиваются
    const inner = (e.target as HTMLElement).closest?.("[data-glass] [data-glass]") as HTMLElement | null;
    if (inner && inner !== host) {
      const ib = inner.getBoundingClientRect();
      inner.style.setProperty("--mx", `${e.clientX - ib.left}px`);
      inner.style.setProperty("--my", `${e.clientY - ib.top}px`);
    }
  }
  function leave(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.querySelectorAll<HTMLElement>("[data-glass]").forEach((el) => {
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    });
  }
  return (
    <div className={`hub-glass-scope ${className ?? ""}`} onPointerMove={track} onPointerLeave={leave}>
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter id="hub-liquid" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.016" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2.2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="30" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {children}
    </div>
  );
}
