"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock3, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import type { InboxFeedTab } from "@/lib/auto-replies/inbox-demo-data";
import {
  INBOX_FEED_STAR_KEYS,
  type InboxFeedFilters,
  type InboxFeedSort,
  type InboxFeedTextMode,
} from "@/lib/auto-replies/inbox-feed-filters";
import type { StarKey } from "@/lib/auto-replies/settings-types";
import { InboxFeedCalendar } from "./inbox-feed-calendar";
import { inboxTheme } from "./inbox-theme";
import { glass, panel, wsSans } from "./settings-ui";

const serif = {
  fontFamily: "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
} as const;

const easeOut = [0.32, 0.72, 0, 1] as const;

/** Акценты фильтров и вкладок — тёмный, без салата */
const filterUi = {
  activeBg: "#1A1A1A",
  activeFg: "#F7F5F0",
  rangeBg: "rgba(10, 10, 10, 0.06)",
  border: "rgba(201, 193, 182, 0.72)",
} as const;

const SORT_LABELS: { id: InboxFeedSort; label: string }[] = [
  { id: "newest", label: "Сначала новые" },
  { id: "oldest", label: "Сначала старые" },
  { id: "rating_desc", label: "Оценка ↓" },
  { id: "rating_asc", label: "Оценка ↑" },
];

function TabIcon({ variant, active }: { variant: "semi" | "auto"; active: boolean }) {
  const Icon = variant === "semi" ? Check : Clock3;
  return (
    <Icon
      className="h-3.5 w-3.5 shrink-0"
      strokeWidth={variant === "semi" ? 2.5 : 2}
      style={{ color: active ? panel.text : panel.textMuted }}
      aria-hidden
    />
  );
}

