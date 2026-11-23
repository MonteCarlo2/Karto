"use client";

import { useEffect, useRef, useState } from "react";
import { chartColors } from "./hub-analytics-ui";
import { formatInt, hub, hubSans } from "./hub-ui";

/**
 * Две диаграммы по образцу «Analytics Bento» с 21st.dev, написанные заново: цветная мозаика долей и замкнутая круглая кривая.
 * Цифры в них моноширинные (Geist Mono) с равной шириной знаков, чтобы столбцы чисел не «плясали».
 */

export const monoNumber = { fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e!.contentRect.width);
      const nh = Math.round(e!.contentRect.height);
      setW((p) => (p === nw ? p : nw));
      setH((p) => (p === nh ? p : nh));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w, h] as const;
}

/* ---------- мозаика ---------- */

export type TreemapItem = { id: string; title: string; value: number; color: string; /** Вторая строка на плитке (например, маржа). */ note?: string; /** Цвет текста на плитке: по умолчанию белый. */ ink?: "dark" | "light"; hint?: string };
type Placed = TreemapItem & { x: number; y: number; w: number; h: number };

function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Placed[] {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const scale = (w * h) / total;
  const out: Placed[] = [];
  let rest = items.map((i) => ({ ...i, a: i.value * scale }));
  const worst = (row: typeof rest, len: number) => {
    const s = row.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...row.map((r) => r.a));
    const mn = Math.min(...row.map((r) => r.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  while (rest.length) {
    const len = Math.min(w, h);
    const row = [rest[0]!];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]!], len) <= worst(row, len)) row.push(rest[i++]!);
    rest = rest.slice(i);
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  }
  return out;
}

