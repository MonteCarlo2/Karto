"use client";

import { FileText, ImageIcon, PenLine } from "lucide-react";
import { KartoAiOrb } from "./karto-ai-orb";
import { panel, wsSans } from "@/components/auto-replies/workspace/settings-ui";

const SOURCES = [
  { icon: PenLine, label: "Текст" },
  { icon: FileText, label: "Файлы" },
  { icon: ImageIcon, label: "Фото" },
] as const;

/** AI-шапка базы знаний: живой orb + поток данных (без мигающих точек). */
export function AiNeuralDecor() {
  return (
    <div
      aria-hidden
      className="karto-ai-knowledge-header relative overflow-hidden border-b"
      style={{ borderColor: "rgba(46,90,67,0.1)" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, rgba(46,90,67,0.07) 0%, rgba(185,255,75,0.11) 38%, rgba(255,255,255,0.55) 68%, rgba(243,241,234,0.9) 100%)",
        }}
      />

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1200 88"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="kartoAiStream" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(46,90,67,0)" />
            <stop offset="45%" stopColor="rgba(185,255,75,0.55)" />
            <stop offset="55%" stopColor="rgba(46,90,67,0.35)" />
            <stop offset="100%" stopColor="rgba(46,90,67,0)" />
          </linearGradient>
        </defs>
        <path
          className="karto-ai-stream-path"
          d="M-40,44 C180,8 320,72 520,40 S880,16 1240,48"
          fill="none"
          stroke="url(#kartoAiStream)"
          strokeWidth="1.25"
          opacity="0.7"
        />
        <path
          className="karto-ai-stream-path karto-ai-stream-path--slow"
          d="M-60,58 C220,78 420,22 640,52 S940,68 1260,36"
          fill="none"
          stroke="rgba(46,90,67,0.14)"
          strokeWidth="1"
        />
      </svg>

      <div className="karto-ai-scan-line pointer-events-none absolute inset-y-0 left-0 w-[42%]" />

      <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="pointer-events-none absolute -inset-3 rounded-full blur-xl"
              style={{ background: "radial-gradient(circle, rgba(185,255,75,0.42) 0%, transparent 68%)" }}
            />
            <div
              className="relative rounded-full p-[3px]"
              style={{
                background: "linear-gradient(145deg, rgba(185,255,75,0.85), rgba(46,90,67,0.35), rgba(255,255,255,0.65))",
                boxShadow: "0 8px 28px -10px rgba(46,90,67,0.45), inset 0 1px 0 rgba(255,255,255,0.55)",
              }}
            >
              <KartoAiOrb size={54} durationSec={14} />
            </div>
          </div>

          <div className="min-w-0">
            <p
              className="text-[15px] font-semibold tracking-[-0.02em] sm:text-[16px]"
              style={{ ...wsSans, color: panel.text }}
            >
              База знаний ИИ
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
              Учится на ваших материалах — текст, файлы и фото
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SOURCES.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium backdrop-blur-sm sm:text-[13px]"
              style={{
                ...wsSans,
                color: panel.text,
                backgroundColor: "rgba(255,255,255,0.62)",
                boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.1), 0 4px 14px -10px rgba(46,90,67,0.35)",
              }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: panel.green }} strokeWidth={2} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
