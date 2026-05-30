"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { glass, panel, wsComposeText, wsSans } from "./settings-ui";

const LOADING_PHRASES = [
  "Учитываем стиль и тон",
  "Подбираем подпись",
  "Проверяем правила",
  "Формируем ответ",
];

const SKELETON_LINES = [
  { width: "96%", delay: 0 },
  { width: "84%", delay: 0.08 },
  { width: "68%", delay: 0.16 },
  { width: "52%", delay: 0.24 },
];

function GeneratingWordmark() {
  const label = "Генерация";

  return (
    <p
      className="flex items-center justify-center gap-[0.08em] text-[12px] font-semibold uppercase tracking-[0.16em]"
      style={{ ...wsSans, color: panel.greenDark }}
      aria-hidden
    >
      {label.split("").map((letter, index) => (
        <motion.span
          key={`${letter}-${index}`}
          animate={{ opacity: [0.32, 1, 0.32], y: [0, -2, 0] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.07,
          }}
        >
          {letter}
        </motion.span>
      ))}
    </p>
  );
}

export function GenerationLoader() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="relative flex min-h-[240px] flex-col overflow-hidden rounded-[1rem] border px-5 py-6 sm:px-6 sm:py-7"
      style={{
        borderColor: "rgba(46,90,67,0.12)",
        background:
          "linear-gradient(165deg, rgba(238,246,232,0.72) 0%, rgba(255,255,255,0.94) 100%)",
      }}
      role="status"
      aria-live="polite"
      aria-label="Генерация ответа"
    >
      <GeneratingWordmark />

      <div
        className="relative mt-4 rounded-[0.95rem] border px-4 py-5 sm:px-5 sm:py-6"
        style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.72)" }}
      >
        <div className="space-y-3.5">
          {SKELETON_LINES.map((line) => (
            <motion.span
              key={line.width}
              aria-hidden
              className="manual-compose-skeleton-line block h-[0.72rem] rounded-full"
              style={{ width: line.width, animationDelay: `${line.delay}s` }}
              initial={{ opacity: 0, scaleX: 0.92 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.35, delay: line.delay }}
            />
          ))}
        </div>
        <motion.span
          aria-hidden
          className="absolute bottom-5 left-[52%] inline-block h-[1.05rem] w-[2px] rounded-full sm:bottom-6"
          style={{ backgroundColor: panel.green }}
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 0.95, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto mt-3 h-[1.4rem] w-full max-w-[15rem] overflow-hidden text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute inset-x-0 text-[14px] font-medium sm:text-[15px]"
            style={{ ...wsComposeText, color: panel.textMuted }}
          >
            {LOADING_PHRASES[index]}…
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ToolbarActionButton({
  onClick,
  icon,
  label,
  variant = "default",
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  variant?: "default" | "history";
}) {
  const isHistory = variant === "history";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative inline-flex min-h-[2.9rem] items-center gap-2.5 overflow-hidden rounded-[0.95rem] border px-4 py-2.5 transition hover:-translate-y-px"
      style={{
        ...wsSans,
        borderColor: isHistory ? "rgba(46,90,67,0.14)" : glass.borderSoft,
        background: isHistory
          ? "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(238,246,232,0.72) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(243,241,234,0.82) 100%)",
        color: panel.text,
        boxShadow: isHistory
          ? "0 12px 32px -18px rgba(46,90,67,0.35), inset 0 1px 0 rgba(255,255,255,0.85)"
          : "0 10px 28px -20px rgba(10,10,10,0.35), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(120deg, transparent 0%, rgba(185,255,75,0.12) 50%, transparent 100%)",
        }}
      />
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] border transition group-hover:scale-[1.04]"
        style={{
          borderColor: isHistory ? "rgba(46,90,67,0.12)" : "rgba(46,90,67,0.1)",
          backgroundColor: isHistory ? "rgba(185,255,75,0.22)" : panel.accentSoft,
          color: panel.greenDark,
        }}
      >
        {icon}
      </span>
      <span className="relative text-[14px] font-semibold">{label}</span>
    </button>
  );
}
