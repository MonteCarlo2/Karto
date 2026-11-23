"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Lightbulb, X } from "lucide-react";
import { hub, hubSans } from "./hub-ui";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const LINE = "rgba(1, 20, 8, 0.1)";

export type AnalysisCriterion = { label: string; score: number; evidence?: string | null };

const scoreColor = (score: number) => (score >= 7 ? "#2E9E6B" : score >= 5 ? "#4F7CC4" : "#D9912B");

/**
 * Развёрнутый разбор нейросети (фото или текст): итоговый балл, оценки по критериям полосами,
 * сильные стороны, недостатки с тем, как исправить. Один вид для фото и для текста.
 */
export function AnalysisPanel({
  title,
  score,
  bandLabel,
  bandColor,
  sellability,
  notes,
  saleNote,
  criteria,
  strengths,
  defects,
  lowConfidence,
  extra,
  footer,
}: {
  title: string;
  score: number;
  bandLabel: string;
  bandColor: string;
  sellability?: { label: string; reason: string } | null;
  notes?: Array<{ label: string; text: string }>;
  saleNote?: string | null;
  criteria: AnalysisCriterion[];
  strengths: string[];
  defects: Array<{ what: string; fix?: string | null }>;
  lowConfidence?: string | null;
  extra?: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group flex w-full items-center justify-between gap-4 rounded-[20px] border px-5 py-4 text-left outline-none transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:bg-black/[0.035] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
        style={{ borderColor: "rgba(1, 20, 8, 0.14)", backgroundColor: "rgba(1, 20, 8, 0.025)" }}
      >
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 min-w-[56px] items-center justify-center rounded-[14px] px-2.5 text-[22px] font-medium" style={{ ...MONO, color: bandColor, backgroundColor: `color-mix(in srgb, ${bandColor} 13%, white)` }}>
            {score}
          </span>
          <span className="min-w-0">
            <span className="block text-[16.5px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
              {title}
            </span>
            <span className="block text-[14.5px]" style={{ ...hubSans, color: bandColor, fontWeight: 600 }}>
              {bandLabel}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
          Открыть
          <ArrowUpRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
        </span>
      </button>

      {open
        ? createPortal(
            <div className="hub-fade-in fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(1,20,8,0.45)] backdrop-blur-[2px] sm:items-center sm:p-6" onClick={() => setOpen(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                className="hub-pop flex max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
                style={{ backgroundColor: hub.canvas, boxShadow: "0 30px 80px -20px rgba(1, 20, 8, 0.45)" }}
              >
                <div className="flex items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: LINE }}>
                  <p className="flex items-center gap-3 text-[19px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    <span className="flex h-10 min-w-[52px] items-center justify-center rounded-[12px] px-2 text-[20px] font-medium" style={{ ...MONO, color: bandColor, backgroundColor: `color-mix(in srgb, ${bandColor} 13%, white)` }}>
                      {score}
                    </span>
                    {title}
                  </p>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="rounded-full p-2 outline-none transition-colors hover:bg-black/[0.06] focus-visible:shadow-[0_0_0_3px_var(--hub-lime-ring)]" style={{ color: hub.textMuted }}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto px-6 pb-7 pt-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="flex items-baseline gap-2" style={MONO}>
            <span className="text-[44px] font-medium leading-none" style={{ color: bandColor }}>
              {score}
            </span>
            <span className="text-[18px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
              из 100
            </span>
          </p>
          {sellability ? (
            <p className="max-w-[62ch] text-[16.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
              <strong className="block text-[17px]" style={{ color: hub.text }}>Продаваемость: {sellability.label}</strong>
              {sellability.reason}
            </p>
          ) : null}
        </div>

        {saleNote ? (
          <p className="rounded-[16px] px-5 py-4 text-[16px] leading-[1.6]" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.05)" }}>
            {saleNote}
          </p>
        ) : null}

        {notes && notes.length > 0 ? (
          <dl className="space-y-3">
            {notes.map((n) => (
              <div key={n.label} className="rounded-[16px] py-3.5 pl-5 pr-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.035)", boxShadow: "inset 3px 0 0 rgba(122, 190, 40, 0.7)" }}>
                <dt className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
                  {n.label}
                </dt>
                <dd className="mt-1 max-w-[70ch] text-[16px] leading-[1.6]" style={{ ...hubSans, color: hub.text }}>
                  {n.text}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div>
          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Оценка по критериям
          </p>
          <ul className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {criteria.map((c) => (
              <li key={c.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15.5px]" style={{ ...hubSans, color: hub.text }}>
                    {c.label}
                  </span>
                  <span className="text-[17px] font-medium" style={{ ...MONO, color: scoreColor(c.score) }}>
                    {c.score.toLocaleString("ru-RU")}
                    <span className="text-[13px]" style={{ color: hub.textSubtle }}>
                      /10
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }}>
                  <div className="hub-grow h-full rounded-full" style={{ width: `${Math.max(2, c.score * 10)}%`, backgroundColor: scoreColor(c.score) }} />
                </div>
                {c.evidence && c.score < 6 ? (
                  <p className="mt-1.5 text-[14.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
                    {c.evidence}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {strengths.length > 0 ? (
          <div>
            <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Что хорошо
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {strengths.map((s) => (
                <li key={s} className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14.5px]" style={{ ...hubSans, color: "#05603F", backgroundColor: "rgba(46, 158, 107, 0.12)" }}>
                  <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Что исправить
          </p>
          {defects.length > 0 ? (
            <ul className="mt-2.5 space-y-2.5">
              {defects.map((d) => (
                <li key={d.what} className="rounded-[16px] px-4 py-3.5" style={{ backgroundColor: "rgba(217, 145, 43, 0.1)" }}>
                  <p className="text-[15.5px] font-semibold leading-[1.4]" style={{ ...hubSans, color: hub.text }}>
                    {d.what}
                  </p>
                  {d.fix ? (
                    <p className="mt-1.5 flex items-start gap-2.5 text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                      <span className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.6)" }} aria-hidden>
                        <Lightbulb className="h-3.5 w-3.5" style={{ color: hub.text }} />
                      </span>
                      {d.fix}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              Существенных недостатков нейросеть не нашла.
            </p>
          )}
        </div>

        {extra}

        {lowConfidence ? (
          <p className="text-[14.5px]" style={{ ...hubSans, color: "#B8741A" }}>
            {lowConfidence}
          </p>
        ) : null}
        {footer}
      </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
