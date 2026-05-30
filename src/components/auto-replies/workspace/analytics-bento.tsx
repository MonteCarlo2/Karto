"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import type { StarKey } from "@/lib/auto-replies/settings-types";
import type { AnalyticsDataSource } from "@/lib/auto-replies/inbox-analytics";
import { wsSans } from "./settings-ui";

export const A = {
  lime: "#B9FF4B",
  black: "#070907",
  white: "#FFFFFF",
  beige: "#EBE6DC",
  canvas: "#F3F1EA",
  muted: "rgba(7, 9, 7, 0.48)",
  border: "rgba(7, 9, 7, 0.1)",
  track: "rgba(7, 9, 7, 0.07)",
} as const;

const ease = [0.22, 1, 0.36, 1] as const;

type CellTone = "white" | "beige" | "lime";

const toneBg: Record<CellTone, string> = {
  white: A.white,
  beige: A.beige,
  lime: A.lime,
};

export function BentoGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12 lg:gap-3">{children}</div>
  );
}

export function BentoCell({
  children,
  className = "",
  span = 1,
  tone = "white",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 12;
  tone?: CellTone;
  delay?: number;
}) {
  const spanClass =
    span === 12
      ? "lg:col-span-12"
      : span === 8
        ? "lg:col-span-8"
        : span === 7
          ? "lg:col-span-7"
          : span === 6
            ? "lg:col-span-6"
            : span === 5
              ? "lg:col-span-5"
              : span === 4
                ? "lg:col-span-4"
                : span === 3
                  ? "lg:col-span-3"
                  : span === 2
                    ? "lg:col-span-2"
                    : "lg:col-span-1";

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className={`relative overflow-hidden rounded-[1.25rem] border p-5 sm:p-6 ${spanClass} ${className}`}
      style={{
        borderColor: A.border,
        backgroundColor: toneBg[tone],
      }}
    >
      {children}
    </motion.article>
  );
}

export function CellLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: A.muted }}
    >
      {children}
    </p>
  );
}

export function Tip({
  label,
  value,
  hint,
  large,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  large?: boolean;
}) {
  return (
    <div title={hint}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: A.muted }}>
        {label}
      </p>
      <p
        className={`mt-1.5 font-bold tabular-nums leading-none ${large ? "text-[2rem] sm:text-[2.25rem]" : "text-[1.65rem] sm:text-[1.85rem]"}`}
        style={{ color: A.black, ...wsSans }}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-snug" style={{ color: A.muted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Вертикальные pill-столбцы — как Compliance Checks в референсе. */
