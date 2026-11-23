"use client";

import { useEffect, useRef } from "react";
import { hub, hubSans } from "./hub-ui";

/**
 * Выбор времени «барабаном», как на телефоне: слева часы, справа минуты, обе колонки плавно крутятся
 * и сами «щёлкают» на ближайшее значение. Любое время до минуты. Время московское, подпись «МСК» показывает вызывающий код.
 */

const ITEM = 44;
const VISIBLE = 5;
const pad = (n: number) => String(n).padStart(2, "0");

function Wheel({ count, value, onChange, label }: { count: number; value: number; onChange: (n: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const own = useRef(false);

  // Значение пришло снаружи (быстрые кнопки, открытие окна): докручиваем барабан.
  useEffect(() => {
    const el = ref.current;
    if (!el || own.current) return;
    const target = value * ITEM;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTo({ top: target, behavior: el.scrollTop === 0 && value !== 0 ? "auto" : "smooth" });
  }, [value]);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    own.current = true;
    const idx = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    if (idx !== value) onChange(idx);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      own.current = false;
    }, 140);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.min(count - 1, Math.max(0, value + (e.key === "ArrowDown" ? 1 : -1)));
          onChange(next);
          ref.current?.scrollTo({ top: next * ITEM, behavior: "smooth" });
        }
      }}
      className="relative h-full w-[84px] snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollBehavior: "auto" }}
    >
      <div style={{ height: ITEM * Math.floor(VISIBLE / 2) }} aria-hidden />
      {Array.from({ length: count }, (_, n) => {
        const dist = Math.abs(n - value);
        return (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            tabIndex={-1}
            onClick={() => {
              onChange(n);
              ref.current?.scrollTo({ top: n * ITEM, behavior: "smooth" });
            }}
            className="flex w-full snap-center items-center justify-center tabular-nums outline-none transition-[opacity,transform,font-size] duration-150"
            style={{ ...hubSans, height: ITEM, fontSize: dist === 0 ? 26 : 20, fontWeight: dist === 0 ? 600 : 500, color: hub.text, opacity: dist === 0 ? 1 : dist === 1 ? 0.5 : 0.22 }}
          >
            {pad(n)}
          </button>
        );
      })}
      <div style={{ height: ITEM * Math.floor(VISIBLE / 2) }} aria-hidden />
    </div>
  );
}

export function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const [hh, mm] = (ok ? value : "10:00").split(":").map(Number) as [number, number];
  // Обе колонки могут сработать подряд до перерисовки: держим последнее значение в ref, чтобы одна не затирала другую.
  const cur = useRef({ hh, mm });
  useEffect(() => {
    cur.current = { hh, mm };
  }, [hh, mm]);
  const setH = (h: number) => {
    cur.current = { ...cur.current, hh: h };
    onChange(`${pad(h)}:${pad(cur.current.mm)}`);
  };
  const setM = (m: number) => {
    cur.current = { ...cur.current, mm: m };
    onChange(`${pad(cur.current.hh)}:${pad(m)}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative flex shrink-0 items-center justify-center rounded-[20px] px-3" style={{ height: ITEM * VISIBLE, backgroundColor: "rgba(1,20,8,0.04)" }} role="group" aria-label="Время, МСК">
        {/* полоса выбранного значения */}
        <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-[14px]" style={{ height: ITEM, backgroundColor: "rgba(46,90,67,0.12)", boxShadow: "inset 0 0 0 1.5px rgba(46,90,67,0.35)" }} aria-hidden />
        <Wheel count={24} value={hh} onChange={setH} label="Часы" />
        <span className="relative z-10 -mt-0.5 px-1 text-[26px] font-semibold" style={{ ...hubSans, color: hub.text }} aria-hidden>
          :
        </span>
        <Wheel count={60} value={mm} onChange={setM} label="Минуты" />
        <span className="relative z-10 ml-1 mr-1 text-[13px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
          МСК
        </span>
        {/* затухание сверху и снизу */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[70px] rounded-t-[20px]" style={{ background: "linear-gradient(to bottom, rgba(247,247,243,0.92), rgba(247,247,243,0))" }} aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] rounded-b-[20px]" style={{ background: "linear-gradient(to top, rgba(247,247,243,0.92), rgba(247,247,243,0))" }} aria-hidden />
      </div>

      <div className="min-w-[200px] space-y-3">
        <p className="text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
          Крутите колонки пальцем, колесом мыши или стрелками. Любое время, до минуты.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {[["07:00", "Утро"], ["09:00", "9:00"], ["13:00", "День"], ["18:00", "Вечер"], ["21:00", "Поздно"]].map(([t, l]) => (
            <button key={t} type="button" onClick={() => onChange(t!)} aria-pressed={value === t} className="h-8 rounded-full px-3 text-[13px] font-medium outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: value === t ? hub.ink : "rgba(1,20,8,0.06)", color: value === t ? "#fff" : hub.textMuted }}>
              {l === t!.replace(/^0/, "") ? t : `${l} · ${t}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
