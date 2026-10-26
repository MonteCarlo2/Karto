"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Светлый рабочий кабинет: чёрный текст, салат как бренд, системный синий для данных. */
export const hub = {
  canvas: "#F4F6F8",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F6F8",
  railBg: "#FFFFFF",
  railBgSoft: "#F4F6F8",
  railBorder: "#E3E6EB",
  railText: "#0E1116",
  railTextMuted: "#8B939E",
  text: "#0E1116",
  textMuted: "#5C6570",
  textSubtle: "#8B939E",
  border: "#E3E6EB",
  borderSoft: "rgba(14,17,22,0.08)",
  green: "#1F4E3D",
  greenDark: "#16382C",
  greenSoft: "#E7F6C9",
  lime: "#B9FF4B",
  blue: "#2F6FED",
  blueSoft: "#E8F0FE",
  ink: "#0E1116",
  danger: "#C2413B",
  dangerSoft: "#FDECEC",
  warn: "#C2410C",
  warnSoft: "#FFF1E6",
  plum: "#2F6FED",
  plumSoft: "#E8F0FE",
  inputBg: "#FFFFFF",
  inputBorder: "#E3E6EB",
} as const;

export const hubType = {
  h1: "text-[32px] font-bold leading-[1.1] tracking-[-0.03em]",
  h2: "text-[20px] font-semibold leading-7 tracking-[-0.02em]",
  kpi: "text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em]",
  body: "text-[16px] leading-6",
  caption: "text-[12px] font-semibold uppercase tracking-[0.06em]",
  mono: "font-mono text-[16px] tabular-nums",
} as const;

export const hubSans = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

export const hubSerif = {
  fontFamily: "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
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
        borderColor: inkFrame ? "#0E1116" : hub.border,
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
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[11px] font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9FF4B] disabled:cursor-not-allowed disabled:opacity-45";
  const sizing = size === "sm" ? "min-h-[36px] px-3.5 text-[13px]" : "min-h-[42px] px-4.5 text-[14px]";
  const look =
    variant === "accent"
      ? "bg-[#B9FF4B] text-[#0E1116] hover:bg-[#C6FF68] active:scale-[0.99]"
      : variant === "primary"
        ? "bg-[#B9FF4B] text-[#0E1116] hover:bg-[#C6FF68] active:scale-[0.99]"
        : variant === "secondary"
          ? "border border-[#E3E6EB] bg-white text-[#0E1116] hover:bg-[#F4F6F8]"
          : variant === "danger"
            ? "bg-[#FDECEC] text-[#C2413B] ring-1 ring-[#C2413B]/20 hover:ring-[#C2413B]/40"
            : "text-[#5C6570] hover:bg-[#0E1116]/[0.04] hover:text-[#0E1116]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(base, sizing, look)}
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
}: {
  tone?: "ok" | "warn" | "danger" | "muted" | "accent";
  children: ReactNode;
  title?: string;
}) {
  const map = {
    ok: { bg: hub.greenSoft, color: hub.greenDark },
    warn: { bg: hub.warnSoft, color: hub.warn },
    danger: { bg: hub.dangerSoft, color: hub.danger },
    accent: { bg: hub.plumSoft, color: hub.plum },
    muted: { bg: "rgba(22,24,20,0.06)", color: hub.textMuted },
  } as const;
  const s = map[tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ ...hubSans, backgroundColor: s.bg, color: s.color }}
      title={title}
    >
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
        "w-full rounded-[11px] border px-3.5 py-2.5 text-[14px] outline-none transition-shadow",
        "focus:border-[#1F4E3D]/45 focus:ring-2 focus:ring-[#B9FF4B]/70",
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
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  layoutId: string;
  accent?: boolean;
}) {
  return (
    <div
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg p-1"
      style={{ backgroundColor: hub.canvas, boxShadow: `inset 0 0 0 1px ${hub.border}` }}
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
            className="relative shrink-0 whitespace-nowrap rounded px-3.5 py-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
            style={{ color: active ? hub.ink : hub.textMuted, fontWeight: active ? 600 : 500 }}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded"
                style={{
                  backgroundColor: accent ? hub.lime : hub.surface,
                  boxShadow: accent ? "none" : "0 1px 2px rgba(14,17,22,0.08)",
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
      className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-[11px] border bg-white px-2.5 text-[12px] font-semibold outline-none transition-colors duration-200 hover:bg-[#F4F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9FF4B]"
      style={{ borderColor: hub.border, color: hub.text, boxShadow: "0 1px 2px rgba(14,17,22,0.06)" }}
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
}: {
  src?: string;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-[#F4F6F8]",
        className
      )}
      style={{ boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}
    >
      {show ? (
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
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
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px]"
        style={{ backgroundColor: hub.greenSoft, color: hub.greenDark }}
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
