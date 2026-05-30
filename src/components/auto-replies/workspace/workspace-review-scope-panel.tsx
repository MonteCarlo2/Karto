"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { AutoRepliesReviewScopeSettings, ReviewScopeMode } from "@/lib/auto-replies/review-scope-settings";
import { reviewScopeModeLabel } from "@/lib/auto-replies/review-scope-settings";
import { WsGlassPanel, WsWorkspaceSegment, glass, panel, wsSans } from "./settings-ui";

type WorkspaceReviewScopePanelProps = {
  reviewScope: AutoRepliesReviewScopeSettings;
  onPatch: (patch: Partial<AutoRepliesReviewScopeSettings>) => void;
};

const MODE_OPTIONS: { value: ReviewScopeMode; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "new_only", label: "Новые" },
  { value: "limited", label: "Лимит" },
];

export function WorkspaceReviewScopePanel({
  reviewScope,
  onPatch,
}: WorkspaceReviewScopePanelProps) {
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, reviewScope.limit - reviewScope.limitConsumed);
  const showRemaining = reviewScope.mode === "limited";

  return (
    <WsGlassPanel className="w-full">
      <div
        className="border-b px-4 py-4 sm:px-5"
        style={{
          borderColor: glass.borderSoft,
          background:
            "linear-gradient(135deg, rgba(46,90,67,0.07) 0%, rgba(243,241,234,0.4) 55%, rgba(185,255,75,0.14) 100%)",
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem]"
            style={{
              backgroundColor: "rgba(185,255,75,0.28)",
              boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.12)",
            }}
          >
            <SlidersHorizontal className="h-[1.1rem] w-[1.1rem]" style={{ color: panel.green }} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ ...wsSans, color: panel.green }}
            >
              Объём ответов
            </p>
            <p
              className="mt-1.5 text-[12px] leading-[1.55]"
              style={{ ...wsSans, color: panel.textMuted }}
            >
              Сколько неотвеченных отзывов подтягивать с маркетплейса
            </p>
            <p
              className="mt-2 text-[16px] font-semibold tracking-[-0.025em]"
              style={{ ...wsSans, color: panel.text }}
            >
              {reviewScopeModeLabel(reviewScope.mode)}
            </p>
          </div>
        </div>

        {showRemaining ? (
          <div className="mt-3.5 flex flex-wrap gap-2">
            <StatChip label="Осталось" value={String(remaining)} accent />
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 sm:px-5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-[0.9rem] bg-[#0A0A0A] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_12px_32px_-14px_rgba(10,10,10,0.55)] transition hover:bg-[#141414]"
          style={wsSans}
        >
          Настроить
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden
          />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-3.5 pt-4">
                <WsWorkspaceSegment
                  value={reviewScope.mode}
                  onChange={(mode) => onPatch({ mode })}
                  tone="brand"
                  accentValue="limited"
                  options={MODE_OPTIONS}
                />

                {reviewScope.mode === "new_only" ? (
                  <div
                    className="rounded-[0.9rem] border px-3.5 py-3"
                    style={{
                      borderColor: glass.borderSoft,
                      backgroundColor: glass.surfaceStrong,
                    }}
                  >
                    <label
                      htmlFor="review-new-since"
                      className="text-[12px] font-medium"
                      style={{ ...wsSans, color: panel.textMuted }}
                    >
                      С какого числа
                    </label>
                    <input
                      id="review-new-since"
                      type="date"
                      value={reviewScope.newSince}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => onPatch({ newSince: e.target.value })}
                      className="mt-2 w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.14)]"
                      style={{
                        ...wsSans,
                        borderColor: glass.borderSoft,
                        backgroundColor: panel.inputBg,
                        color: panel.text,
                      }}
                    />
                  </div>
                ) : null}

                {reviewScope.mode === "limited" ? (
                  <div
                    className="rounded-[0.9rem] border px-3.5 py-3"
                    style={{
                      borderColor: glass.borderSoft,
                      backgroundColor: glass.surfaceStrong,
                    }}
                  >
                    <label
                      htmlFor="review-limit-count"
                      className="text-[12px] font-medium"
                      style={{ ...wsSans, color: panel.textMuted }}
                    >
                      Сколько ответов
                    </label>
                    <input
                      id="review-limit-count"
                      type="number"
                      min={1}
                      max={10000}
                      value={reviewScope.limit}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        const limit = Math.min(10_000, Math.max(1, Math.round(next)));
                        onPatch({
                          limit,
                          limitConsumed: Math.min(reviewScope.limitConsumed, limit),
                        });
                      }}
                      className="mt-2 w-full rounded-lg border px-3 py-2 text-[13px] tabular-nums outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.14)]"
                      style={{
                        ...wsSans,
                        borderColor: glass.borderSoft,
                        backgroundColor: panel.inputBg,
                        color: panel.text,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </WsGlassPanel>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="inline-flex min-w-[7.5rem] flex-1 items-center justify-between gap-2 rounded-[0.8rem] border px-3 py-2"
      style={{
        borderColor: accent ? "rgba(46,90,67,0.16)" : glass.borderSoft,
        backgroundColor: accent ? "rgba(185,255,75,0.16)" : "rgba(255,255,255,0.42)",
      }}
    >
      <span className="text-[11px] font-medium" style={{ ...wsSans, color: panel.textMuted }}>
        {label}
      </span>
      <span
        className="text-[17px] font-bold tabular-nums leading-none"
        style={{ ...wsSans, color: accent ? panel.greenDark : panel.text }}
      >
        {value}
      </span>
    </div>
  );
}
