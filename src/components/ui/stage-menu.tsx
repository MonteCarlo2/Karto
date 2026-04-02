"use client";

import Link from "next/link";
import { Fragment } from "react";

const STUDIO_HREF: Record<
  "understanding" | "description" | "visual" | "price",
  string
> = {
  understanding: "/studio/understanding",
  description: "/studio/description",
  visual: "/studio/visual",
  price: "/studio/price",
};

interface StageMenuProps {
  currentStage: "understanding" | "description" | "visual" | "price";
  position?: "left" | "right"; // Позиция: left для visual, right для остальных
  visualQuota?: {
    used: number;
    remaining: number;
    limit: number;
  } | null;
}

export function StageMenu({ currentStage, position = "right", visualQuota = null }: StageMenuProps) {
  const stages = [
    { id: "understanding" as const, label: "Понимание" },
    { id: "description" as const, label: "Описание" },
    { id: "visual" as const, label: "Визуал" },
    { id: "price" as const, label: "Цена" },
  ];

  const positionClass = position === "left" ? "left-8" : "right-8";
  const fillPercent = visualQuota
    ? Math.max(0, Math.min(100, (visualQuota.remaining / Math.max(1, visualQuota.limit)) * 100))
    : 0;

  return (
    <div className={`fixed top-8 ${positionClass} z-50`} suppressHydrationWarning>
      <div className="relative w-fit">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full" suppressHydrationWarning style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
        }}>
          {stages.map((stage, index) => {
            const isActive = currentStage === stage.id;
            return (
              <Fragment key={stage.id}>
                <Link
                  href={STUDIO_HREF[stage.id]}
                  className="flex items-center gap-2 rounded-full px-1.5 py-0.5 -mx-0.5 transition-colors outline-none hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-[#2E5A43]/35 focus-visible:ring-offset-1"
                  aria-current={isActive ? "step" : undefined}
                  suppressHydrationWarning
                >
                  <div
                    className="w-2 h-2 rounded-full transition-all shrink-0"
                    suppressHydrationWarning
                    style={{
                      backgroundColor: isActive
                        ? "#2E5A43"
                        : "rgba(0, 0, 0, 0.2)",
                      boxShadow: isActive
                        ? "0 0 8px rgba(46, 90, 67, 0.4)"
                        : "none",
                    }}
                  />
                  <span
                    className="text-sm font-medium transition-all whitespace-nowrap"
                    suppressHydrationWarning
                    style={{
                      color: isActive
                        ? "#2E5A43"
                        : "rgba(0, 0, 0, 0.6)",
                      fontSize: isActive ? "15px" : "14px",
                    }}
                  >
                    {stage.label}
                  </span>
                </Link>
                {index < stages.length - 1 && (
                  <div
                    className="w-8 h-px mx-2 shrink-0"
                    suppressHydrationWarning
                    style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }}
                    aria-hidden
                  />
                )}
              </Fragment>
            );
          })}
        </div>
        {visualQuota && currentStage === "visual" && (
          <div
            className="fixed w-fit px-1 py-1"
            style={{
              top: 180,
              right: 10,
              background: "transparent",
              border: "none",
              boxShadow: "none",
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(0, 0, 0, 0.55)" }}>
                Поток
              </span>
              <div
                className="relative w-6 h-20 rounded-full overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, rgba(226,232,240,0.9) 0%, rgba(203,213,225,0.65) 100%)",
                  border: "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: "inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -4px 10px rgba(15,23,42,0.12)",
                }}
              >
                <div
                  className="absolute inset-x-0 bottom-0 transition-all duration-500"
                  style={{
                    height: `${fillPercent}%`,
                    background: visualQuota.remaining > 0
                      ? "linear-gradient(180deg, rgba(74,222,128,0.95) 0%, rgba(46,90,67,0.95) 100%)"
                      : "linear-gradient(180deg, rgba(248,113,113,0.9) 0%, rgba(239,68,68,0.95) 100%)",
                    boxShadow: "inset 0 1px 6px rgba(255,255,255,0.35), 0 0 8px rgba(46,90,67,0.25)",
                  }}
                />
                <div
                  className="absolute inset-x-0 rounded-full"
                  style={{
                    bottom: `${Math.max(0, fillPercent - 3)}%`,
                    height: "4px",
                    background: "rgba(255,255,255,0.45)",
                    opacity: fillPercent > 2 ? 1 : 0,
                    transition: "bottom 0.5s ease, opacity 0.3s ease",
                  }}
                />
              </div>
              <span className="text-[11px] font-semibold leading-none" style={{ color: "#2E5A43" }}>
                {visualQuota.remaining}/{visualQuota.limit}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
