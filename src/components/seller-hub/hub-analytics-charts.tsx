"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { chartColors, dayLabel, dayLong } from "./hub-analytics-ui";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Единый набор диаграмм «Аналитики». Правила одни на всех: тонкие столбики с закруглённым верхом, линии 2px, тонкая сетка,
 * подсказка со всеми рядами в точке, лайм только для выделенного (лучший день, скользящее среднее). Подписи и числа тёмным текстом,
 * цвет несёт только метка рядом.
 */

const monoNum = { fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

const AXIS_TICK = { fontSize: 13, fill: "#4F5A4E", fontFamily: "var(--font-inter), system-ui, sans-serif" } as const;

// Неразрывный пробел: подпись оси не должна переноситься на вторую строку.
const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн` : Math.abs(n) >= 10_000 ? `${Math.round(n / 1000).toLocaleString("ru-RU")} тыс` : Math.round(n).toLocaleString("ru-RU"));

/** Оболочка всплывающей подсказки: белая, с мягкой тенью, значения впереди, названия вторым планом. */
export function ChartTip({ title, sub, rows, foot }: { title: ReactNode; sub?: ReactNode; rows: Array<{ label: string; value: string; color?: string; dashed?: boolean }>; foot?: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-[184px] max-w-[280px] rounded-[14px] border bg-white px-4 py-3.5 shadow-[0_18px_40px_-16px_rgba(1,20,8,0.35),0_2px_6px_-2px_rgba(1,20,8,0.08)]" style={{ borderColor: hub.border, ...hubSans }}>
      <p className="text-[13px] font-semibold leading-[1.35]" style={{ color: hub.text }}>
        {title}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[12px] leading-[1.4]" style={{ color: hub.textSubtle }}>
          {sub}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-5 text-[12.5px]">
              <span className="flex items-center gap-2" style={{ color: hub.textMuted }}>
                {r.color ? <span className="h-0 w-3.5 shrink-0 border-t-2" style={{ borderColor: r.color, borderStyle: r.dashed ? "dashed" : "solid" }} /> : null}
                {r.label}
              </span>
              <span className="text-[14px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {foot ? (
        <p className="mt-2.5 border-t pt-2 text-[12px] leading-[1.45]" style={{ borderColor: hub.borderSoft, color: hub.textMuted }}>
          {foot}
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Динамика по дням ───────────────────────── */

/** Одна точка графика по дням. values — по одному числу на ряд: первый ряд рисуется площадью, остальные тонкими линиями. */
export type DayPoint = { date: string; values: number[]; partial?: boolean; note?: string };
export type DaySeries = { label: string; color: string; fmt: (n: number) => string };

type Row = { date: string; partial: boolean; note?: string; best: boolean; avg: number | null; [key: string]: unknown };

/** Красивая ось: 4–5 круглых делений от нуля до «круглого» максимума. */
export function niceTicks(max: number, count = 4): number[] {
  const safe = max > 0 && Number.isFinite(max) ? max : 1;
  const raw = safe / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(safe / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function DayTooltip({ active, payload, series, avgLabel, avgFmt }: Partial<TooltipContentProps<ValueType, NameType>> & { series: DaySeries[]; avgLabel?: string; avgFmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as Row;
  const rows = series.map((s, i) => ({ label: s.label, value: s.fmt(Number(row[`raw${i}`] ?? 0)), color: s.color }));
  if (avgLabel && row.avg != null) rows.push({ label: avgLabel, value: avgFmt(row.avg), color: chartColors.limeEdge });
  return <ChartTip title={dayLong(row.date)} sub={row.partial ? "день не закончен" : row.best ? "лучший день периода" : undefined} rows={rows} foot={row.note} />;
}

/**
 * График по дням в стиле лучших аналитических сервисов. Дневные значения — мягкие закруглённые столбики (лучший день лаймовый,
 * неоконченный — пунктирный контур), поверх них плавная линия тренда со скользящим средним за 7 дней и градиентной подложкой.
 * Горизонтальная сетка без осей, подсказка со всеми значениями дня, точка на конце тренда. Второй ряд (отменённые) ложится сверху столбика.
 * Если дней меньше семи, линия тренда не рисуется: среднего ещё нет.
 */
export function DayChart({ points, series, height = 260, highlightBest = true, bestDate, yFormat, legend = true, withAverage = true }: { points: DayPoint[]; series: DaySeries[]; height?: number; highlightBest?: boolean; /** Какой день выделить лаймом; по умолчанию день с наибольшим значением первого ряда. */ bestDate?: string; yFormat?: (n: number) => string; legend?: boolean; withAverage?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const { rows, bestRow, lastAvg, ticks, showAvg } = useMemo(() => {
    let bestIdx = -1;
    points.forEach((p, i) => {
      const v = p.values[0] ?? 0;
      if (bestDate ? p.date === bestDate : !p.partial && v > 0 && (bestIdx < 0 || v > (points[bestIdx]!.values[0] ?? 0))) bestIdx = i;
    });
    const complete = points.filter((p) => !p.partial).length;
    const avgOn = withAverage && complete >= 7;
    const out = points.map((p, i) => {
      let avg: number | null = null;
      if (avgOn && !p.partial) {
        // Окно до 7 законченных дней; в начале периода окно короче (не меньше трёх дней), чтобы линия начиналась с первого дня плавно.
        const win = points.slice(Math.max(0, i - 6), i + 1).filter((w) => !w.partial);
        if (win.length >= 3) avg = win.reduce((s, w) => s + (w.values[0] ?? 0), 0) / win.length;
      }
      const row: Row = { date: p.date, partial: Boolean(p.partial), note: p.note, best: highlightBest && i === bestIdx, avg };
      p.values.forEach((v, k) => {
        row[`raw${k}`] = v;
        row[`v${k}`] = v;
      });
      return row;
    });
    const stackMax = Math.max(1, ...points.map((p) => p.values.reduce((a, b) => a + b, 0)));
    const lastAvgRow = [...out].reverse().find((r) => r.avg != null) ?? null;
    return { rows: out, bestRow: out.find((r) => r.best) ?? null, lastAvg: lastAvgRow, ticks: niceTicks(stackMax, 4), showAvg: avgOn };
  }, [points, highlightBest, bestDate, withAverage]);

  if (rows.length === 0) return null;
  const fmtAxis = yFormat ?? compact;
  const tickEvery = Math.max(0, Math.ceil(rows.length / 8) - 1);
  const first = series[0]!;
  const hasPartial = rows.some((r) => r.partial);
  const barFill = (partial: boolean, best: boolean) => (best ? chartColors.lime : partial ? "transparent" : first.color);
  const barOpacity = (best: boolean) => (best ? 1 : 0.2);

  return (
    <div>
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 14, right: 14, bottom: 0, left: 0 }} barCategoryGap="26%" accessibilityLayer>
            <defs>
              <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={first.color} stopOpacity={0.2} />
                <stop offset="80%" stopColor={first.color} stopOpacity={0.03} />
                <stop offset="100%" stopColor={first.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chartColors.grid} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} interval={tickEvery} tick={AXIS_TICK} tickMargin={12} minTickGap={22} />
            <YAxis tickLine={false} axisLine={false} width={62} tickFormatter={fmtAxis} tick={AXIS_TICK} ticks={ticks} domain={[0, ticks[ticks.length - 1]!]} tickMargin={6} />
            <Tooltip cursor={{ fill: "rgba(1, 20, 8, 0.045)", radius: 8 }} content={(props) => <DayTooltip {...props} series={series} avgLabel={showAvg ? "Тренд (среднее за 7 дней)" : undefined} avgFmt={first.fmt} />} isAnimationActive={false} />
            {series.map((s, i) => (
              <Bar key={s.label} dataKey={`v${i}`} stackId="day" radius={i === series.length - 1 ? [7, 7, 2, 2] : 0} maxBarSize={30} isAnimationActive={false}>
                {rows.map((r) =>
                  i === 0 ? (
                    <Cell key={r.date} fill={barFill(r.partial, r.best)} fillOpacity={barOpacity(r.best)} stroke={r.best ? first.color : r.partial ? first.color : undefined} strokeWidth={r.best ? 1.5 : r.partial ? 1.5 : 0} strokeDasharray={r.partial ? "3 3" : undefined} />
                  ) : (
                    <Cell key={r.date} fill={s.color} fillOpacity={0.55} />
                  ),
                )}
              </Bar>
            ))}
            {showAvg ? <Area dataKey="avg" type="monotone" stroke={first.color} strokeWidth={3} strokeLinecap="round" fill={`url(#area-${uid})`} dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 3, fill: first.color }} isAnimationActive={false} connectNulls /> : null}
            {showAvg && lastAvg ? <ReferenceDot x={lastAvg.date} y={Number(lastAvg.avg)} r={6} fill={first.color} stroke="#fff" strokeWidth={3} ifOverflow="visible" /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {legend ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          {series.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: s.color, opacity: i === 0 ? 0.28 : 0.6 }} />
              {s.label}
            </span>
          ))}
          {showAvg ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-0 w-4 border-t-[3px] border-solid" style={{ borderColor: first.color }} />
              тренд: среднее за 7 дней
            </span>
          ) : null}
          {bestRow ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[4px] border" style={{ backgroundColor: chartColors.lime, borderColor: first.color }} />
              лучший день
            </span>
          ) : null}
          {hasPartial ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[4px] border border-dashed" style={{ borderColor: first.color }} />
              день не закончен
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Кривая вклада (Парето) ───────────────────────── */

export type ParetoItem = { id: string; title: string; value: number; abc: "A" | "B" | "C" | "none" };

/** Накопленная доля оборота по товарам от самого сильного к слабому: видно, сколько товаров держат 80% и 95% суммы заказов. Одна ось. */
export function ParetoChart({ items, height = 260 }: { items: ParetoItem[]; height?: number }) {
  const data = useMemo(() => {
    const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, i) => s + i.value, 0);
    return sorted.map((i, idx) => {
      const run = sorted.slice(0, idx + 1).reduce((acc, x) => acc + x.value, 0);
      return { ...i, rank: idx + 1, cum: total > 0 ? (run / total) * 100 : 0, share: total > 0 ? (i.value / total) * 100 : 0 };
    });
  }, [items]);
  if (data.length === 0) return null;
  const nA = data.filter((d) => d.abc === "A").length;
  const nAB = data.filter((d) => d.abc === "A" || d.abc === "B").length;
  return (
    <div style={{ height }} className="-ml-1.5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pareto-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.blue} stopOpacity={0.32} />
              <stop offset="100%" stopColor={chartColors.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="rank" type="number" domain={[1, data.length]} tickLine={false} axisLine={{ stroke: chartColors.grid }} tick={AXIS_TICK} tickMargin={10} allowDecimals={false} tickFormatter={(v) => `${v}`} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 80, 95, 100]} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} />
          {nA > 0 ? <ReferenceArea x1={1} x2={nA} fill={chartColors.blue} fillOpacity={0.1} label={{ value: `A · ${nA}`, position: "insideBottomLeft", fontSize: 12, fontWeight: 600, fill: "#3E4C3F" }} /> : null}
          {nAB > nA ? <ReferenceArea x1={nA} x2={nAB} fill={chartColors.amber} fillOpacity={0.09} label={{ value: `B · ${nAB - nA}`, position: "insideBottomLeft", fontSize: 12, fontWeight: 600, fill: "#3E4C3F" }} /> : null}
          {data.length > nAB ? <ReferenceArea x1={nAB} x2={data.length} fill={chartColors.inkSoft} fillOpacity={0.08} label={{ value: `C · ${data.length - nAB}`, position: "insideBottomLeft", fontSize: 12, fontWeight: 600, fill: "#636C61" }} /> : null}
          <ReferenceLine y={80} stroke={chartColors.limeEdge} strokeOpacity={0.9} />
          <Tooltip
            cursor={{ stroke: chartColors.ink, strokeOpacity: 0.35, strokeWidth: 1 }}
            isAnimationActive={false}
            content={(p: Partial<TooltipContentProps<ValueType, NameType>>) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0]!.payload as (typeof data)[number];
              return (
                <ChartTip
                  title={d.title}
                  sub={`${d.rank}-й по сумме заказов${d.abc !== "none" ? `, класс ${d.abc}` : ""}`}
                  rows={[
                    { label: "Сумма заказов", value: formatRub(d.value) },
                    { label: "Доля магазина", value: `${d.share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` },
                    { label: "Накоплено", value: `${d.cum.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}%`, color: chartColors.blue },
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="cum" stroke={chartColors.blue} strokeWidth={2.75} fill="url(#pareto-fill)" dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 3, fill: chartColors.blue }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Матрица: оборот и маржа ───────────────────────── */

export type MatrixPoint = { id: string; title: string; x: number; y: number; z: number; abc: "A" | "B" | "C" | "none" };

/** Каждый товар точкой: слева направо сумма заказов, снизу вверх маржа. Ниже красной линии убыток. Размер точки — число заказов. */
export function MatrixChart({ points, height = 300, plain = false }: { points: MatrixPoint[]; height?: number; /** Все точки одного тёмного цвета, без деления по классам ABC. */ plain?: boolean }) {
  if (points.length === 0) return null;
  const minY = Math.min(0, ...points.map((p) => p.y));
  // Подписываем самые крупные по сумме и убыточные товары: остальные видны по наведению.
  const order = Array.from(new Set([...points.map((p, i) => ({ p, i }))].sort((a, b) => b.p.x - a.p.x).slice(0, 4).map((o) => o.i).concat(points.flatMap((p, i) => (p.y < 0 ? [i] : [])).slice(0, 3))));
  return (
    <div>
    <div style={{ height }} className="-ml-1.5">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 18, bottom: 6, left: 0 }}>
          <CartesianGrid stroke={chartColors.grid} />
          <XAxis type="number" dataKey="x" name="Сумма заказов" tickFormatter={compact} tickLine={false} axisLine={{ stroke: chartColors.grid }} tick={AXIS_TICK} tickMargin={10} />
          <YAxis type="number" dataKey="y" name="Маржа" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} width={48} tick={AXIS_TICK} domain={[Math.floor(minY / 10) * 10, "auto"]} />
          <ZAxis type="number" dataKey="z" range={[140, 760]} />
          <ReferenceLine y={0} stroke={chartColors.danger} strokeOpacity={0.7} />
          <Tooltip
            cursor={{ strokeDasharray: "3 4", stroke: chartColors.ink, strokeOpacity: 0.3 }}
            isAnimationActive={false}
            content={(p: Partial<TooltipContentProps<ValueType, NameType>>) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0]!.payload as MatrixPoint;
              return (
                <ChartTip
                  title={d.title}
                  sub={d.abc !== "none" ? `класс ${d.abc}` : undefined}
                  rows={[
                    { label: "Сумма заказов", value: formatRub(d.x) },
                    { label: "Маржа", value: `${d.y.toLocaleString("ru-RU")}%` },
                    { label: "Заказов", value: formatInt(d.z) },
                  ]}
                />
              );
            }}
          />
          <Scatter data={points} isAnimationActive={false} label={(raw: { x?: number | string; y?: number | string; index?: number }) => { const l = { x: Number(raw.x), y: Number(raw.y), index: raw.index }; const n = l.index != null ? order.indexOf(l.index) : -1; return n >= 0 && Number.isFinite(l.x) ? <text key={l.index} x={l.x} y={l.y - 14} textAnchor="middle" fontSize={14} fontWeight={700} fill="#1D3425" stroke="#fff" strokeWidth={3} paintOrder="stroke">{n + 1}</text> : <g key={l.index} />; }}>
            {points.map((p) => (
              <Cell key={p.id} fill={p.y < 0 ? chartColors.danger : plain || p.abc === "A" ? chartColors.blue : p.abc === "B" ? chartColors.amber : "#B3BBAF"} fillOpacity={0.88} stroke="#fff" strokeWidth={2} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
      <ol className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {order.map((i, n) => (
          <li key={points[i]!.id} className="flex items-baseline gap-2.5 text-[14.5px]" style={{ ...hubSans, color: hub.text }}>
            <span className="w-5 shrink-0 font-bold">{n + 1}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{points[i]!.title}</span>
            <span className="ml-auto shrink-0" style={{ ...monoNum, color: points[i]!.y < 0 ? "#C42B2B" : hub.textMuted }}>{formatRub(points[i]!.x)} · {points[i]!.y.toLocaleString("ru-RU")}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────────────────────── Каскад: куда уходит выручка ───────────────────────── */

export type WaterfallStep = { id: string; label: string; note?: string; value: number; kind: "total" | "minus" | "result"; hint?: string; /** Изменение к прошлому периоду под долей справа. */ extra?: ReactNode };

/** Горизонтальный каскад: выручка сверху, каждая статья расходов откусывает часть, внизу остаток. Каждая строка показывает долю от выручки. */
export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const base = Math.max(steps[0]?.value ?? 1, 1);
  // Остаток выручки перед каждой статьёй: сумма предыдущих «минусов» вычитается из базы.
  const laid = steps.map((s, idx) => {
    const spentBefore = steps.slice(0, idx).reduce((acc, x) => acc + (x.kind === "minus" ? Math.max(x.value, 0) : 0), 0);
    const remainBefore = base - spentBefore;
    const from = s.kind === "minus" ? remainBefore - Math.max(s.value, 0) : 0;
    const to = s.kind === "minus" ? remainBefore : Math.max(s.value, 0);
    return { ...s, left: Math.max(0, (from / base) * 100), width: Math.max(s.value > 0 ? 0.6 : 0, ((to - from) / base) * 100) };
  });
  return (
    <ul className="group/wf space-y-0.5">
      {laid.map((s) => {
        const fill = s.kind === "result" ? chartColors.lime : s.kind === "total" ? chartColors.ink : "#B3BBAF";
        return (
          <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1.5 rounded-lg py-2 transition-opacity duration-150 group-hover/wf:opacity-45 hover:!opacity-100 sm:grid-cols-[210px_minmax(0,1fr)_170px]" title={s.hint}>
            <span className="min-w-0 text-[13.5px] leading-[1.3]" style={{ ...hubSans, color: hub.text, fontWeight: s.kind === "minus" ? 500 : 600 }}>
              {s.label}
              {s.note ? (
                <span className="block text-[12px] font-normal" style={{ color: hub.textSubtle }}>
                  {s.note}
                </span>
              ) : null}
            </span>
            <span className="text-right sm:order-3" style={{ ...hubSans, ...hubNumeric }}>
              <span className="block text-[15px] font-semibold leading-tight" style={{ color: hub.text }}>
                {s.kind === "minus" ? "−" : ""}
                {formatRub(Math.abs(s.value))}
              </span>
              <span className="block text-[12px]" style={{ color: hub.textSubtle }}>
                {((s.value / base) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% выручки
              </span>
              {s.extra ? <span className="mt-1 block">{s.extra}</span> : null}
            </span>
            <div className="relative col-span-2 h-[22px] rounded-[6px] sm:order-2 sm:col-span-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
              <div className="absolute inset-y-0 rounded-[6px]" style={{ left: `${s.left}%`, width: `${s.width}%`, backgroundColor: fill, boxShadow: s.kind === "result" ? `inset 0 0 0 1px ${chartColors.limeEdge}` : undefined }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── Составная полоса долей ───────────────────────── */

export type StackPart = { id: string; label: string; value: number; color: string; hint?: string };

/** Одна полоса долей: сегменты разделены зазором 2px, при наведении остальные приглушаются. Подписи в легенде ниже. */
export function StackBar({ parts, height = 14, showLegend = true, valueFmt = formatInt }: { parts: StackPart[]; height?: number; showLegend?: boolean; valueFmt?: (n: number) => string }) {
  const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0);
  if (total <= 0) return null;
  return (
    <div className="group/stack">
      <div className="flex gap-[2px] overflow-hidden rounded-full" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label}: ${valueFmt(p.value)}`).join(", ")}>
        {parts.map((p) =>
          p.value > 0 ? <div key={p.id} className="h-full transition-opacity duration-150 group-hover/stack:opacity-35 hover:!opacity-100" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${valueFmt(p.value)} (${((p.value / total) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%)${p.hint ? `. ${p.hint}` : ""}`} /> : null,
        )}
      </div>
      {showLegend ? (
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-[13px]" style={hubSans} title={p.hint}>
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} />
              <span style={{ color: hub.textMuted }}>{p.label}</span>
              <span className="font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                {valueFmt(p.value)}
              </span>
              <span style={{ ...hubNumeric, color: hub.textSubtle }}>{((p.value / total) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Расходящиеся столбики ───────────────────────── */

export type DivergingItem = { id: string; title: string; value: number; sub?: string };

/**
 * Список изменений: название (читаемо, переносится), справа цветная плашка со стрелкой и суммой, под ним тонкая полоса длиной
 * пропорционально величине. Рост зелёный, падение и потери красные. Ось не нужна: знак и цвет сказаны плашкой.
 */
export function DivergingBars({ items, format = formatRub }: { items: DivergingItem[]; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <ul className="group/dv space-y-2.5">
      {items.map((i) => {
        const up = i.value >= 0;
        const w = Math.max(6, (Math.abs(i.value) / max) * 100);
        const tone = up ? chartColors.green : chartColors.danger;
        return (
          <li
            key={i.id}
            className="relative overflow-hidden rounded-[16px] px-4 py-3 transition-opacity duration-150 group-hover/dv:opacity-60 hover:!opacity-100"
            style={{ backgroundColor: up ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)" }}
            title={`${i.title}: ${up ? "+" : "−"}${format(Math.abs(i.value))}${i.sub ? `. ${i.sub}` : ""}`}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-r-[16px]" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${tone}2B, ${tone}08)` }} />
            <div className="relative flex items-center justify-between gap-4" style={hubSans}>
              <span className="min-w-0 text-[15px] font-medium leading-[1.35] [overflow-wrap:anywhere]" style={{ color: hub.text }}>
                {i.title}
                {i.sub ? (
                  <span className="block text-[12.5px] font-normal leading-[1.4]" style={{ color: hub.textSubtle }}>
                    {i.sub}
                  </span>
                ) : null}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[18px] font-medium" style={{ ...monoNum, color: up ? "#0B8A5F" : "#C42B2B" }}>
                <svg width="11" height="11" viewBox="0 0 9 9" aria-hidden style={{ transform: up ? undefined : "rotate(180deg)" }}>
                  <path d="M4.5 1.5 8 6.5H1z" fill="currentColor" />
                </svg>
                {format(Math.abs(i.value))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── Рейтинг товаров ───────────────────────── */

export type RankedItem = { id: string; title: string; value: number; share: number; abc: "A" | "B" | "C" | "none" };

/** Рейтинг: номер, название, сумма и доля, полоса цвета класса товара. Класс A синий, B оранжевый, C серый. */
export function RankedBars({ items, format = formatRub }: { items: RankedItem[]; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const shade = { A: chartColors.blue, B: chartColors.amber, C: chartColors.inkSoft, none: chartColors.inkSoft } as const;
  return (
    <ol className="group/rk space-y-3.5">
      {items.map((i, idx) => (
        <li key={i.id} className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3 transition-opacity duration-150 group-hover/rk:opacity-50 hover:!opacity-100">
          <span className="mt-[1px] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: shade[i.abc], backgroundColor: `${shade[i.abc]}1F` }}>
            {idx + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4" style={hubSans}>
              <span className="min-w-0 text-[15px] font-medium leading-[1.35] [overflow-wrap:anywhere]" style={{ color: hub.text }}>
                {i.title}
              </span>
              <span className="shrink-0 text-right" style={monoNum}>
                <span className="text-[16px] font-medium" style={{ color: hub.text }}>
                  {format(i.value)}
                </span>
                <span className="ml-2 text-[13px]" style={{ color: hub.textSubtle }}>
                  {(i.share * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
                </span>
              </span>
            </div>
            <div className="mt-2 h-[8px] overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: `linear-gradient(90deg, ${shade[i.abc]}, ${shade[i.abc]}B3)` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Кольцо-мера ───────────────────────── */

/** Одна доля от целого (выкуп, доля рекламных заказов): кольцо с числом по центру. Не круговая диаграмма: один показатель против остатка. */
export function RingMeter({ value, label, sub, size = 132, color = chartColors.ink, stacked = false }: { value: number | null; label: string; sub?: string; size?: number; color?: string; /** Подпись под кольцом, по центру. */ stacked?: boolean }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <div className={stacked ? "flex flex-col items-center gap-4 text-center" : "flex items-center gap-5"}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value == null ? "нет данных" : `${(v * 100).toFixed(1)}%`}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(1,20,8,0.07)" strokeWidth={10} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="transition-[stroke-dasharray] duration-700 ease-out" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[36px] font-medium" style={{ ...hubSans, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.05em", color: hub.text }}>
          {value == null ? "—" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[22px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
          {label}
        </p>
        {sub ? (
          <p className="mt-1.5 text-[16.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────── Мини-график ───────────────────────── */

/** Мини-график ряда по дням: линия 2px. Только там, где есть настоящий ряд. */
export function Spark({ values, color = chartColors.ink, height = 36 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace("#", "")}`;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Кольцевая диаграмма ───────────────────────── */

export type DonutPart = { id: string; label: string; value: number; color: string; hint?: string; /** Малая пометка справа от доли, например изменение к прошлому периоду. */ extra?: ReactNode };

/**
 * Кольцо долей с числом в центре. Сегменты разделены зазором и закруглены, при наведении кольцо подсвечивает долю, а в центре
 * показывается её значение. Справа (или снизу) легенда со значениями: цвет несёт только метка, текст остаётся тёмным.
 */
export function DonutChart({ parts, centerValue, centerLabel, valueFmt = formatInt, size = 200, legendSide = "right" }: { parts: DonutPart[]; centerValue?: string; centerLabel?: string; valueFmt?: (n: number) => string; size?: number; legendSide?: "right" | "bottom" }) {
  const [hover, setHover] = useState<string | null>(null);
  const live = parts.filter((p) => p.value > 0);
  const total = live.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const active = hover ? live.find((p) => p.id === hover) : null;
  return (
    <div className={legendSide === "right" ? "flex flex-wrap items-center gap-x-10 gap-y-6" : "flex flex-col items-center gap-6"}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie data={live} dataKey="value" nameKey="label" innerRadius={size * 0.34} outerRadius={size * 0.48} paddingAngle={live.length > 1 ? 3 : 0} cornerRadius={7} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false} onMouseLeave={() => setHover(null)}>
            {live.map((p) => (
              <Cell key={p.id} fill={p.color} fillOpacity={hover && hover !== p.id ? 0.35 : 1} onMouseEnter={() => setHover(p.id)} style={{ transition: "fill-opacity 150ms ease-out", outline: "none" }} />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" style={hubSans}>
          <span className="text-[28px] font-semibold leading-none tracking-[-0.03em]" style={{ ...hubNumeric, color: hub.text }}>
            {active ? `${((active.value / total) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : (centerValue ?? valueFmt(total))}
          </span>
          <span className="mt-1.5 max-w-[110px] text-[12px] leading-[1.3]" style={{ color: hub.textSubtle }}>
            {active ? active.label : centerLabel}
          </span>
        </div>
      </div>
      <ul className="min-w-[200px] flex-1 space-y-1">
        {live.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-5 rounded-lg px-2 py-2.5 text-[15px] transition-colors duration-150"
            style={{ ...hubSans, backgroundColor: hover === p.id ? "rgba(1, 20, 8, 0.045)" : undefined }}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
            title={p.hint}
          >
            <span className="flex min-w-0 items-center gap-2.5" style={{ color: hub.text }}>
              <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: p.color, boxShadow: p.color === chartColors.lime ? `inset 0 0 0 1px ${chartColors.limeEdge}` : undefined }} />
              <span className="[overflow-wrap:anywhere]">{p.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-3" style={hubNumeric}>
              <span className="font-semibold" style={{ color: hub.text }}>
                {valueFmt(p.value)}
              </span>
              <span className="w-10 text-right" style={{ color: hub.textSubtle }}>
                {((p.value / total) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}%
              </span>
              {p.extra ? <span className="shrink-0">{p.extra}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Колонки с подписями ───────────────────────── */

export type ColumnItem = { id: string; label: string; value: number; highlight?: boolean; hint?: string };

/** Крупные колонки со значением над каждой: для коротких рядов (дни недели). Выделенная — лаймовая с тёмной рамкой. */
export function ColumnsChart({ items, fmt = formatInt, height = 230, unit, color = chartColors.teal }: { items: ColumnItem[]; fmt?: (n: number) => string; height?: number; unit?: string; /** Цвет столбиков. */ color?: string }) {
  const ticks = niceTicks(Math.max(...items.map((i) => i.value), 1), 4);
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} margin={{ top: 26, right: 10, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fontSize: 12.5 }} tickMargin={10} />
          <YAxis tickLine={false} axisLine={false} width={42} tick={AXIS_TICK} ticks={ticks} domain={[0, ticks[ticks.length - 1]!]} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: "rgba(1, 20, 8, 0.045)", radius: 8 }}
            isAnimationActive={false}
            content={(p: Partial<TooltipContentProps<ValueType, NameType>>) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0]!.payload as ColumnItem;
              return <ChartTip title={d.label} rows={[{ label: unit ?? "Значение", value: fmt(d.value), color: chartColors.teal }]} foot={d.hint} />;
            }}
          />
          <Bar dataKey="value" radius={[9, 9, 3, 3]} maxBarSize={62} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" offset={9} formatter={(v: unknown) => fmt(Number(v))} style={{ fontSize: 12.5, fontWeight: 600, fill: "#011408", fontFamily: "var(--font-inter), system-ui, sans-serif" }} />
            {items.map((i) => (
              <Cell key={i.id} fill={i.highlight ? chartColors.lime : color} stroke={i.highlight ? chartColors.ink : undefined} strokeWidth={i.highlight ? 2 : 0} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Вертикальный каскад ───────────────────────── */

export type CascadeStep = { id: string; label: string; value: number; kind: "total" | "minus" | "result"; hint?: string; /** Цвет столбика: у статьи расходов свой постоянный цвет. */ color?: string };

/** Подпись категории в две строки: длинные названия переносятся по словам. */
function WrapTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = String(payload?.value ?? "").split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 12) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return (
    <text x={x} y={(y ?? 0) + 14} textAnchor="middle" fill="#3E4C3F" fontSize={12.5} fontFamily="var(--font-inter), system-ui, sans-serif">
      {lines.slice(0, 3).map((l, i) => (
        <tspan key={l + i} x={x} dy={i === 0 ? 0 : 15}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Классический каскад: выручка, статьи расходов ступенями вниз, остаток. Над каждой колонкой сумма, в подсказке доля выручки. */
export function CascadeChart({ steps, height = 320 }: { steps: CascadeStep[]; height?: number }) {
  const base = Math.max(steps[0]?.value ?? 1, 1);
  const data = steps.map((s, idx) => {
    const spent = steps.slice(0, idx).reduce((a, x) => a + (x.kind === "minus" ? Math.max(x.value, 0) : 0), 0);
    const top = s.kind === "minus" ? base - spent : Math.max(s.value, 0);
    const bottom = s.kind === "minus" ? top - Math.max(s.value, 0) : 0;
    return { ...s, bottom, span: top - bottom, share: (s.value / base) * 100 };
  });
  const ticks = niceTicks(base, 4);
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 30, right: 10, bottom: 18, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={<WrapTick />} height={56} />
          <YAxis tickLine={false} axisLine={false} width={50} tick={AXIS_TICK} ticks={ticks} domain={[0, ticks[ticks.length - 1]!]} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: "rgba(1, 20, 8, 0.045)", radius: 8 }}
            isAnimationActive={false}
            content={(p: Partial<TooltipContentProps<ValueType, NameType>>) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0]!.payload as (typeof data)[number];
              return <ChartTip title={d.label} rows={[{ label: d.kind === "minus" ? "Уходит" : "Сумма", value: `${d.kind === "minus" ? "−" : ""}${formatRub(d.value)}`, color: chartColors.ink }, { label: "Доля выручки", value: `${d.share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` }]} foot={d.hint} />;
            }}
          />
          <Bar dataKey="bottom" stackId="c" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="span" stackId="c" radius={[8, 8, 8, 8]} maxBarSize={72} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" offset={9} content={(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
              const i = props.index ?? 0;
              const d = data[i];
              if (!d) return null;
              return (
                <text x={Number(props.x ?? 0) + Number(props.width ?? 0) / 2} y={Number(props.y ?? 0) - 9} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="#011408" fontFamily="var(--font-inter), system-ui, sans-serif">
                  {d.kind === "minus" ? "−" : ""}
                  {compact(d.value)}
                </text>
              );
            }} />
            {data.map((d) => (
              <Cell key={d.id} fill={d.color ?? (d.kind === "result" ? chartColors.green : d.kind === "total" ? chartColors.blue : chartColors.inkSoft)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───────────────────────── Сравнение с прошлым периодом ───────────────────────── */

/** Две тонкие полосы: этот период и прошлый на общей шкале. Показывает масштаб изменения без цифр. */
export function CompareBar({ cur, past, curLabel = "сейчас", pastLabel = "было", color = chartColors.ink, fmt }: { cur: number | null; past: number | null; curLabel?: string; pastLabel?: string; color?: string; fmt?: (n: number) => string }) {
  if (cur == null || past == null || (cur <= 0 && past <= 0)) return null;
  const max = Math.max(cur, past, 1);
  return (
    <div className="space-y-2" aria-hidden>
      {[
        { l: curLabel, v: cur, c: color },
        { l: pastLabel, v: past, c: `${color}66` },
      ].map((r) => (
        <div key={r.l} className="flex items-center gap-2.5">
          <span className="w-[46px] shrink-0 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            {r.l}
          </span>
          <div className="h-[10px] flex-1 rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
            <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, (Math.max(r.v, 0) / max) * 100)}%`, backgroundColor: r.c }} />
          </div>
          {fmt ? (
            <span className="w-[84px] shrink-0 text-right text-[13.5px] font-medium" style={{ ...monoNum, color: hub.text }}>
              {fmt(r.v)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Сравнение периодов ───────────────────────── */

export type ComparePoint = { date: string; value: number; partial?: boolean; prevDate?: string; prev?: number | null; /** Пояснение к дню в подсказке (например, отменённые заказы). */ note?: string };

/**
 * Главный график страницы: одна жирная линия этого периода с мягкой подложкой цвета показателя и тонкий пунктир предыдущего периода.
 * Без точек вдоль линии: только отметка лучшего дня (с числом) и точка на последнем законченном дне. Сегодняшний неоконченный день не рисуется.
 */
export function CompareChart({ points, label, fmt, yFormat, height = 300, color = chartColors.green }: { points: ComparePoint[]; label: string; fmt: (n: number) => string; yFormat?: (n: number) => string; height?: number; /** Цвет линии: цвет показателя. */ color?: string }) {
  const uid = useId().replace(/:/g, "");
  const { rows, ticks, hasPrev, hasPartial, peak, last } = useMemo(() => {
    const out = points.map((p) => ({ ...p, cur: p.partial ? null : p.value, prevV: p.prev ?? null }));
    const max = Math.max(1, ...points.map((p) => Math.max(p.partial ? 0 : p.value, p.prev ?? 0)));
    const done = out.filter((r) => r.cur != null);
    const lastFull = done.length ? done[done.length - 1]! : null;
    const best = done.reduce<(typeof out)[number] | null>((acc, r) => (acc == null || (r.cur ?? 0) > (acc.cur ?? 0) ? r : acc), null);
    return { rows: out, ticks: niceTicks(max, 4), hasPrev: out.some((r) => r.prevV != null), hasPartial: out.some((r) => r.partial), peak: best && (best.cur ?? 0) > 0 ? best : null, last: lastFull };
  }, [points]);
  if (rows.length === 0) return null;
  const axis = yFormat ?? compact;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
        <span className="inline-flex items-center gap-2">
          <span className="h-0 w-5 border-t-[3.5px]" style={{ borderColor: color }} />
          {label}
        </span>
        {hasPrev ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: "#A9B0C8" }} />
            предыдущий период
          </span>
        ) : null}
        {hasPartial ? <span style={{ color: hub.textSubtle }}>сегодня ещё не закончился</span> : null}
      </div>
      <div className="rounded-[16px] p-3 pr-2" style={{ background: `linear-gradient(180deg, ${color}12 0%, ${color}04 100%)` }}>
        <div style={{ height }} className="-ml-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 22, right: 16, bottom: 0, left: 0 }} accessibilityLayer>
              <defs>
                <linearGradient id={`cmp-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={chartColors.grid} strokeDasharray="4 6" />
              <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} interval="equidistantPreserveStart" tick={AXIS_TICK} tickMargin={12} minTickGap={36} padding={{ left: 8, right: 8 }} />
              <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={axis} tick={AXIS_TICK} ticks={ticks} domain={[0, ticks[ticks.length - 1]!]} tickMargin={4} />
              <Tooltip
                cursor={{ stroke: color, strokeOpacity: 0.35, strokeWidth: 1, strokeDasharray: "4 4" }}
                isAnimationActive={false}
                content={(p: Partial<TooltipContentProps<ValueType, NameType>>) => {
                  if (!p.active || !p.payload?.length) return null;
                  const d = p.payload[0]!.payload as (typeof rows)[number];
                  const delta = d.prevV != null && d.prevV > 0 ? ((d.value - d.prevV) / d.prevV) * 100 : null;
                  const tipRows: Array<{ label: string; value: string; color: string }> = [{ label, value: fmt(d.value), color }];
                  if (d.prevV != null) tipRows.push({ label: d.prevDate ? `Раньше, ${dayLabel(d.prevDate)}` : "Раньше", value: fmt(d.prevV), color: "#A9B0C8" });
                  const foot = [d.note, delta != null ? `К прошлому периоду: ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : null].filter(Boolean).join(" · ");
                  return <ChartTip title={dayLong(d.date)} sub={d.partial ? "день не закончен" : undefined} rows={tipRows} foot={foot || undefined} />;
                }}
              />
              {hasPrev ? <Line dataKey="prevV" type="monotone" stroke="#A9B0C8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: "#A9B0C8" }} isAnimationActive={false} connectNulls /> : null}
              <Area dataKey="cur" type="monotone" stroke={color} strokeWidth={3.5} strokeLinecap="round" fill={`url(#cmp-${uid})`} dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 3, fill: color }} isAnimationActive={false} connectNulls={false} />
              {peak && peak.date !== last?.date ? <ReferenceDot x={peak.date} y={peak.value} r={5} fill="#fff" stroke={color} strokeWidth={3} ifOverflow="visible" label={{ value: fmt(peak.value), position: "top", fill: "#011408", fontSize: 12, fontWeight: 600 }} /> : null}
              {last ? <ReferenceDot x={last.date} y={last.value} r={6} fill={color} stroke="#fff" strokeWidth={3} ifOverflow="visible" label={{ value: fmt(last.value), position: "top", fill: "#011408", fontSize: 12, fontWeight: 600 }} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
