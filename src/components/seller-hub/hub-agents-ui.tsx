"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Общие детали раздела «Агенты»: вкладки с прокруткой, переключатель, числовое поле, строка состояния.
 * Всё лежит прямо на полотне: без белых плашек, разделение воздухом и тонкими линиями.
 */

/** Вкладки раздела: одна строка с линией под активной; на телефоне прокручиваются вбок, а не переносятся. */
export function AgentTabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (id: T) => void; label: string }) {
  const strip = useRef<HTMLDivElement | null>(null);
  // На узком экране активная вкладка может оказаться за краем: подводим полосу к ней, не трогая вертикальную прокрутку.
  useEffect(() => {
    const box = strip.current;
    const active = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !active) return;
    box.scrollTo({ left: Math.max(0, active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2) });
  }, [value]);
  return (
    <div ref={strip} className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" style={{ boxShadow: `inset 0 -1px 0 ${hub.border}` }}>
      <div className="flex w-max gap-x-6" role="tablist" aria-label={label}>
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.id)}
              className="relative shrink-0 whitespace-nowrap pb-3 pt-1 text-[14px] outline-none transition-colors duration-150 hover:text-[var(--hub-text)] focus-visible:shadow-[0_2px_0_0_var(--hub-lime-ring)]"
              style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, fontWeight: active ? 600 : 500, borderBottom: `2px solid ${active ? hub.ink : "transparent"}` }}
            >
              {option.label}
              {option.count ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold" style={{ ...hubNumeric, backgroundColor: hub.lime, color: hub.onLime }}>
                  {option.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Переключатель: мягкая зелёная дорожка с лаймовым свечением, белый бегунок пружинит. Выключенный светло-серый. */
export function AgentSwitch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group/sw relative h-[26px] w-[46px] shrink-0 rounded-full outline-none transition-[background,box-shadow] duration-300 ease-out focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)] disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        background: checked ? "linear-gradient(180deg, #9BE23B 0%, #6FC21D 100%)" : "linear-gradient(180deg, #DDE3DE 0%, #CDD5CF 100%)",
        boxShadow: checked ? "inset 0 1px 2px rgba(20,70,10,0.28), 0 0 0 1px rgba(80,150,20,0.35)" : "inset 0 1px 2px rgba(1,20,8,0.14), 0 0 0 1px rgba(1,20,8,0.06)",
      }}
    >
      <span
        aria-hidden
        className="absolute left-[3px] top-[3px] h-5 w-5 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active/sw:scale-x-[1.12] motion-reduce:transition-none"
        style={{ backgroundColor: "#FFFFFF", transform: checked ? "translateX(20px)" : "translateX(0)", boxShadow: "0 1px 3px rgba(1,20,8,0.3), 0 0 0 0.5px rgba(1,20,8,0.08)" }}
      />
    </button>
  );
}

/** Тихая строка ожидания: три полоски вместо слова «Загрузка». */
export function AgentSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5 py-1", className)} aria-busy="true" aria-label="Загружаю">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ backgroundColor: hub.surfaceMuted, width: `${[72, 54, 63, 40][i % 4]}%` }} />
      ))}
    </div>
  );
}

/** Сообщение о сбое загрузки с повтором: спокойным тоном, без технических слов. */
export function AgentLoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
      {text}{" "}
      <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 outline-none focus-visible:shadow-[0_2px_0_0_var(--hub-lime-ring)]" style={{ color: hub.text }}>
        Повторить
      </button>
    </p>
  );
}

const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
/** «10 нояб., 00:01»: коротко и одинаково по всему разделу. */
export const agentDateTime = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString("ru-RU", DATE_TIME) : "");
