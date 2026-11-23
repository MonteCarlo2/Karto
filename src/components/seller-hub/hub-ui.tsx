"use client";

import { useState, type ReactNode, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Package, Lightbulb, OctagonAlert, TriangleAlert, Boxes, Megaphone, MessageCircleQuestionMark, MessageSquare, PenLine, Percent, Truck, Check, ChevronDown, Copy, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskActionType } from "@/lib/seller-hub/task-engine/types";

/** Светлый рабочий кабинет: чёрный текст, салат как бренд, системный синий для данных. */
export const hub = {
  canvas: "var(--hub-canvas)",
  surface: "var(--hub-surface)",
  surfaceMuted: "var(--hub-surface-muted)",
  railBg: "var(--hub-rail)",
  railBgSoft: "var(--hub-canvas)",
  railBorder: "var(--hub-border)",
  railText: "var(--hub-text)",
  railTextMuted: "var(--hub-text-subtle)",
  text: "var(--hub-text)",
  textMuted: "var(--hub-text-muted)",
  textSubtle: "var(--hub-text-subtle)",
  border: "var(--hub-border)",
  borderSoft: "var(--hub-border-soft)",
  borderStrong: "var(--hub-border-strong)",
  borderCard: "var(--hub-border-card)",
  limeWash: "var(--hub-lime-wash)",
  green: "var(--hub-forest)",
  greenDark: "var(--hub-forest-dark)",
  greenSoft: "var(--hub-forest-soft)",
  lime: "var(--hub-lime)",
  limeSoft: "var(--hub-lime-soft)",
  limeEdge: "var(--hub-lime-edge)",
  limeRing: "var(--hub-lime-ring)",
  onLime: "var(--hub-on-lime)",
  blue: "var(--hub-info)",
  blueSoft: "var(--hub-info-soft)",
  ink: "var(--hub-text)",
  danger: "var(--hub-danger)",
  dangerSoft: "var(--hub-danger-soft)",
  warn: "var(--hub-warn)",
  warnSoft: "var(--hub-warn-soft)",
  plum: "var(--hub-info)",
  plumSoft: "var(--hub-info-soft)",
  inputBg: "var(--hub-surface)",
  inputBorder: "var(--hub-border-strong)",
} as const;

/** Значок важности: критическая, важная, возможность. */
export const SEVERITY_ICONS = {
  critical: OctagonAlert,
  important: TriangleAlert,
  opportunity: Lightbulb,
} as const;

/** Значок кнопки действия: по смыслу задачи (цена, реклама, остатки, поставки и т. д.). */
type ActionIconComponent = (props: { className?: string; strokeWidth?: number }) => ReactNode;

/** Рубль плотнее, чем линейный значок: цена должна читаться сразу. */
export function RubleGlyph({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center text-[17px] font-bold leading-none", className)} aria-hidden>
      ₽
    </span>
  );
}

export const ACTION_ICONS: Partial<Record<TaskActionType, ActionIconComponent>> = {
  OPEN_PRODUCT: Package,
  OPEN_CONTENT_EDITOR: PenLine,
  OPEN_PRICE_EDITOR: RubleGlyph,
  OPEN_STOCKS: Boxes,
  OPEN_SUPPLIES: Truck,
  OPEN_PROMOTIONS: Percent,
  OPEN_ADS: Megaphone,
  OPEN_REVIEWS: MessageSquare,
  OPEN_REVIEW_RESPONSES: MessageSquare,
  OPEN_QUESTIONS: MessageCircleQuestionMark,
};

export const hubType = {
  h1: "text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]",
  h2: "text-[20px] font-semibold leading-7 tracking-[-0.02em]",
  kpi: "text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em]",
  body: "text-[16px] leading-6",
  caption: "text-[12px] font-semibold uppercase tracking-[0.06em]",
  mono: "font-mono text-[16px] tabular-nums",
} as const;

export const hubSans = {
  fontFamily: "var(--font-inter), var(--font-geist-sans), system-ui, sans-serif",
} as const;

export const hubSerif = {
  fontFamily: "var(--font-source-serif), Georgia, serif",
} as const;

export const hubNumeric = {
  fontVariantNumeric: "tabular-nums",
} as const;

export function HubPanel({
  children,
  className,
  padded = false,
  inkFrame = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  inkFrame?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border",
        padded && "p-6",
        className
      )}
      style={{
        backgroundColor: hub.surface,
        borderColor: inkFrame ? "var(--hub-text)" : hub.border,
        borderWidth: inkFrame ? 2 : 1,
      }}
    >
      {children}
    </section>
  );
}

