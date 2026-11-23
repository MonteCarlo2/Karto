"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { hub, HubInput, HubPhoto, hubNumeric, hubSans } from "./hub-ui";

/**
 * Общие элементы раздела «Аналитика»: показатель с изменением, полоса долей, раздел без карточки, таблица, фильтр-капсула.
 * Всё лежит прямо на полотне: разделы отделены воздухом и тонкой линией сверху, без рамок и белых плашек.
 */

export const fmtPct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`);

/**
 * Цвета графиков. У каждого показателя свой постоянный цвет на всех вкладках: сумма и выручка индиго, заказы циан, выкуп фиолетовый,
 * средний чек оранжевый, остаётся и прибыль изумруд, удержания WB пурпур, плохое красное. Набор проверен навыком dataviz
 * (разница для дальтоников); подписи у всех цветов видимые. Лайм только для выделенной точки, всегда с тёмной обводкой.
 */
export const chartColors = {
  ink: "#1D3425",
  ink2: "#4F6B58",
  inkSoft: "#8FA596",
  mute: "#D7DAD0",
  grid: "rgba(1, 20, 8, 0.08)",
  lime: "#B9FF4B",
  limeEdge: "#7DBB1E",
  /** Изумруд: «остаётся», прибыль, хорошее. */
  green: "#10B981",
  greenSoft: "#D7F5E8",
  /** Индиго: деньги (выручка, сумма заказов). */
  blue: "#4F5BEA",
  blueSoft: "#E4E7FD",
  /** Оранжевый: средний чек, логистика. */
  amber: "#F97316",
  amberSoft: "#FFE6D2",
  /** Фиолетовый: выкуп, приёмка. */
  violet: "#8B5CF6",
  violetSoft: "#EBE3FD",
  /** Циан: заказы, хранение. */
  teal: "#0EA5C6",
  tealSoft: "#D4F1F8",
  /** Пурпур: удержания WB. */
  magenta: "#E0399B",
  magentaSoft: "#FBE3F0",
  danger: "#EF4444",
  dangerSoft: "#FDE0DE",
  clay: "#C98A5B",
} as const;

/** Подпись-капитель: маленькие заглавные над числом. */
const caption = "text-[13px] font-semibold uppercase tracking-[0.07em]";

/**
 * Изменение показателя к прошлому периоду. good — в какую сторону хорошо: «up» (рост хорошо), «down» (рост плохо), «neutral» (без оценки).
 * Меньше 0,5% считаем отсутствием изменений, чтобы шум не раскрашивался.
 */
export function DeltaChip({ change, good = "up" }: { change: number | null; good?: "up" | "down" | "neutral" }) {
  if (change == null) {
    return (
      <span className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        нет базы для сравнения
      </span>
    );
  }
  const flat = Math.abs(change) < 0.5;
  const positive = change > 0;
  const better = good === "neutral" || flat ? null : good === "up" ? positive : !positive;
  return <Trend flat={flat} positive={positive} better={better} text={`${Math.abs(change).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`} />;
}

/** Изменение доли в процентных пунктах (выкуп, конверсии): относительное изменение долей вводило бы в заблуждение. */
export function PpChip({ pp, good = "up" }: { pp: number | null; good?: "up" | "down" | "neutral" }) {
  if (pp == null) {
    return (
      <span className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
        нет базы для сравнения
      </span>
    );
  }
  const flat = Math.abs(pp) < 0.3;
  const positive = pp > 0;
  const better = good === "neutral" || flat ? null : good === "up" ? positive : !positive;
  return <Trend flat={flat} positive={positive} better={better} text={`${Math.abs(pp).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п. п.`} />;
}

/** Капсула изменения: стрелка и число. Зелёный и красный только когда у направления есть оценка. */
function Trend({ flat, positive, better, text }: { flat: boolean; positive: boolean; better: boolean | null; text: string }) {
  if (flat) {
    return (
      <span className="text-[13.5px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
        без изменений
      </span>
    );
  }
  const color = better == null ? hub.textMuted : better ? hub.greenDark : hub.danger;
  const bg = better == null ? hub.surfaceMuted : better ? hub.greenSoft : hub.dangerSoft;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-[2px] text-[13.5px] font-semibold" style={{ ...hubSans, ...hubNumeric, color, backgroundColor: bg }}>
      <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden className="shrink-0" style={{ transform: positive ? undefined : "rotate(180deg)" }}>
        <path d="M4.5 1.5 8 6.5H1z" fill="currentColor" />
      </svg>
      {text}
    </span>
  );
}

/**
 * Показатель: подпись, крупное число, изменение и пояснение. Без рамки: сверху тонкая линия, между показателями воздух.
 * size «lg» для главных цифр экрана.
 */
export function Kpi({ label, value, sub, change, pp, good = "up", hint, size = "md" }: { label: string; value: string; sub?: string; change?: number | null; pp?: number | null; good?: "up" | "down" | "neutral"; hint?: string; size?: "md" | "lg" }) {
  return (
    <div className="min-w-0 border-t pt-3.5" style={{ borderColor: hub.border }}>
      <p
        className={cn(caption, hint && "cursor-help")}
        style={{ ...hubSans, color: hub.textSubtle, textDecoration: hint ? "underline dotted" : undefined, textDecorationColor: "rgba(99,108,97,0.5)", textUnderlineOffset: 4 }}
        title={hint}
      >
        {label}
      </p>
      <p className={cn("mt-2 break-words font-semibold leading-none tracking-[-0.03em]", size === "lg" ? "text-[40px]" : "text-[28px]")} style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
        {value}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {change !== undefined ? <DeltaChip change={change} good={good} /> : null}
        {pp !== undefined ? <PpChip pp={pp} good={good} /> : null}
        {sub ? (
          <span className="text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Сетка показателей: на телефоне два столбца, дальше по числу колонок. */
export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const lg = cols === 5 ? "xl:grid-cols-5" : cols === 4 ? "xl:grid-cols-4" : cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2";
  return <div className={cn("grid grid-cols-2 gap-x-6 gap-y-7 sm:gap-x-8 lg:grid-cols-3", lg)}>{children}</div>;
}

/** Горизонтальная полоса: подпись, полоса от 0 до max, значение справа. */
export function BarRow({ label, value, max, text, color = chartColors.ink, sub }: { label: ReactNode; value: number; max: number; text: string; color?: string; sub?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 1.5 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[220px_minmax(0,1fr)_minmax(96px,auto)] sm:gap-y-0">
      <span className="min-w-0 text-[13.5px] font-medium leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {label}
      </span>
      <span className="text-right text-[13px] font-semibold sm:order-3" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
        {text}
        {sub ? (
          <span className="font-normal" style={{ color: hub.textSubtle }}>
            {" "}
            · {sub}
          </span>
        ) : null}
      </span>
      <div className="col-span-2 h-[7px] overflow-hidden rounded-full sm:order-2 sm:col-span-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/** Пояснение под блоком: откуда данные, что они значат и чего не учитывают. */
/** Технические пояснения пользователю не показываем: компонент оставлен, чтобы не трогать вызовы. */
export function SourceNote(props: { children?: ReactNode }) {
  void props;
  return null;
}

/** Число в цветной подложке: важное в таблице видно сразу, цвет сообщает оценку. */
export function NumPill({ children, tone = "neutral", strong = false }: { children: ReactNode; tone?: "neutral" | "blue" | "teal" | "green" | "amber" | "red" | "violet"; strong?: boolean }) {
  const t = {
    neutral: { bg: "rgba(1, 20, 8, 0.05)", fg: hub.text },
    blue: { bg: strong ? "rgba(79, 91, 234, 0.2)" : "rgba(79, 91, 234, 0.12)", fg: "#2F3AB8" },
    teal: { bg: "rgba(14, 165, 198, 0.15)", fg: "#0A7691" },
    green: { bg: "rgba(16, 185, 129, 0.17)", fg: "#067A55" },
    amber: { bg: "rgba(249, 115, 22, 0.17)", fg: "#B4500A" },
    red: { bg: "rgba(239, 68, 68, 0.15)", fg: "#B42323" },
    violet: { bg: "rgba(139, 92, 246, 0.15)", fg: "#6A3DD0" },
  }[tone];
  return (
    <span className="inline-block whitespace-nowrap rounded-[10px] px-2.5 py-1 text-[15.5px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", backgroundColor: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

/** Общий вид рамки: тонкая рамка и лёгкая светлая подложка. По ней видно, где диаграмма начинается и где заканчивается. */
const FRAME = "rounded-[26px] border";
const frameStyle = { borderColor: "rgba(1, 20, 8, 0.32)", background: hub.canvas, boxShadow: "none" } as const;

/**
 * Блок страницы: рамка, заголовок с короткой подсказкой и действие справа (переключатель, период). Внутри одна диаграмма
 * или один список. Все блоки раздела выглядят одинаково: тот же отступ, радиус и рамка.
 */
export function Card({ title, hint, action, children, className, fill }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string; /** Содержимое занимает всю высоту блока (диаграмма растягивается). */ fill?: boolean }) {
  return (
    <section data-glass className={cn(FRAME, "flex min-w-0 flex-col p-6 sm:p-7", className)} style={frameStyle}>
      {title || action ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-balance text-[20px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                {title}
              </h3>
            ) : null}
            {hint ? (
              <p className="mt-1 max-w-[64ch] text-pretty text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
                {hint}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn("hub-rise min-w-0 flex-1", fill && "flex flex-col")}>{children}</div>
    </section>
  );
}

/** Крупное число: единица измерения (₽, %, шт.) мельче и светлее, чтобы цифра была главной. */
export function BigNumber({ value, size = 32, color }: { value: string; size?: number; color?: string }) {
  const m = value.match(/^(.*?)\s?(₽|%|шт\.?)$/);
  return (
    <span className="font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", fontSize: size, color: color ?? hub.text }}>
      {m ? m[1] : value}
      {m ? (
        <span className="ml-[0.12em] font-medium" style={{ fontSize: size * 0.58, letterSpacing: 0, opacity: 0.55 }}>
          {m[2]}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Плитка показателя: цветная подложка и подпись, крупное число, изменение, «прошлый период» и необязательная диаграмма внизу.
 * С onClick плитка работает как переключатель графика: выбранная окрашена и обведена цветом показателя. hero — главная плитка:
 * число крупнее, диаграмма выше.
 */
export function StatBlock({ label, value, delta, sub, hint, color, spark, selected, onClick, hero, children, className }: { label: string; value: string; delta?: ReactNode; sub?: string; hint?: string; color?: string; spark?: ReactNode; selected?: boolean; onClick?: () => void; hero?: boolean; children?: ReactNode; className?: string }) {
  /** Главная плитка залита цветом показателя: белый текст, самый яркий элемент страницы. */
  const solid = Boolean(hero && color);
  const body = (
    <>
      <div className="flex items-center gap-2">
        {color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: solid ? "#FFFFFF" : color }} aria-hidden /> : null}
        <p className={cn(caption, hint && "cursor-help")} style={{ ...hubSans, color: solid ? "#FFFFFF" : color ? hub.text : hub.textSubtle, opacity: solid ? 0.85 : 0.78 }} title={hint}>
          {label}
        </p>
      </div>
      <div className={hero ? "mt-4" : "mt-3"}>
        <BigNumber value={value} size={hero ? 48 : 31} color={solid ? "#FFFFFF" : undefined} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {delta}
        {sub ? (
          <span className="text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: solid ? "rgba(255,255,255,0.82)" : hub.textMuted }}>
            {sub}
          </span>
        ) : null}
      </div>
      {spark ? <div className="mt-auto pt-4">{spark}</div> : null}
      {children ? <div className="mt-auto pt-4">{children}</div> : null}
    </>
  );
  const tinted = solid ? { background: `linear-gradient(135deg, ${color} 0%, #6B54E6 62%, #8B5CF6 100%)`, borderColor: "transparent", boxShadow: `0 18px 36px -18px ${color}` } : color ? { background: `linear-gradient(165deg, ${color}${selected ? "26" : "16"} 0%, #FFFFFF 62%)`, borderColor: `${color}${selected ? "" : "55"}` } : null;
  const style = { ...frameStyle, ...tinted, ...(color && !solid ? ({ "--glass-tint": color } as Record<string, string>) : null), ...(selected && color && !solid ? { boxShadow: `0 0 0 1.5px ${color}, 0 10px 24px -14px ${color}` } : null) };
  const cls = cn(FRAME, "flex min-w-0 flex-col p-5 text-left transition-[border-color,box-shadow,transform] duration-200", hero && "sm:p-6", onClick && "cursor-pointer hover:-translate-y-0.5", className);
  return onClick ? (
    <button type="button" data-glass={solid ? undefined : ""} onClick={onClick} aria-pressed={selected} className={cn(cls, "outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]")} style={style} title={hint}>
      {body}
    </button>
  ) : (
    <div data-glass={solid ? undefined : ""} className={cls} style={style} title={hint}>
      {body}
    </div>
  );
}

/** Ряд плиток показателей: на телефоне два столбца. */
export function StatStrip({ children, cols = 5 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const lg = cols === 6 ? "xl:grid-cols-6" : cols === 5 ? "xl:grid-cols-5" : cols === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";
  return <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", lg)}>{children}</div>;
}

/**
 * Переключатель-капсула: ровная дорожка, выбранный вариант белой плашкой, которая плавно переезжает.
 * Одинаковая высота и отступы у вкладок, периода и переключателя графика, чтобы ничего не выходило за края.
 */
export function Segmented<T extends string>({ value, options, onChange, layoutId, label, size = "md" }: { value: T; options: Array<{ id: T; label: string }>; onChange: (id: T) => void; layoutId: string; label: string; size?: "sm" | "md" }) {
  const h = size === "sm" ? 30 : 36;
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn("relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]", size === "sm" ? "px-3 text-[13px]" : "px-4 text-[14px]", active ? "font-semibold" : "font-medium hover:text-[var(--hub-text)]")}
            style={{ ...hubSans, height: h, color: active ? hub.text : hub.textMuted }}
          >
            {active ? <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-white" style={{ boxShadow: "0 1px 2px rgba(1,20,8,0.14), 0 0 0 1px rgba(1,20,8,0.05)" }} transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.7 }} /> : null}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Пустое или недоступное состояние раздела: спокойный текст, без значков и рамок. */
export function EmptyNote({ title, children, tone = "muted" }: { title: string; children?: ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className="mx-auto flex min-h-[220px] max-w-[52ch] flex-col items-center justify-center py-8 text-center">
      <p className="text-[19px] font-semibold" style={{ ...hubSans, color: tone === "danger" ? hub.danger : hub.text }}>
        {title}
      </p>
      {children ? (
        <p className="mt-2 text-[15.5px] leading-[1.6]" style={{ ...hubSans, color: hub.textMuted }}>
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** Загрузка: заголовок, пояснение и мягкие полосы вместо пустого экрана. */
export function LoadingBlock({ title, height = 240 }: { title: string; children?: ReactNode; height?: number }) {
  return (
    <div role="status" aria-live="polite" className="hub-skel relative w-full overflow-hidden rounded-[18px]" style={{ height }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 240" preserveAspectRatio="none" aria-hidden>
        {[48, 96, 144, 192].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="rgba(1,20,8,0.08)" strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
        ))}
        <path className="hub-draw" d="M0 170 C60 150 90 110 150 120 S240 190 300 140 S400 60 460 100 S560 150 600 90" fill="none" stroke="rgba(1,20,8,0.4)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} />
      </svg>
      <p className="absolute inset-x-0 bottom-4 text-center text-[15px] font-medium" style={{ ...hubSans, color: hub.textMuted }}>
        {title}
      </p>
    </div>
  );
}

/** Загрузка целого экрана: каркас страницы (плитки и графики) того же размера, что и готовый вид. */
export function LoadingPage({ title }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="px-1 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {title}
        <span className="hub-dots" aria-hidden />
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hub-skel h-[132px] rounded-[22px]" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <div className="hub-skel h-[300px] rounded-[26px]" />
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="hub-skel h-[220px] rounded-[26px]" style={{ animationDelay: "0.2s" }} />
        <div className="hub-skel h-[220px] rounded-[26px]" style={{ animationDelay: "0.35s" }} />
      </div>
    </div>
  );
}

/** Движение раздела: появление блоков и спокойная загрузка (серый каркас с бегущим бликом, рисующаяся линия). Отключается при prefers-reduced-motion. */
export function AnalyticsMotion() {
  return (
    <style>{`
@keyframes hub-rise-kf{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hub-sweep-kf{from{background-position:130% 0}to{background-position:-30% 0}}
@keyframes hub-draw-kf{0%{stroke-dashoffset:1;opacity:1}70%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes hub-dots-kf{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}
.hub-rise{animation:hub-rise-kf .6s cubic-bezier(.2,.9,.25,1) both}
.hub-skel{background-color:rgba(1,20,8,.045);background-image:linear-gradient(100deg,transparent 25%,rgba(255,255,255,.75) 50%,transparent 75%);background-size:60% 100%;background-repeat:no-repeat;animation:hub-sweep-kf 1.9s ease-in-out infinite}
.hub-draw{stroke-dasharray:1;animation:hub-draw-kf 2.4s ease-in-out infinite}
.hub-dots::after{content:"";animation:hub-dots-kf 1.4s steps(1) infinite}
@media (prefers-reduced-motion: reduce){.hub-rise,.hub-skel,.hub-draw,.hub-dots::after{animation:none}}
`}</style>
  );
}

/** Предупреждение: WB отдал не все данные, итоги на экране занижены. */
export function IncompleteNotice({ what }: { what: string }) {
  return (
    <p className="max-w-[80ch] rounded-xl px-4 py-3 text-[13px] leading-[1.55]" style={{ ...hubSans, backgroundColor: hub.warnSoft, color: hub.warn }}>
      {what} WB отдал не полностью (у магазина много карточек или сработал лимит выгрузки), поэтому суммы на этом экране занижены. Цифры по отдельным товарам, которые есть в списке, верны.
    </p>
  );
}

/** Дата вида «5 окт» по ГГГГ-ММ-ДД (календарная дата без часового пояса). Один помощник на весь раздел. */
export const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

/** Длинная дата вида «5 октября, пятница». */
export const dayLong = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" });

/**
 * Поле целого числа с подписью. Пока человек печатает, держит черновик (можно стереть цифру и набрать новую);
 * значение отдаётся наружу только когда оно целое и в границах. После ухода из поля возвращается последнее принятое значение.
 */
export function NumberField({ label, value, min, max, onValid, accept }: { label: string; value: number; min: number; max: number; onValid: (n: number) => void; accept?: (n: number) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
      {label}
      <HubInput
        inputMode="numeric"
        className="mt-1.5 w-24"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max && (accept ? accept(n) : true)) onValid(n);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

/** Капсула-фильтр с числом. Выбранная тёмная, остальные на полотне. */
export function FilterChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-[background-color,border-color,color] duration-150 hover:border-[#8F948C] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
      style={{ ...hubSans, borderColor: active ? "#0F1612" : hub.borderCard, backgroundColor: active ? "#0F1612" : "transparent", color: active ? "#fff" : hub.textMuted }}
    >
      {children}
      {count != null ? (
        <span className="font-medium" style={{ ...hubNumeric, color: active ? "rgba(255,255,255,0.65)" : hub.textSubtle }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Прокручиваемая по горизонтали таблица: на телефоне выходит к краям экрана. */
export function DataTable({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/** Заголовок колонки: подпись-капитель, у сортируемой стрелка и подсветка. */
export function Th({ children, title, align = "left", active, dir, onSort }: { children: ReactNode; title?: string; align?: "left" | "right"; active?: boolean; dir?: 1 | -1; onSort?: () => void }) {
  const content = (
    <>
      {children}
      {onSort ? (
        <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden className="ml-1 inline-block shrink-0 transition-opacity" style={{ opacity: active ? 1 : 0.25, transform: active && dir === 1 ? "rotate(180deg)" : undefined }}>
          <path d="M4 9 7.5 4h-7z" fill="currentColor" />
        </svg>
      ) : null}
    </>
  );
  return (
    <th
      title={title}
      aria-sort={active ? (dir === 1 ? "ascending" : "descending") : undefined}
      className={cn("whitespace-nowrap border-b px-3 pb-3 pt-1 align-bottom text-[12px] font-semibold uppercase tracking-[0.06em]", align === "right" && "text-right", title && !onSort && "cursor-help")}
      style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, borderColor: hub.borderStrong }}
    >
      {onSort ? (
        <button type="button" onClick={onSort} className={cn("inline-flex items-center uppercase tracking-[0.06em] outline-none transition-colors hover:text-[var(--hub-text)] focus-visible:text-[var(--hub-text)]", align === "right" && "flex-row-reverse")}>
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}

/** Ячейка таблицы с тонкой линией снизу. */
export function Td({ children, align = "left", className, style, tint }: { children: ReactNode; align?: "left" | "right"; className?: string; style?: React.CSSProperties; /** Заливка всей ячейки: только для одного-двух главных показателей. */ tint?: string }) {
  return (
    <td
      className={cn("border-b px-3.5 py-3.5", align === "right" ? "text-right text-[15.5px] font-medium" : "text-[14.5px]", className)}
      style={{ ...hubSans, ...hubNumeric, ...(align === "right" ? { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.04em" } : null), color: hub.text, borderColor: hub.borderSoft, backgroundColor: tint, ...style }}
    >
      {children}
    </td>
  );
}

/** Товар в таблице: фото, название и строка артикулов. */
export function ProductCell({ photo, title, sub, flag }: { photo?: string; title: string; sub?: ReactNode; flag?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <HubPhoto src={photo} className="h-[56px] w-[42px] shrink-0 rounded-[10px]" iconClassName="h-4 w-4" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[15px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }} title={title}>
          {title}
        </p>
        {sub || flag ? (
          <p className="mt-0.5 truncate text-[12.5px] leading-[1.35]" style={{ ...hubSans, color: hub.textSubtle }}>
            {sub}
            {flag}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Подпись под таблицей: сколько показано из скольких. */
export function ShownCount({ shown, total }: { shown: number; total: number }) {
  return (
    <span className="text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
      {shown} из {total}
    </span>
  );
}