export function TreemapChart({ items, format = formatInt, height = 300, legend = true }: { items: TreemapItem[]; /** Строка под диаграммой с плитками, где название не поместилось. */ legend?: boolean; format?: (n: number) => string; /** Число (px) или "fill": занять всю высоту родителя (минимум 260). */ height?: number | "fill" }) {
  const [ref, W, measuredH] = useWidth();
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  // Не больше 12 плиток: хвост собирается в одну, иначе у магазина с сотней позиций мозаика превращается в крошку.
  const list: TreemapItem[] = sorted.length > 12 ? [...sorted.slice(0, 11), { id: "__rest", title: `Остальные ${sorted.length - 11}`, value: sorted.slice(11).reduce((a, b) => a + b.value, 0), color: "#C9CFC6", ink: "dark" as const }] : sorted;
  const total = list.reduce((a, b) => a + b.value, 0) || 1;
  const GAP = 6;
  const H = height === "fill" ? Math.max(260, measuredH) : height;
  const rects = W > 0 && list.length > 0 ? squarify(list, 0, 0, W + GAP, H + GAP) : [];
  const shareOf = (v: number) => {
    const share = (v / total) * 100;
    return `${share >= 10 ? Math.round(share) : share < 1 ? "<1" : share.toFixed(1).replace(".", ",")}%`;
  };
  // Размер названия растёт вместе с плиткой. Название целиком или не показываем на плитке вовсе: тогда оно выносится в строку под диаграммой.
  const titleSize = (r: Placed) => {
    const longest = Math.max(...r.title.split(/\s+/).map((x) => x.length), 1);
    return Math.max(12, Math.min(20, Math.sqrt(Math.max(0, r.w - GAP) * Math.max(0, r.h - GAP)) / 13, (r.w - GAP - 24) / (longest * 0.92)));
  };
  const fits = (r: Placed) => {
    const w = r.w - GAP;
    const h = r.h - GAP;
    const fs = titleSize(r);
    const lines = Math.ceil((r.title.length * fs * 0.85) / Math.max(40, w - 24));
    return w >= 90 && h >= 26 + lines * fs * 1.25 + (r.note ? 20 : 0) + 40 ? lines : 0;
  };
  const outside = rects.filter((r) => !fits(r));
  return (
    <div className={height === "fill" ? "flex h-full min-h-[260px] flex-col" : undefined}>
      <div ref={ref} className="relative w-full" style={height === "fill" ? { flex: 1, minHeight: 260 } : { height }} role="img" aria-label="Доли показателя">
        {rects.map((r) => {
          const w = r.w - GAP;
          const h = r.h - GAP;
          const shareText = shareOf(r.value);
          const text = format(r.value);
          const named = fits(r) > 0;
          const showNumber = h >= 40 && w >= 70;
          const showShare = showNumber && w >= 140;
          const fs = Math.max(13, Math.min(34, (w - 24 - (showShare ? 56 : 0)) / (text.length * 0.62)));
          const light = r.ink !== "dark";
          const dim = hover != null && hover !== r.id;
          return (
            <div
              key={r.id}
              title={`${r.title}: ${text} (${shareText})${r.hint ? `. ${r.hint}` : ""}`}
              onPointerEnter={() => setHover(r.id)}
              onPointerLeave={() => setHover(null)}
              className="absolute flex flex-col justify-between overflow-hidden rounded-[14px] p-3 transition-[opacity,filter] duration-200"
              style={{ left: r.x, top: r.y, width: w, height: h, background: r.color, color: light ? "#FFFFFF" : "#0B1A10", opacity: dim ? 0.55 : 1, filter: hover === r.id ? "brightness(1.06)" : undefined }}
            >
              {named ? (
                <p className="font-semibold uppercase leading-[1.2] tracking-[0.03em] [overflow-wrap:break-word]" style={{ ...hubSans, fontSize: titleSize(r) }}>
                  {r.title}
                  {r.note ? <span className="mt-1 block text-[12.5px] font-medium normal-case tracking-normal" style={{ opacity: 0.9 }}>{r.note}</span> : null}
                </p>
              ) : (
                <span />
              )}
              {showNumber ? (
                <div className="flex items-end justify-between gap-1.5">
                  <span className="font-medium leading-[0.9]" style={{ ...monoNumber, fontSize: fs }}>{text}</span>
                  {showShare ? (
                    <span className="rounded-md px-[6px] py-[3px] text-[13px] font-medium text-white" style={{ ...monoNumber, background: "rgba(8,20,12,0.78)", letterSpacing: "-0.02em" }}>{shareText}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {legend && outside.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {outside.map((r) => (
            <li
              key={r.id}
              onPointerEnter={() => setHover(r.id)}
              onPointerLeave={() => setHover(null)}
              className="flex max-w-full items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-[13.5px]"
              style={{ ...hubSans, backgroundColor: `${r.color.startsWith("#") ? r.color : "#888888"}1A`, color: hub.text }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
              <span className="[overflow-wrap:anywhere]">{r.title}</span>
              <span className="shrink-0 font-medium" style={{ ...monoNumber, letterSpacing: "-0.03em" }}>
                {format(r.value)} · {shareOf(r.value)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- круговая кривая ---------- */

export type PolarItem = { id: string; label: string; value: number; hint?: string };

/** Приближение рядом Фурье низкого порядка: доли выходят круглыми и ровными, без углов. */
function fourier(values: number[]) {
  const n = values.length;
  const K = Math.max(1, Math.min(4, Math.floor(n / 2)));
  const co: Array<[number, number]> = [];
  for (let k = 0; k <= K; k++) {
    let a = 0;
    let b = 0;
    values.forEach((x, i) => {
      const th = (i / n) * Math.PI * 2;
      a += x * Math.cos(k * th);
      b += x * Math.sin(k * th);
    });
    const m = k === 0 ? 1 : 2;
    co.push([(a * m) / n, (b * m) / n]);
  }
  return (th: number) => co.reduce((r, [a, b], k) => r + a * Math.cos(k * th) + b * Math.sin(k * th), 0);
}

export function PolarCurve({ items, format = formatInt, color = chartColors.green, size = 320 }: { items: PolarItem[]; format?: (n: number) => string; color?: string; size?: number }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = items.length;
  const S = Math.max(220, Math.min(size, W || size));
  const C = S / 2;
  const R = C - 34;
  const r0 = R * 0.3;
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  if (n < 3 || W === 0) return <div ref={ref} className="mx-auto w-full" style={{ maxWidth: size, aspectRatio: "1" }} />;
  const lo = Math.min(...items.map((i) => i.value));
  const hi = Math.max(...items.map((i) => i.value));
  const norm = items.map((i) => 0.38 + ((i.value - lo) / (hi - lo || 1)) * 0.62);
  const f = fourier(norm);
  const pointAt = (th: number): [number, number] => {
    const v = Math.max(0.05, f(th));
    const a = -Math.PI / 2 + th;
    const rad = r0 + v * (R - r0);
    return [C + Math.cos(a) * rad, C + Math.sin(a) * rad];
  };
  let d = "";
  for (let j = 0; j <= 180; j++) {
    const p = pointAt((j / 180) * Math.PI * 2);
    d += `${j ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }
  d += "Z";
  const dot = hover != null ? pointAt((hover / n) * Math.PI * 2) : null;

  const move = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left - C;
    const y = e.clientY - box.top - C;
    if (Math.hypot(x, y) < r0) return setHover(null);
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    setHover(Math.round((a / (Math.PI * 2)) * n) % n);
  };

  return (
    <div ref={ref} className="mx-auto w-full overflow-hidden" style={{ maxWidth: size }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="mx-auto block" role="img" aria-label="Показатель по дням недели по кругу">
        <defs>
          <radialGradient id="polar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity={0.04} />
            <stop offset="100%" stopColor={color} stopOpacity={0.26} />
          </radialGradient>
        </defs>
        {[0.34, 0.67, 1].map((k) => (
          <circle key={k} cx={C} cy={C} r={r0 + (R - r0) * k} fill="none" stroke={chartColors.grid} strokeDasharray="3 5" />
        ))}
        {items.map((it, i) => (
          <g key={it.id}>
            <line x1={C + Math.cos(ang(i)) * r0} y1={C + Math.sin(ang(i)) * r0} x2={C + Math.cos(ang(i)) * R} y2={C + Math.sin(ang(i)) * R} stroke={chartColors.grid} />
            <text x={C + Math.cos(ang(i)) * (R + 20)} y={C + Math.sin(ang(i)) * (R + 20)} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={i === hover ? 700 : 500} fill={i === hover ? hub.text : "#636C61"} style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
              {it.label}
            </text>
          </g>
        ))}
        <path d={d} fill="url(#polar-fill)" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {dot ? <circle cx={dot[0]} cy={dot[1]} r={6} fill={color} stroke="#FFFFFF" strokeWidth={2.5} /> : null}
        <circle cx={C} cy={C} r={r0 - 2} fill="#FFFFFF" stroke={chartColors.grid} />
        {hover != null ? (
          <>
            <text x={C} y={C - 4} textAnchor="middle" fontSize={Math.round(R * 0.2)} fill={hub.text} style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.04em" }}>{format(items[hover]!.value)}</text>
            <text x={C} y={C + R * 0.14} textAnchor="middle" fontSize={14} fill="#636C61">{items[hover]!.hint ?? items[hover]!.label}</text>
          </>
        ) : null}
        <rect width={S} height={S} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
      </svg>
    </div>
  );
}