export function HubPanelHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6"
      style={{ borderColor: hub.borderSoft }}
    >
      <div className="min-w-0">
        <h3 className={hubType.h2} style={{ ...hubSans, color: hub.text }}>
          {title}
        </h3>
        {hint ? (
          <p className="mt-1 text-[13px] leading-[1.55]" style={{ ...hubSans, color: hub.textSubtle }}>
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Раздел без карточки: заголовок, подсказка и содержимое лежат прямо на полотне.
 * Отделяется воздухом и тонкой линией сверху (`divided`), а не рамкой и белой плашкой.
 */
export function HubSection({
  title,
  hint,
  action,
  divided = false,
  id,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  divided?: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? id : undefined}
      className={cn(divided && "border-t pt-6", className)}
      style={divided ? { borderColor: hub.border } : undefined}
    >
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {title ? (
              <h2 id={id} className="text-balance text-[18px] font-semibold leading-6 tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                {title}
              </h2>
            ) : null}
            {hint ? (
              <p className="mt-1 max-w-[68ch] text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
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

/** Вкладки с линией под активной: без плашек и рамок. */
export function HubTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ id: T; label: string; count?: number }>;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div className="flex max-w-full flex-wrap gap-x-6" role="tablist" aria-label={label}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className="relative -mb-px shrink-0 whitespace-nowrap pb-3 pt-1 text-[14px] outline-none transition-colors duration-150 focus-visible:shadow-[0_2px_0_0_var(--hub-lime-ring)]"
            style={{
              ...hubSans,
              color: active ? hub.text : hub.textSubtle,
              fontWeight: active ? 600 : 500,
              borderBottom: `2px solid ${active ? hub.ink : "transparent"}`,
            }}
          >
            {option.label}
            {option.count != null ? (
              <span className="ml-1.5 text-[13px] font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "danger";
  icon?: ReactNode;
}) {
  const accent =
    tone === "good"
      ? hub.green
      : tone === "warn"
        ? hub.warn
        : tone === "danger"
          ? hub.danger
          : hub.text;

  return (
    <div
      className="px-1 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={hubType.caption}
          style={{ ...hubSans, color: hub.textSubtle }}
        >
          {label}
        </p>
        {icon ? <span className="shrink-0" style={{ color: hub.textSubtle }}>{icon}</span> : null}
      </div>
      <p
        className={cn("mt-2", hubType.kpi)}
        style={{ ...hubSans, ...hubNumeric, color: accent }}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function HubButton({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
  size = "md",
  type = "button",
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "dark" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  const base =
    "group/btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap [&_svg]:shrink-0 font-semibold tracking-[-0.005em] outline-none transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0";
  const sizing = size === "sm" ? "h-9 gap-1.5 rounded-full px-3 text-[13px]" : "h-10 rounded-full px-5 text-[14px]";
  const look =
    variant === "accent" || variant === "primary"
      ? "border border-[var(--hub-lime-edge)] bg-[var(--hub-lime)] text-[var(--hub-on-lime)] shadow-[0_1px_1px_rgba(1,20,8,0.10),inset_0_1px_0_rgba(255,255,255,0.55)] hover:-translate-y-px hover:bg-[#C4FF66] hover:shadow-[0_1px_1px_rgba(1,20,8,0.10),0_10px_20px_-10px_rgba(87,148,0,0.75),inset_0_1px_0_rgba(255,255,255,0.6)]"
      : variant === "secondary"
        ? "border border-[#7DB36A] bg-white text-[var(--hub-text)] shadow-[0_1px_2px_rgba(1,20,8,0.06)] hover:-translate-y-px hover:border-[#4E8B3A] hover:bg-[#F4FAEC]"
        : variant === "dark"
          ? "border border-[#0F1612] bg-[#0F1612] text-white shadow-[0_1px_2px_rgba(15,22,18,0.25),0_6px_14px_-8px_rgba(15,22,18,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] hover:-translate-y-px hover:bg-[#1D2621] hover:shadow-[0_1px_2px_rgba(15,22,18,0.25),0_12px_22px_-10px_rgba(15,22,18,0.6),inset_0_1px_0_rgba(255,255,255,0.14)]"
          : variant === "danger"
            ? "border border-[var(--hub-danger-soft)] bg-[var(--hub-danger-soft)] text-[var(--hub-danger)] hover:border-[var(--hub-danger)]/30"
            : "border border-transparent text-[var(--hub-text-muted)] hover:bg-[var(--hub-text)]/[0.05] hover:text-[var(--hub-text)]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={cn(base, sizing, look, className)}
      style={hubSans}
    >
      {loading ? (
        <span
          className={cn(
            "inline-block animate-spin rounded-full border-2 border-current/25 border-t-current",
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
          )}
        />
      ) : null}
      {children}
    </button>
  );
}

export function HubBadge({
  tone = "muted",
  children,
  title,
  icon,
}: {
  tone?: "ok" | "warn" | "danger" | "muted" | "accent";
  children: ReactNode;
  title?: string;
  /** Значок вместо точки. */
  icon?: ReactNode;
}) {
  const map = {
    ok: { bg: hub.greenSoft, color: hub.greenDark, dot: "#14874E" },
    warn: { bg: hub.warnSoft, color: hub.warn, dot: "#D29922" },
    danger: { bg: hub.dangerSoft, color: hub.danger, dot: "#D33A3C" },
    accent: { bg: hub.plumSoft, color: hub.plum, dot: "#4076B9" },
    muted: { bg: hub.surfaceMuted, color: hub.textMuted, dot: "#8F948C" },
  } as const;
  const s = map[tone];

  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium"
      style={{ ...hubSans, backgroundColor: s.bg, color: s.color }}
      title={title}
    >
      {icon ?? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.dot }} aria-hidden />}
      {children}
    </span>
  );
}

export function HubField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function HubInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-[10px] border px-3.5 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#8F948C]",
        "focus:border-[var(--hub-lime-ring)] focus:shadow-[0_0_0_3px_rgba(185,255,75,0.45)]",
        className
      )}
      style={{
        ...hubSans,
        backgroundColor: hub.inputBg,
        borderColor: hub.inputBorder,
        color: hub.text,
      }}
    />
  );
}

