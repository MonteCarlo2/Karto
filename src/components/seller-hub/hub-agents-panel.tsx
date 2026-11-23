"use client";

import { useState, type ReactNode } from "react";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Общие детали выдвижных панелей агента: короткие разделы, сгруппированные строки настроек, компактные поля.
 * Принципы: минимум текста (название и одна короткая строка), настройка справа, группы на лёгкой тонировке без белых плашек.
 */

const LINE = "rgba(1, 20, 8, 0.08)";
const TINT = "rgba(46, 90, 67, 0.045)";

/** Раздел панели: заголовок, одна строка пояснения, справа при необходимости действие. */
export function PanelSection({ title, hint, action, children }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      {title || action ? (
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-[17px] font-semibold leading-6 tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                {title}
              </h3>
            ) : null}
            {hint ? (
              <p className="max-w-[58ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                {hint}
              </p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Группа строк: прямо на полотне, строки разделены тонкими линиями, сверху и снизу тонкая черта. */
export function PanelGroup({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border px-5 [&>*+*]:border-t" style={{ borderColor: "rgba(1, 20, 8, 0.1)", ["--panel-line" as string]: LINE }}>
      {children}
    </div>
  );
}

/** Строка настройки: название и короткая подсказка слева, элемент управления справа. Ниже можно добавить своё содержимое. */
export function PanelRow({ title, hint, control, children }: { title: ReactNode; hint?: ReactNode; control?: ReactNode; children?: ReactNode }) {
  return (
    <div className="py-5" style={{ borderColor: LINE }}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium leading-6 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {title}
          </p>
          {hint ? (
            <p className="mt-0.5 max-w-[56ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {hint}
            </p>
          ) : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function NumberInner({ value, unit, min, max, step, onCommit, label }: { value: number; unit?: string; min: number; max: number; step?: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const stepBy = step ?? 1;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const bump = (dir: 1 | -1) => {
    const v = clamp((Number(draft) || value) + dir * stepBy);
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  const btn = "flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none outline-none transition-colors duration-150 hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-full p-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.05)" }}>
      <button type="button" aria-label={`${label}: меньше`} disabled={Number(draft) <= min} onClick={() => bump(-1)} className={btn} style={{ color: hub.text }}>
        −
      </button>
      <label className="flex items-center gap-1 px-1">
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = clamp(Number(draft) || min);
            setDraft(String(v));
            if (v !== value) onCommit(v);
          }}
          className="w-[54px] min-w-0 bg-transparent text-center text-[14.5px] font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ ...hubSans, ...hubNumeric, color: hub.text }}
        />
        {unit ? (
          <span className="text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
            {unit}
          </span>
        ) : null}
      </label>
      <button type="button" aria-label={`${label}: больше`} disabled={Number(draft) >= max} onClick={() => bump(1)} className={btn} style={{ color: hub.text }}>
        +
      </button>
    </div>
  );
}

/** Компактное числовое поле для строки настройки. Значение уходит наружу при выходе из поля, внутри не обрезается, пока человек печатает. */
export function PanelNumber(props: { value: number; unit?: string; min: number; max: number; step?: number; onCommit: (v: number) => void; label: string }) {
  return <NumberInner key={props.value} {...props} />;
}

/** Небольшой переключатель из двух-трёх вариантов. */
export function PanelSegmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[10px] p-0.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className="h-8 rounded-[8px] px-3 text-[13px] font-medium outline-none transition-[background-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, backgroundColor: active ? "#fff" : "transparent", boxShadow: active ? "0 0 0 1px rgba(1,20,8,0.1)" : undefined }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Крупная цифра с подписью: для сводок. */
export function PanelStat({ value, label, tone }: { value: ReactNode; label: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <p className="text-[26px] font-semibold leading-none tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color: tone === "danger" ? hub.danger : hub.text }}>
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
    </div>
  );
}

/** Спокойный пустой текст внутри панели. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[18px] px-4 py-5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: TINT }}>
      {children}
    </p>
  );
}

/** Нижняя полоса сохранения: прилипает к низу панели, появляется только при несохранённых изменениях или после сохранения. */
export function PanelSaveBar({ dirty, busy, note, onSave, onReset }: { dirty: boolean; busy?: boolean; note?: { text: string; ok: boolean } | null; onSave: () => void; onReset?: () => void }) {
  if (!dirty && !note) return null;
  return (
    <div className="hub-fade-in sticky bottom-0 z-10 -mx-6 mt-8 flex items-center justify-between gap-3 border-t px-6 py-3 sm:-mx-8 sm:px-8" style={{ backgroundColor: hub.canvas, borderColor: LINE }} role="status">
      <span className="text-[13.5px]" style={{ ...hubSans, color: note && !note.ok ? hub.danger : hub.textSubtle }}>
        {note ? note.text : "Есть несохранённые изменения"}
      </span>
      {dirty ? (
        <span className="flex items-center gap-2">
          {onReset ? (
            <button type="button" disabled={busy} onClick={onReset} className="h-9 rounded-full px-4 text-[13.5px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] disabled:opacity-50" style={{ ...hubSans, color: hub.text }}>
              Вернуть
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onSave} className="h-9 rounded-full px-5 text-[13.5px] font-semibold outline-none transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)] disabled:opacity-60" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
            {busy ? "Сохраняю…" : "Сохранить"}
          </button>
        </span>
      ) : null}
    </div>
  );
}
