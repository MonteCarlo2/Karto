"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { InboxFeedDateRange } from "@/lib/auto-replies/inbox-feed-filters";
import { inboxTheme } from "./inbox-theme";
import { panel, wsSans } from "./settings-ui";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const filterUi = {
  activeBg: "#1A1A1A",
  activeFg: "#F7F5F0",
  rangeBg: "rgba(10, 10, 10, 0.06)",
} as const;

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}

function isoToTs(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return new Date(y, m, d).getTime();
}

export function formatInboxDateRangeLabel(range: InboxFeedDateRange): string {
  if (!range.from && !range.to) return "Любой период";
  const fmt = (iso: string) => {
    const { y, m, d } = parseIso(iso);
    return `${d} ${MONTHS[m].toLowerCase().slice(0, 3)} ${y}`;
  };
  if (range.from && range.to) return `${fmt(range.from)} — ${fmt(range.to)}`;
  if (range.from) return `С ${fmt(range.from)}`;
  return `До ${fmt(range.to!)}`;
}

export function InboxFeedCalendar({
  range,
  onChange,
}: {
  range: InboxFeedDateRange;
  onChange: (next: InboxFeedDateRange) => void;
}) {
  const today = new Date();
  const initialMonth = range.from ? parseIso(range.from).m : today.getMonth();
  const initialYear = range.from ? parseIso(range.from).y : today.getFullYear();

  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [viewYear, setViewYear] = useState(initialYear);
  const [anchor, setAnchor] = useState<string | null>(range.from);

  useEffect(() => {
    if (!range.from && !range.to) setAnchor(null);
  }, [range.from, range.to]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: { iso: string; day: number; inMonth: boolean }[] = [];

    for (let i = 0; i < startOffset; i++) {
      const d = new Date(viewYear, viewMonth, -startOffset + i + 1);
      grid.push({
        iso: toIso(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: false,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push({ iso: toIso(viewYear, viewMonth, day), day, inMonth: true });
    }
    while (grid.length % 7 !== 0) {
      const last = grid[grid.length - 1];
      const d = parseIso(last.iso);
      const next = new Date(d.y, d.m, d.d + 1);
      grid.push({
        iso: toIso(next.getFullYear(), next.getMonth(), next.getDate()),
        day: next.getDate(),
        inMonth: false,
      });
    }
    return grid;
  }, [viewMonth, viewYear]);

  const fromTs = range.from ? isoToTs(range.from) : null;
  const toTs = range.to ? isoToTs(range.to) : null;

  const pickDay = (iso: string) => {
    const start = range.from && !range.to ? range.from : anchor;
    if (!start || (range.from && range.to)) {
      setAnchor(iso);
      onChange({ from: iso, to: null });
      return;
    }
    const a = isoToTs(start);
    const b = isoToTs(iso);
    if (b < a) {
      onChange({ from: iso, to: start });
    } else {
      onChange({ from: start, to: iso });
    }
    setAnchor(null);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: "rgba(201, 193, 182, 0.75)",
        backgroundColor: inboxTheme.canvas,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/[0.04]"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-4 w-4" style={{ color: panel.textMuted }} />
        </button>
        <p className="text-[13px] font-semibold" style={{ ...wsSans, color: panel.text }}>
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/[0.04]"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-4 w-4" style={{ color: panel.textMuted }} />
        </button>
      </div>

      <p className="mb-2 text-center text-[11px] font-medium" style={{ ...wsSans, color: panel.textSubtle }}>
        {formatInboxDateRangeLabel(range)}
        {!range.from && !range.to ? (
          <span className="block text-[10px] font-normal opacity-80">
            Выберите начало, затем конец периода
          </span>
        ) : null}
      </p>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="py-1 text-center text-[10px] font-semibold"
            style={{ ...wsSans, color: panel.textSubtle }}
          >
            {wd}
          </div>
        ))}
        {cells.map((cell) => {
          const ts = isoToTs(cell.iso);
          const inRange =
            fromTs !== null &&
            toTs !== null &&
            ts >= Math.min(fromTs, toTs) &&
            ts <= Math.max(fromTs, toTs);
          const isStart = range.from === cell.iso;
          const isEnd = range.to === cell.iso;
          const isAnchor = anchor === cell.iso;
          const selected = isStart || isEnd || isAnchor;

          return (
            <button
              key={cell.iso + cell.inMonth}
              type="button"
              onClick={() => pickDay(cell.iso)}
              className="relative flex h-8 items-center justify-center rounded-lg text-[12px] font-medium transition"
              style={{
                ...wsSans,
                color: selected ? filterUi.activeFg : cell.inMonth ? panel.text : panel.textSubtle,
                opacity: cell.inMonth || selected ? 1 : 0.45,
                backgroundColor: selected
                  ? filterUi.activeBg
                  : inRange
                    ? filterUi.rangeBg
                    : "transparent",
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {(range.from || range.to) && (
        <button
          type="button"
          onClick={() => {
            setAnchor(null);
            onChange({ from: null, to: null });
          }}
          className="mt-2 w-full text-center text-[11px] font-semibold transition hover:underline"
          style={{ ...wsSans, color: panel.textMuted }}
        >
          Сбросить период
        </button>
      )}
    </div>
  );
}
