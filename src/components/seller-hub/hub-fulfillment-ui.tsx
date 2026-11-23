"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hub, HubPhoto, hubSans } from "./hub-ui";

/**
 * Оформление раздела «Заказы и логистика» в одном ряду с «Задачами» и «Событиями»: спокойная лента строк слева,
 * узкая колонка со сводкой справа, вкладки-подчёркивания со счётчиками. Без цветных плиток-героев, как в «Аналитике».
 * Компоненты называются как прежние, чтобы не переписывать логику экранов.
 */

const frame = { borderColor: "rgba(1, 20, 8, 0.16)", background: hub.surface } as const;
const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;

/** Блок раздела: содержимое идёт от края до края (таблицы, полосы инструментов), поля задают сами части. */
export function HubPanel({ children, className }: { children: ReactNode; className?: string; padded?: boolean; inkFrame?: boolean }) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[18px] border", className)} style={frame}>
      {children}
    </section>
  );
}

export function HubPanelHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
      <div className="min-w-0">
        <h3 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
          {title}
        </h3>
        {hint ? (
          <p className="mt-1 max-w-[70ch] text-pretty text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Сводка одной рамкой: несколько чисел через разделители (как «непрочитанные / важные» в «Событиях»). */
export function SummaryBox({ items, className }: { items: Array<{ value: string; label: string; color?: string }>; className?: string; dark?: boolean }) {
  const cols = items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border", cols, className)} style={{ borderColor: "rgba(1, 20, 8, 0.12)", backgroundColor: "rgba(1, 20, 8, 0.08)" }}>
      {items.map((it) => (
        <div key={it.label} className="px-5 py-5" style={{ backgroundColor: hub.surface }}>
          <p className="font-medium leading-none" style={{ ...mono, fontSize: it.value.length > 11 ? 24 : 34, color: it.color ?? hub.text }}>
            {it.value}
          </p>
          <p className="mt-2.5 text-[14.5px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
            {it.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Карточка правой колонки. */
export function SideCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      {title ? (
        <h3 className="mb-5 text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/** Главные вкладки раздела: крупная панель под заголовком с иконками и счётчиками; активная отмечена жирной лаймовой чертой. Вкладки видов ниже заметно мельче. */
export function PrimaryTabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; icon?: ReactNode; count?: number }>; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "rgba(1, 20, 8, 0.14)" }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className="relative flex shrink-0 items-center gap-3 px-5 py-4 text-[18px] transition-colors hover:bg-black/[0.025]"
            style={{ ...hubSans, color: active ? hub.text : hub.textMuted, fontWeight: active ? 700 : 500 }}
          >
            {o.icon ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px] transition-colors" style={{ backgroundColor: active ? "rgba(185, 255, 75, 0.5)" : "rgba(1, 20, 8, 0.05)", color: active ? hub.text : hub.textMuted }}>
                {o.icon}
              </span>
            ) : null}
            {o.label}
            {o.count != null ? (
              <span className="rounded-full px-2.5 py-0.5 text-[14px] font-semibold" style={{ ...mono, letterSpacing: "-0.02em", backgroundColor: active ? "rgba(1, 20, 8, 0.08)" : "rgba(1, 20, 8, 0.05)", color: active ? hub.text : hub.textSubtle }}>
                {o.count.toLocaleString("ru-RU")}
              </span>
            ) : null}
            <span className="absolute inset-x-3 -bottom-px h-[4px] rounded-t-full transition-opacity" style={{ backgroundColor: "#B9FF4B", opacity: active ? 1 : 0 }} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Миниатюра товара без рамки. */
export function Thumb({ src, className }: { src?: string; className?: string }) {
  return <HubPhoto bare src={src} className={cn("h-[78px] w-[60px] shrink-0 rounded-[10px]", className)} iconClassName="h-4 w-4" />;
}

/** Показатель в строке: маленькая подпись и крупное число. */
export function MetricCell({ label, value, color, sub, className }: { label: string; value: ReactNode; color?: string; sub?: string; className?: string }) {
  return (
    <div className={cn("min-w-[88px]", className)}>
      <p className="text-[12.5px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-2.5 text-[20px] font-medium leading-none" style={{ ...mono, color: color ?? hub.text }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[12.5px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Вкладки-подчёркивания со счётчиками, как «Все 259 / Непрочитанные 221» в «Событиях». */
export function FilterTabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-6 gap-y-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className="relative inline-flex items-baseline gap-1.5 pb-2 text-[16px] transition-colors"
            style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, fontWeight: active ? 600 : 500 }}
          >
            {o.label}
            {o.count != null ? (
              <span className="text-[13.5px]" style={{ color: hub.textSubtle, fontWeight: 500 }}>
                {o.count}
              </span>
            ) : null}
            <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full transition-opacity" style={{ backgroundColor: "#7ABE28", opacity: active ? 1 : 0 }} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Полоса этапов: число и подпись под каждым, клик фильтрует список. Активный этап подсвечен светлой заливкой и лаймовой линией сверху. */
export function StatusStrip<T extends string>({ items, value, onChange, label }: { items: Array<{ id: T; label: string; count: number; color?: string }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="grid overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "rgba(1, 20, 8, 0.1)", gridTemplateColumns: `repeat(${items.length}, minmax(104px, 1fr))` }}>
      {items.map((it, i) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className="relative flex flex-col items-center justify-center px-3 py-5 text-center transition-colors hover:bg-black/[0.025]"
            style={{ borderLeft: i > 0 ? "1px solid rgba(1, 20, 8, 0.08)" : undefined, backgroundColor: active ? "rgba(185, 255, 75, 0.2)" : undefined }}
          >
            <span className="absolute inset-x-0 top-0 h-[3px] transition-opacity" style={{ backgroundColor: "#B9FF4B", opacity: active ? 1 : 0 }} aria-hidden />
            <span className="block text-[32px] font-medium leading-none" style={{ ...mono, color: it.count === 0 ? hub.textSubtle : hub.text }}>
              {it.count.toLocaleString("ru-RU")}
            </span>
            <span className="mt-2 flex items-center justify-center gap-2 text-[15px]" style={{ ...hubSans, color: active ? hub.text : hub.textMuted, fontWeight: active ? 600 : 500 }}>
              {it.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: it.color }} aria-hidden /> : null}
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Статус без заливки: цветная точка и текст. */
export function StatusDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-semibold" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.055)" }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  );
}

/** Блок с заголовком и подсказкой для внутренних вкладок: та же рамка, что у остальных блоков раздела. */
export function FCard({ title, hint, action, children }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; /** Первый раздел без линии сверху. */ first?: boolean }) {
  return (
    <section className="min-w-0 rounded-[26px] border p-6 sm:p-7" style={{ borderColor: "rgba(1, 20, 8, 0.2)", backgroundColor: hub.canvas }}>
      {title || action ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-balance text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                {title}
              </h3>
            ) : null}
            {hint ? (
              <p className="mt-2 max-w-[72ch] text-pretty text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                {hint}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Полоса главных чисел без карточек: крупные цифры на полотне, между ними тонкие линии, подпись отделена от числа. */
export function Headline({ items }: { items: Array<{ value: string; label: string; note?: string; color?: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-y-9 rounded-[26px] border p-7 md:grid-cols-4" style={{ borderColor: "rgba(1, 20, 8, 0.2)", backgroundColor: hub.canvas }}>
      {items.map((it, i) => (
        <div key={it.label} className={cn("min-w-0 pr-6", i > 0 && "md:border-l md:pl-8", i % 2 === 1 && "pl-6 max-md:border-l")} style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
          <p className="whitespace-nowrap text-[30px] font-semibold leading-none sm:text-[34px] md:text-[40px]" style={{ ...mono, letterSpacing: "-0.04em", color: it.color ?? hub.text }}>
            {(() => {
              const m = it.value.match(/^(.*?)\s?(шт\.|дн\.|₽|%)$/);
              return m ? (
                <>
                  {m[1]}
                  <span className="ml-1.5 text-[18px] font-medium" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>{m[2]}</span>
                </>
              ) : (
                it.value
              );
            })()}
          </p>
          <p className="mt-4 text-[15px] font-medium" style={{ ...hubSans, color: hub.text }}>
            {it.label}
          </p>
          {it.note ? (
            <p className="mt-1.5 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
              {it.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const TONE: Record<"default" | "good" | "warn" | "danger", string> = {
  default: hub.text,
  good: "#067A55",
  warn: "#B4500A",
  danger: "#B42323",
};

/** Показатель без рамки: подпись, крупное число, пояснение. */
export function MetricTile({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" | "danger"; icon?: ReactNode }) {
  return (
    <div className="rounded-[14px] px-4 py-3.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
      <p className="text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1 text-[28px] font-medium leading-none" style={{ ...mono, color: TONE[tone] }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Карточки ключевых показателей: мягкая иконка, подпись, крупное число и пояснение. Тот же вид, что в «Обзоре и товарах» заказов. */
export function FactCards({ items }: { items: Array<{ icon: LucideIcon; label: string; value: string; note?: string; tint: string; warn?: boolean }> }) {
  const cols = items.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={cn("grid gap-3", cols)}>
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="flex items-start gap-4 rounded-[18px] border p-5" style={{ borderColor: "rgba(1, 20, 8, 0.12)", backgroundColor: hub.surface }}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${c.tint}1F`, color: c.tint }}>
              <Icon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                {c.label}
              </p>
              <p className="mt-3 text-[30px] font-medium leading-none" style={{ ...mono, color: c.warn ? "#B4500A" : hub.text }}>
                {c.value}
              </p>
              {c.note ? (
                <p className="mt-3 text-[14px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
                  {c.note}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