export function HubStatStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; tone?: "default" | "good" | "warn" | "danger" }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const color =
          item.tone === "good"
            ? hub.green
            : item.tone === "warn"
              ? hub.warn
              : item.tone === "danger"
                ? hub.danger
                : hub.text;
        return (
          <div
            key={item.label}
            className="rounded-2xl border px-5 py-4"
            style={{ backgroundColor: hub.surface, borderColor: hub.border }}
          >
            <p className={hubType.caption} style={{ color: hub.textSubtle }}>
              {item.label}
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em]" style={{ color }}>
              {item.value}
            </p>
            {item.hint ? (
              <p className="mt-2 text-[12px]" style={{ color: hub.textMuted }}>
                {item.hint}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function HubSegmented<T extends string>({
  value,
  options,
  onChange,
  layoutId,
  accent = false,
  pill = false,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  layoutId: string;
  accent?: boolean;
  /** Круглые края: контейнер и выбранный сегмент капсулой. */
  pill?: boolean;
}) {
  return (
    <div
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto p-[3px] ${pill ? "rounded-full" : "rounded-[10px]"}`}
      style={{ backgroundColor: hub.surfaceMuted }}
      role="tablist"
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className="relative shrink-0 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
            style={{ color: active ? hub.ink : hub.textMuted }}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[8px]"
                style={{
                  backgroundColor: accent ? hub.lime : hub.surface,
                  boxShadow: accent ? "none" : "0 0 0 1px rgba(1,20,8,0.06), 0 1px 2px rgba(1,20,8,0.06)",
                }}
                transition={{ type: "spring", stiffness: 460, damping: 36, mass: 0.7 }}
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Поиск: скруглённое поле, значок, очистка и быстрая клавиша «/». */
export function HubSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      event.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className={cn("group/search relative block", className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors group-focus-within/search:text-[var(--hub-text)]" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border bg-white pl-11 pr-11 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#8F948C] focus:border-[var(--hub-lime-ring)] focus:shadow-[0_0_0_3px_rgba(185,255,75,0.45)]"
        style={{ ...hubSans, borderColor: hub.borderCard, color: hub.text, boxShadow: undefined }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
          style={{ color: hub.textMuted }}
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ) : (
        <kbd
          className="pointer-events-none absolute right-3.5 top-1/2 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-[6px] border px-1.5 text-[12px] font-medium sm:flex"
          style={{ ...hubSans, borderColor: hub.border, color: hub.textSubtle, backgroundColor: hub.canvas }}
          aria-hidden
        >
          /
        </kbd>
      )}
    </label>
  );
}

/** Выпадающий список: кнопка-капсула, плавающая панель, галочка у выбранного, клавиатура (стрелки, Enter, Esc). */
export function HubSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  className,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === value) ?? options[0];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.id);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActive(selectedIndex);
        setOpen(true);
        return;
      }
      setActive((index) => (event.key === "ArrowDown" ? (index + 1) % options.length : (index - 1 + options.length) % options.length));
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(selectedIndex);
          setOpen((value) => !value);
        }}
        className="inline-flex h-11 items-center gap-2.5 rounded-full border bg-white pl-4 pr-3.5 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#8F948C] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
        style={{ ...hubSans, borderColor: open ? hub.ink : hub.borderCard, color: hub.text }}
      >
        {icon ? <span style={{ color: hub.textSubtle }}>{icon}</span> : null}
        <span style={{ color: hub.textSubtle }}>{label}:</span>
        <span className="font-semibold">{current?.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} style={{ color: hub.textSubtle }} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className="hub-fade-in absolute left-0 top-[calc(100%+8px)] z-30 min-w-full max-w-[320px] overflow-hidden rounded-[16px] border bg-white p-1.5 shadow-[0_2px_4px_rgba(1,20,8,0.04),0_18px_40px_-12px_rgba(1,20,8,0.22)]"
          style={{ borderColor: hub.borderCard, width: "max-content" }}
        >
          {options.map((option, index) => {
            const selected = option.id === value;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className="flex h-10 cursor-pointer items-center justify-between gap-6 rounded-[10px] px-3 text-[14px] transition-colors"
                style={{ ...hubSans, backgroundColor: index === active ? hub.surfaceMuted : "transparent", color: hub.text, fontWeight: selected ? 600 : 500 }}
              >
                {option.label}
                {selected ? <Check className="h-4 w-4" strokeWidth={2.25} style={{ color: hub.greenDark }} aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function HubAskRow({
  article,
  prompt,
  onAsk,
}: {
  article: string;
  prompt?: string;
  onAsk?: (prompt: string) => void;
}) {
  if (!onAsk || !article) return null;
  return (
    <button
      type="button"
      className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-[11px] border bg-white px-2.5 text-[12px] font-semibold outline-none transition-colors duration-200 hover:bg-[var(--hub-rail)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hub-lime-ring)]"
      style={{ borderColor: hub.borderStrong, color: hub.text, boxShadow: "0 1px 1px rgba(1,20,8,0.05)" }}
      onClick={(event) => {
        event.stopPropagation();
        onAsk(prompt ?? `Что с артикулом ${article}?`);
      }}
    >
      Спросить
      <span className="text-[11px] font-bold" style={{ color: hub.green }}>
        ИИ
      </span>
    </button>
  );
}

export function HubPhoto({
  src,
  className,
  iconClassName = "h-4 w-4",
  bare = false,
  contain = false,
}: {
  src?: string;
  className?: string;
  iconClassName?: string;
  /** Без тонкой внутренней рамки. */
  bare?: boolean;
  /** Фото целиком, без обрезки по краям. */
  contain?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-[var(--hub-canvas)]",
        className
      )}
      style={bare ? undefined : { boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}
    >
      {show ? (
        <img
          src={src}
          alt=""
          className={cn("h-full w-full", contain ? "object-contain" : "object-cover")}
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className={iconClassName} style={{ color: hub.textSubtle }} strokeWidth={1.75} aria-hidden />
      )}
    </div>
  );
}

export function HubEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: hub.surfaceMuted, color: hub.textMuted }}
      >
        {icon}
      </div>
      <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {title}
      </p>
      <p
        className="mt-2 max-w-md text-[14px] leading-[1.65]"
        style={{ ...hubSans, color: hub.textMuted }}
      >
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function formatRub(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return rubFormatter.format(value);
}

export function formatCompactRub(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс ₽`;
  }
  return rubFormatter.format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU");
}

export function formatSyncTime(iso?: string): string {
  if (!iso) return "ещё не синхронизировали";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}


/** Плашка артикула: при наведении справа появляется маленькая кнопка «скопировать». */
export function ArticleChip({ value, prefix = "арт. ", className }: { value: string; prefix?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = (event: { stopPropagation: () => void; preventDefault?: () => void }) => {
    event.stopPropagation();
    event.preventDefault?.();
    void navigator.clipboard?.writeText(value).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    });
  };
  return (
    <span
      className={cn("group/art inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 font-medium", className)}
      style={{ backgroundColor: hub.surfaceMuted, color: hub.textMuted }}
      onClick={(event) => event.stopPropagation()}
    >
      {prefix}
      {value}
      <span
        role="button"
        tabIndex={0}
        aria-label="Скопировать артикул"
        title={done ? "Скопировано" : "Скопировать артикул"}
        onClick={copy}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") copy(event);
        }}
        className={cn(
          "ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[4px] outline-none transition-opacity duration-150 hover:bg-black/[0.06] focus-visible:opacity-100",
          done ? "opacity-100" : "opacity-0 group-hover/art:opacity-100",
        )}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={2.5} style={{ color: hub.greenDark }} /> : <Copy className="h-3 w-3" strokeWidth={1.75} />}
      </span>
    </span>
  );
}