export function InboxFeedTabSwitch({
  value,
  options,
  onChange,
}: {
  value: InboxFeedTab;
  options: { value: InboxFeedTab; label: string }[];
  onChange: (tab: InboxFeedTab) => void;
}) {
  return (
    <div
      className="relative flex w-full rounded-full p-1"
      style={{ backgroundColor: "rgba(10, 10, 10, 0.06)" }}
      role="tablist"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const variant = opt.value === "semi" ? "semi" : "auto";
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2.5 sm:gap-2 sm:px-3"
          >
            {active ? (
              <motion.span
                layoutId="inbox-feed-tab-indicator"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: inboxTheme.elevated }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative flex min-w-0 items-center justify-center gap-1.5 sm:gap-2">
              <TabIcon variant={variant} active={active} />
              <span
                className={`truncate text-[12px] sm:text-[13px] ${active ? "font-semibold" : "font-medium"}`}
                style={{ ...wsSans, color: active ? panel.text : panel.textMuted }}
              >
                {opt.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
        style={{ ...wsSans, color: panel.textSubtle }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-[12px] font-medium transition ${className}`}
      style={{
        ...wsSans,
        backgroundColor: active ? filterUi.activeBg : inboxTheme.canvas,
        color: active ? filterUi.activeFg : panel.textMuted,
        boxShadow: active ? "none" : `inset 0 0 0 1px ${filterUi.border}`,
      }}
    >
      {children}
    </button>
  );
}

export function InboxFeedFilterPopover({
  filters,
  onChange,
  onReset,
}: {
  filters: InboxFeedFilters;
  onChange: (next: InboxFeedFilters) => void;
  onReset: () => void;
}) {
  const toggleRating = (star: StarKey) => {
    const set = new Set(filters.ratings);
    if (set.has(star)) set.delete(star);
    else set.add(star);
    if (set.size === 0) return;
    onChange({ ...filters, ratings: [...set].sort() as StarKey[] });
  };

  const setSort = (sort: InboxFeedSort) => onChange({ ...filters, sort });
  const setTextMode = (textMode: InboxFeedTextMode) => onChange({ ...filters, textMode });

  return (
    <div
      className="max-h-[min(78vh,560px)] overflow-y-auto rounded-[1.15rem] border p-4 shadow-[0_20px_48px_-20px_rgba(10,10,10,0.22)]"
      style={{
        borderColor: filterUi.border,
        backgroundColor: inboxTheme.elevated,
      }}
    >
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold" style={{ ...wsSans, color: panel.text }}>
          Сортировка и фильтры
        </p>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] font-semibold transition hover:underline"
          style={{ ...wsSans, color: panel.textMuted }}
        >
          Сбросить
        </button>
      </div>

      <div className="space-y-4">
        <FilterSection title="Сортировка">
          <div className="grid grid-cols-2 gap-1.5">
            {SORT_LABELS.map((opt) => {
              const active = filters.sort === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSort(opt.id)}
                  className="rounded-xl px-2.5 py-2.5 text-center text-[12px] font-medium leading-snug transition"
                  style={{
                    ...wsSans,
                    backgroundColor: active ? filterUi.activeBg : inboxTheme.canvas,
                    color: active ? filterUi.activeFg : panel.textMuted,
                    boxShadow: active ? "none" : `inset 0 0 0 1px ${filterUi.border}`,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        <FilterSection title="Оценка">
          <div className="flex flex-wrap gap-1.5">
            {INBOX_FEED_STAR_KEYS.map((star) => (
              <FilterChip
                key={star}
                active={filters.ratings.includes(star)}
                onClick={() => toggleRating(star)}
              >
                {star} ★
              </FilterChip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Период">
          <InboxFeedCalendar
            range={filters.dateRange}
            onChange={(dateRange) => onChange({ ...filters, dateRange })}
          />
        </FilterSection>

        <FilterSection title="Текст отзыва">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filters.textMode === "all"} onClick={() => setTextMode("all")}>
              Все
            </FilterChip>
            <FilterChip active={filters.textMode === "with_text"} onClick={() => setTextMode("with_text")}>
              С текстом
            </FilterChip>
            <FilterChip
              active={filters.textMode === "without_text"}
              onClick={() => setTextMode("without_text")}
            >
              Без текста
            </FilterChip>
          </div>
        </FilterSection>
      </div>
    </div>
  );
}

export function InboxFeedToolbar({
  shopTitle,
  tab,
  tabOptions,
  onTabChange,
  filters,
  onFiltersChange,
  filtersActive,
  onFiltersReset,
  statusLine,
  onRefresh,
  refreshDisabled = false,
}: {
  shopTitle: string;
  tab: InboxFeedTab;
  tabOptions: { value: InboxFeedTab; label: string }[];
  onTabChange: (tab: InboxFeedTab) => void;
  filters: InboxFeedFilters;
  onFiltersChange: (next: InboxFeedFilters) => void;
  filtersActive: boolean;
  onFiltersReset: () => void;
  statusLine: string;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    const close = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filtersOpen]);

  return (
    <div className="shrink-0 px-4 pb-3 pt-5 sm:px-5 sm:pt-6">
      <h2
        className="text-[1.55rem] font-bold leading-[1.12] tracking-[-0.035em] sm:text-[1.7rem]"
        style={{ ...serif, color: panel.text }}
      >
        {shopTitle}
      </h2>

      <div className="mt-4">
        <InboxFeedTabSwitch value={tab} options={tabOptions} onChange={onTabChange} />
      </div>

      <div className="mt-3.5 flex items-stretch gap-2">
        <label className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: panel.textSubtle }}
            strokeWidth={2}
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Найти отзыв или товар…"
            className="h-11 w-full rounded-full border py-0 pl-10 pr-4 text-[13px] outline-none transition focus:ring-2 focus:ring-[rgba(10,10,10,0.12)]"
            style={{
              ...wsSans,
              borderColor: filterUi.border,
              backgroundColor: inboxTheme.elevated,
              color: panel.text,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
            }}
          />
        </label>

        <div ref={filterRef} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-label="Сортировка и фильтры"
            onClick={() => setFiltersOpen((o) => !o)}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border transition hover:brightness-[0.98]"
            style={{
              borderColor: filtersActive ? filterUi.activeBg : filterUi.border,
              backgroundColor: filtersActive ? filterUi.activeBg : inboxTheme.elevated,
              color: filtersActive ? filterUi.activeFg : panel.textMuted,
            }}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.1} />
          </button>
          {filtersOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: easeOut }}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(100vw-1.5rem,340px)]"
            >
              <InboxFeedFilterPopover
                filters={filters}
                onChange={onFiltersChange}
                onReset={() => {
                  onFiltersReset();
                  setFiltersOpen(false);
                }}
              />
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setFiltersOpen(false)}
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-sm"
                style={{ borderColor: glass.borderSoft, color: panel.textMuted }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : null}
        </div>

        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition hover:brightness-[0.98] disabled:opacity-45"
            style={{
              ...wsSans,
              borderColor: filterUi.border,
              backgroundColor: inboxTheme.elevated,
              color: panel.text,
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
            Обновить
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] font-medium leading-[1.45]" style={{ ...wsSans, color: panel.textSubtle }}>
        {statusLine}
      </p>
    </div>
  );
}
