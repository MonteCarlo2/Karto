"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { HubButton, hub, hubNumeric, hubSans } from "./hub-ui";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const POPOVER_W = 336;
const POPOVER_H = 470;

const pad = (n: number) => String(n).padStart(2, "0");
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Выбор даты и времени в стиле Seller Hub. Значение как у datetime-local: «2026-10-30T14:00», пусто = не выбрано. */
export function HubDateTimePicker({ value, min, onChange }: { value: string; min: Date; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const selected = value ? new Date(value) : null;
  const base = selected && !Number.isNaN(selected.getTime()) ? selected : null;
  const [view, setView] = useState(() => new Date((base ?? min).getFullYear(), (base ?? min).getMonth(), 1));

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - POPOVER_W - 12);
    const below = rect.bottom + 8;
    const top = below + POPOVER_H > window.innerHeight - 12 ? Math.max(12, rect.top - POPOVER_H - 8) : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function commit(date: Date) {
    onChange(toValue(date < min ? min : date));
  }

  function pickDay(day: Date) {
    const current = base ?? min;
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), current.getHours(), current.getMinutes());
    commit(next);
  }

  function setTime(hours: number, minutes: number) {
    const day = base ?? startOfDay(min);
    commit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes));
  }

  const firstWeekday = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  const today = new Date();
  const label = base ? base.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Выбрать дату и время";

  const quick: Array<{ text: string; at: () => Date }> = [
    { text: "Через час", at: () => new Date(Date.now() + 60 * 60_000) },
    { text: "Завтра в 9:00", at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { text: "Через неделю", at: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setView(new Date((base ?? min).getFullYear(), (base ?? min).getMonth(), 1));
          setOpen((v) => !v);
        }}
        className="inline-flex h-10 items-center gap-2.5 rounded-full border bg-white px-4 text-[14px] font-medium outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
        style={{ ...hubSans, borderColor: hub.borderStrong, color: base ? hub.text : hub.textMuted }}
      >
        <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {label}
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label="Выбор даты и времени"
              className="hub-pop fixed z-[400] rounded-[22px] border bg-white p-4 shadow-[0_28px_70px_-18px_rgba(1,20,8,0.45)]"
              style={{ left: pos.left, top: pos.top, width: POPOVER_W, borderColor: hub.borderCard }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button
                    key={q.text}
                    type="button"
                    onClick={() => {
                      const d = q.at();
                      commit(d);
                      setView(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                    className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                    style={{ ...hubSans, backgroundColor: hub.limeSoft, color: hub.text }}
                  >
                    {q.text}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button type="button" aria-label="Предыдущий месяц" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
                  <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                </button>
                <p className="text-[15px] font-semibold capitalize" style={{ ...hubSans, color: hub.text }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</p>
                <button type="button" aria-label="Следующий месяц" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-7 text-center text-[12px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
                {WEEKDAYS.map((d) => (
                  <span key={d} className="py-1">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((day, index) => {
                  if (!day) return <span key={`e${index}`} />;
                  const disabled = startOfDay(day) < startOfDay(min);
                  const isSel = base ? sameDay(day, base) : false;
                  const isToday = sameDay(day, today);
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSel}
                      onClick={() => pickDay(day)}
                      className="mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[14px] outline-none transition-colors enabled:hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] disabled:cursor-not-allowed"
                      style={{
                        ...hubNumeric,
                        backgroundColor: isSel ? hub.lime : undefined,
                        color: disabled ? hub.borderStrong : hub.text,
                        fontWeight: isSel ? 700 : 500,
                        boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${hub.limeRing}` : undefined,
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t pt-4" style={{ borderColor: hub.border }}>
                <span className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>Время</span>
                <select
                  aria-label="Часы"
                  value={base ? base.getHours() : 9}
                  onChange={(event) => setTime(Number(event.target.value), base ? base.getMinutes() : 0)}
                  className="ml-auto h-9 rounded-full border bg-white px-3 text-[14px] font-semibold outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                  style={{ ...hubNumeric, borderColor: hub.borderStrong, color: hub.text }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{pad(h)}</option>
                  ))}
                </select>
                <span style={{ color: hub.textSubtle }}>:</span>
                <select
                  aria-label="Минуты"
                  value={base ? Math.floor(base.getMinutes() / 5) * 5 : 0}
                  onChange={(event) => setTime(base ? base.getHours() : 9, Number(event.target.value))}
                  className="h-9 rounded-full border bg-white px-3 text-[14px] font-semibold outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                  style={{ ...hubNumeric, borderColor: hub.borderStrong, color: hub.text }}
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <option key={m} value={m}>{pad(m)}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <HubButton size="sm" variant="ghost" onClick={() => { onChange(""); setOpen(false); }}>
                  Сбросить
                </HubButton>
                <HubButton size="sm" onClick={() => setOpen(false)}>
                  Готово
                </HubButton>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