export function StarPillChart({
  stars,
  starsPct,
  total,
  compact = false,
}: {
  stars: Record<StarKey, number>;
  starsPct: Record<StarKey, number>;
  total: number;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<StarKey | null>(null);
  const order: StarKey[] = ["5", "4", "3", "2", "1"];
  const max = Math.max(1, ...order.map((s) => stars[s]));
  const pillHeight = compact ? 56 : 88;

  return (
    <div>
      <div className={`flex items-end ${compact ? "gap-1.5" : "gap-2 sm:gap-2.5"}`}>
        {order.map((star, i) => {
          const pct = starsPct[star];
          const h = Math.max(8, (stars[star] / max) * 100);
          const active = hover === star;
          return (
            <div
              key={star}
              className="flex min-w-0 flex-1 flex-col items-center"
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
            >
              <AnimatePresence>
                {active ? (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mb-1 font-bold tabular-nums ${compact ? "text-[10px]" : "text-[12px]"}`}
                    style={{ color: A.black }}
                  >
                    {stars[star]} · {pct}%
                  </motion.span>
                ) : (
                  <span className={compact ? "mb-1 h-[14px]" : "mb-1.5 h-[18px]"} />
                )}
              </AnimatePresence>
              <div className="relative w-full" style={{ height: pillHeight }}>
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full"
                  style={{
                    height: `${h}%`,
                    backgroundColor: active ? A.lime : star === "5" || star === "4" ? A.black : A.track,
                    opacity: active ? 1 : star === "1" || star === "2" ? 0.55 : 1,
                  }}
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 rounded-full"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease }}
                  style={{
                    backgroundColor: active ? A.lime : "transparent",
                  }}
                />
              </div>
              <span
                className={`font-bold ${compact ? "mt-1.5 text-[11px]" : "mt-2 text-[13px]"}`}
                style={{ color: active ? A.black : A.muted }}
              >
                {star}★
              </span>
            </div>
          );
        })}
      </div>
      {!compact && total > 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: A.muted }}>
          Доля каждой оценки от {total} отзыв{total === 1 ? "а" : "ов"} — наведите на столбец
        </p>
      ) : null}
    </div>
  );
}

/** Компактный hero: белые inset-карточки на бежевом фоне. */
export function SummaryHero({
  rating,
  total,
  delta,
  dominantStar,
  stars,
  starsPct,
}: {
  rating: number;
  total: number;
  delta: number | null;
  dominantStar: StarKey | null;
  stars: Record<StarKey, number>;
  starsPct: Record<StarKey, number>;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,220px)]">
      <div className="rounded-2xl border bg-white p-4 sm:p-5" style={{ borderColor: A.border }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: A.muted }}>
              Средняя оценка
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p
                className="text-[2.5rem] font-bold tabular-nums leading-none tracking-tight sm:text-[2.85rem]"
                style={{ color: A.black, ...wsSans }}
              >
                <NumberFlow value={rating} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />
              </p>
              <span className="text-[13px] font-semibold" style={{ color: A.muted }}>
                из 5
              </span>
            </div>
          </div>
          {typeof delta === "number" ? (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
              style={{
                backgroundColor: delta >= 0 ? A.lime : A.track,
                color: A.black,
              }}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{ backgroundColor: A.canvas, color: A.black }}
          >
            <NumberFlow value={total} /> отзыв{total === 1 ? "" : "ов"}
          </span>
          {dominantStar ? (
            <span
              className="rounded-full px-3 py-1 text-[12px] font-semibold"
              style={{ backgroundColor: "rgba(185,255,75,0.28)", color: A.black }}
            >
              чаще {dominantStar}★ · {starsPct[dominantStar]}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: A.border }}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: A.muted }}>
          По звёздам
        </p>
        <StarPillChart stars={stars} starsPct={starsPct} total={total} compact />
      </div>
    </div>
  );
}

/** KPI-ряд — три крупных метрики в одной карточке. */
export function StatRow({
  items,
  horizontal = false,
}: {
  items: { label: string; value: ReactNode; hint?: string; accent?: boolean }[];
  horizontal?: boolean;
}) {
  return (
    <div className={horizontal ? "grid gap-3 sm:grid-cols-3" : "flex flex-col gap-4"}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border px-4 py-4"
          style={{
            borderColor: A.border,
            backgroundColor: item.accent ? "rgba(185,255,75,0.18)" : A.white,
          }}
        >
          <Tip label={item.label} value={item.value} hint={item.hint} large />
        </div>
      ))}
    </div>
  );
}

export function AnalyticsSourceToggle({
  value,
  onChange,
  manualCount,
}: {
  value: AnalyticsDataSource;
  onChange: (next: AnalyticsDataSource) => void;
  manualCount: number;
}) {
  return (
    <div
      className="inline-flex rounded-xl border p-1"
      style={{ borderColor: A.border, backgroundColor: A.white }}
    >
      {(
        [
          { id: "cabinet" as const, label: "Кабинет" },
          { id: "text" as const, label: `Текст${manualCount > 0 ? ` · ${manualCount}` : ""}` },
        ] as const
      ).map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] transition"
            style={{
              ...wsSans,
              color: active ? A.black : A.muted,
              backgroundColor: active ? A.lime : "transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TrendChart({
  points,
}: {
  points: { label: string; count: number; avgRating: number }[];
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipLeftPx, setTooltipLeftPx] = useState(0);
  const w = 400;
  const h = 120;
  const pad = 16;
  const max = Math.max(1, ...points.map((p) => p.count));

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        ...p,
        x: pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2),
        y: h - pad - (p.count / max) * (h - pad * 2),
      })),
    [points, max]
  );

  const hitRadius =
    coords.length > 1 ? Math.min(52, ((w - pad * 2) / (coords.length - 1)) * 0.72) : 52;

  const pickNearest = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || coords.length === 0) return;

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;

    const svgX = ((clientX - rect.left) / rect.width) * w;
    let nearest = 0;
    let minDist = Infinity;

    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - svgX);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });

    setIdx(minDist <= hitRadius ? nearest : null);
  };

  const linePath =
    coords.length > 1 ? coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ") : "";
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`
      : "";
  const active = idx !== null ? coords[idx] : null;

  useLayoutEffect(() => {
    if (idx === null || !active) return;

    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;

    const containerWidth = container.clientWidth;
    const tooltipWidth = tooltip.offsetWidth;
    if (containerWidth <= 0 || tooltipWidth <= 0) return;

    const pointX = (active.x / w) * containerWidth;
    const idealLeft = pointX - tooltipWidth / 2;
    setTooltipLeftPx(Math.max(0, Math.min(idealLeft, containerWidth - tooltipWidth)));
  }, [idx, active, w]);

  return (
    <div ref={containerRef} className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="h-[120px] w-full touch-none"
        role="img"
        aria-label="График динамики отзывов"
        onPointerMove={(e) => pickNearest(e.clientX)}
        onPointerDown={(e) => pickNearest(e.clientX)}
        onPointerLeave={() => setIdx(null)}
      >
        <g pointerEvents="none">
          <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke={A.border} strokeWidth="1" />
          {areaPath ? (
            <motion.path
              d={areaPath}
              fill="rgba(185,255,75,0.22)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease }}
            />
          ) : null}
          {linePath ? (
            <motion.path
              d={linePath}
              fill="none"
              stroke={A.black}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease }}
            />
          ) : null}
          {active ? (
            <line
              x1={active.x}
              x2={active.x}
              y1={pad}
              y2={h - pad}
              stroke="rgba(7, 9, 7, 0.12)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ) : null}
        </g>

        {coords.map((c, i) => {
          const isActive = idx === i;
          return (
            <g key={i} pointerEvents="none">
              <circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 10 : 7}
                fill={isActive ? "rgba(185,255,75,0.35)" : "transparent"}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 6 : 4.5}
                fill={isActive ? A.lime : A.black}
                stroke={A.white}
                strokeWidth="2"
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[11px] font-semibold" style={{ color: A.muted }}>
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>

      <AnimatePresence>
        {active ? (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute top-0 z-10 rounded-xl border px-3 py-2 shadow-[0_8px_24px_-12px_rgba(7,9,7,0.25)]"
            style={{
              left: tooltipLeftPx,
              borderColor: A.border,
              backgroundColor: A.white,
              ...wsSans,
            }}
          >
            <p className="whitespace-nowrap text-[12px]" style={{ color: A.muted }}>
              {active.label}
            </p>
            <p className="whitespace-nowrap text-[15px] font-bold tabular-nums" style={{ color: A.black }}>
              {active.count} отзыв · {active.avgRating.toFixed(1)}★
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Полный donut 360° с крупной легендой и процентами. */
export function FullDonut({
  segments,
}: {
  segments: { label: string; value: number; fill: string; hint: string; pct: number }[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const size = 212;
  const stroke = 32;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const arcs = segments.map((seg) => {
    const dash = (seg.value / total) * c;
    const arc = { ...seg, dash, gap: c - dash, offset, id: seg.label };
    offset += dash;
    return arc;
  });

  const active = arcs.find((a) => a.label === hover);

  return (
    <div className="flex w-full items-center gap-4 lg:gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={A.track} strokeWidth={stroke} />
          {arcs.map((arc, i) =>
            arc.dash > 0 ? (
              <motion.circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={arc.fill}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={-arc.offset}
                initial={{ strokeDasharray: `0 ${c}` }}
                animate={{
                  strokeDasharray: `${arc.dash} ${arc.gap}`,
                  opacity: hover && hover !== arc.label ? 0.25 : 1,
                }}
                transition={{ duration: 0.65, delay: i * 0.05, ease }}
                onMouseEnter={() => setHover(arc.label)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
            ) : null
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[2.75rem] font-bold tabular-nums leading-none" style={{ color: A.black, ...wsSans }}>
            {active ? active.value : total}
          </p>
          <p className="mt-1 max-w-[110px] text-[11px] font-bold uppercase tracking-wide" style={{ color: A.muted }}>
            {active ? active.label : "всего"}
          </p>
          {active ? (
            <p className="mt-0.5 text-[14px] font-bold tabular-nums" style={{ color: A.black }}>
              {active.pct}%
            </p>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="rounded-xl border px-3 py-2 transition-colors"
            style={{
              borderColor: hover === seg.label ? A.lime : A.border,
              backgroundColor: hover === seg.label ? "rgba(185,255,75,0.14)" : A.white,
            }}
            onMouseEnter={() => setHover(seg.label)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold" style={{ color: A.black }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.fill }} />
                {seg.label}
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums">
                {seg.value}{" "}
                <span className="text-[11px] font-semibold" style={{ color: A.muted }}>
                  ({seg.pct}%)
                </span>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-tight" style={{ color: A.muted }}>
              {seg.hint}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TextRatio({ withText, withoutText }: { withText: number; withoutText: number }) {
  const total = withText + withoutText || 1;
  const withPct = Math.round((withText / total) * 100);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <Tip label="С текстом" value={`${withPct}%`} hint={`${withText} отзывов с текстом`} large />
        <Tip label="Только оценка" value={`${100 - withPct}%`} hint={`${withoutText} без текста`} large />
      </div>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full" style={{ backgroundColor: A.track }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: A.lime }}
          initial={{ width: 0 }}
          animate={{ width: `${withPct}%` }}
          transition={{ duration: 0.6, ease }}
        />
        <div className="h-full flex-1 rounded-full" style={{ backgroundColor: A.black, opacity: 0.2 }} />
      </div>
    </div>
  );
}

/** Горизонтальные pill-индикаторы для типов ответов. */
export function ReplyPills({
  auto,
  manual,
  pending,
  sent,
}: {
  auto: number;
  manual: number;
  pending: number;
  sent: number;
}) {
  const items = [
    { label: "Авто", value: auto, hint: "Отправлено без подтверждения", color: A.lime },
    { label: "Вручную", value: manual, hint: "Подтверждение или ручная отправка", color: A.black },
    { label: "Ждут ответа", value: pending, hint: "Ещё без ответа на площадке", color: A.muted },
  ];
  const max = Math.max(1, sent, pending);

  return (
    <div className="space-y-4">
      {items.map((row, i) => (
        <div key={row.label}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold" style={{ color: A.black }}>
              {row.label}
            </span>
            <span className="text-[1.5rem] font-bold tabular-nums leading-none" style={{ ...wsSans, color: A.black }}>
              {row.value}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: A.track }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: row.color,
              }}
              transition={{ duration: 0.5, delay: i * 0.06, ease }}
            />
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: A.muted }}>
            {row.hint}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ProductLines({
  items,
}: {
  items: { name: string; count: number; avgRating: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="space-y-4">
      {items.map((row, i) => (
        <motion.div
          key={row.name}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <div className="mb-2 flex justify-between gap-3">
            <p className="min-w-0 truncate text-[14px] font-bold" style={{ ...wsSans, color: A.black }}>
              {row.name}
            </p>
            <span className="shrink-0 text-[14px] font-bold tabular-nums">{row.avgRating.toFixed(1)}★</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: A.track }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(row.count / max) * 100}%`,
                backgroundColor: i === 0 ? A.lime : A.black,
              }}
              transition={{ duration: 0.5, delay: 0.08 + i * 0.04, ease }}
            />
          </div>
          <p className="mt-1 text-[12px] tabular-nums" style={{ color: A.muted }}>
            {row.count} отзыв{row.count === 1 ? "" : "ов"}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

// Legacy exports for compatibility
export const StarDistribution = StarPillChart;
export const RatingHero = SummaryHero;
export const SparkLine = TrendChart;
export const DonutSplit = FullDonut;
export const ReplyMix = ReplyPills;
