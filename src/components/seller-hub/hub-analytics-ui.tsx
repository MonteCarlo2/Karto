"use client";

import { useState, type ReactNode } from "react";
import { hub, HubInput, hubSans } from "./hub-ui";

/** Общие элементы раздела «Аналитика»: показатель с изменением, полоса долей, пояснение к источнику данных. */

export const fmtPct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`);

/**
 * Изменение показателя к прошлому периоду. good — в какую сторону хорошо: «up» (рост хорошо), «down» (рост плохо), «neutral» (без оценки).
 * Меньше 0,5% считаем отсутствием изменений, чтобы шум не раскрашивался.
 */
export function DeltaChip({ change, good = "up" }: { change: number | null; good?: "up" | "down" | "neutral" }) {
  if (change == null) {
    return (
      <span className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        нет базы для сравнения
      </span>
    );
  }
  const flat = Math.abs(change) < 0.5;
  const positive = change > 0;
  const better = good === "neutral" || flat ? null : good === "up" ? positive : !positive;
  const color = flat || better == null ? hub.textMuted : better ? hub.green : hub.danger;
  const bg = flat || better == null ? hub.canvas : better ? hub.greenSoft : hub.dangerSoft;
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-px text-[11.5px] font-semibold tabular-nums" style={{ ...hubSans, color, backgroundColor: bg }}>
      {flat ? "без изменений" : `${positive ? "+" : "−"}${Math.abs(change).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`}
    </span>
  );
}

/** Изменение доли в процентных пунктах (выкуп, конверсии): относительное изменение долей вводило бы в заблуждение. */
export function PpChip({ pp, good = "up" }: { pp: number | null; good?: "up" | "down" | "neutral" }) {
  if (pp == null) {
    return (
      <span className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        нет базы для сравнения
      </span>
    );
  }
  const flat = Math.abs(pp) < 0.3;
  const positive = pp > 0;
  const better = good === "neutral" || flat ? null : good === "up" ? positive : !positive;
  const color = flat || better == null ? hub.textMuted : better ? hub.green : hub.danger;
  const bg = flat || better == null ? hub.canvas : better ? hub.greenSoft : hub.dangerSoft;
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-px text-[11.5px] font-semibold tabular-nums" style={{ ...hubSans, color, backgroundColor: bg }}>
      {flat ? "без изменений" : `${positive ? "+" : "−"}${Math.abs(pp).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п. п.`}
    </span>
  );
}

export function Kpi({ label, value, sub, change, pp, good = "up", hint }: { label: string; value: string; sub?: string; change?: number | null; pp?: number | null; good?: "up" | "down" | "neutral"; hint?: string }) {
  return (
    <div className="rounded-2xl border px-4 py-3.5" style={{ borderColor: hub.border, backgroundColor: hub.surface }} title={hint}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1.5 text-[24px] font-semibold leading-none tabular-nums tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {change !== undefined ? <DeltaChip change={change} good={good} /> : null}
        {pp !== undefined ? <PpChip pp={pp} good={good} /> : null}
        {sub ? (
          <span className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Горизонтальная полоса: подпись, полоса от 0 до max, значение справа. */
export function BarRow({ label, value, max, text, color = hub.blue, sub }: { label: ReactNode; value: number; max: number; text: string; color?: string; sub?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[minmax(110px,170px)_1fr_minmax(80px,auto)] items-center gap-3">
      <span className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
        {label}
      </span>
      <div className="h-2.5 rounded-full" style={{ backgroundColor: hub.canvas }}>
        <div className="h-2.5 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="text-right text-[12.5px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
        {text}
        {sub ? <span style={{ color: hub.textSubtle }}> · {sub}</span> : null}
      </span>
    </div>
  );
}

/** Пояснение под блоком: откуда данные, что они значат и чего не учитывают. */
export function SourceNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
      {children}
    </p>
  );
}

export function Card({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: hub.surface }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            {title}
          </h3>
          {hint ? (
            <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              {hint}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Предупреждение: WB отдал не все данные, итоги на экране занижены. */
export function IncompleteNotice({ what }: { what: string }) {
  return (
    <p className="rounded-lg px-3 py-2 text-[12.5px] leading-5" style={{ ...hubSans, backgroundColor: hub.warnSoft, color: hub.warn }}>
      {what} WB отдал не полностью (у магазина много карточек или сработал лимит выгрузки), поэтому суммы на этом экране занижены. Цифры по отдельным товарам, которые есть в списке, верны.
    </p>
  );
}

/** Дата вида «5 окт» по ГГГГ-ММ-ДД (календарная дата без часового пояса). Один помощник на весь раздел. */
export const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

/**
 * Поле целого числа с подписью. Пока человек печатает, держит черновик (можно стереть цифру и набрать новую);
 * значение отдаётся наружу только когда оно целое и в границах. После ухода из поля возвращается последнее принятое значение.
 */
export function NumberField({ label, value, min, max, onValid, accept }: { label: string; value: number; min: number; max: number; onValid: (n: number) => void; accept?: (n: number) => boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
      {label}
      <HubInput
        inputMode="numeric"
        className="mt-1 w-24"
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
