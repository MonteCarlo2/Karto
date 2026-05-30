"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles, Star } from "lucide-react";

/** Палитра KARTO workspace: зелёный бренд, синий для действий, без градиентов. */
export const panel = {
  green: "#2E5A43",
  greenDark: "#1F4E3D",
  greenSoft: "#EEF6E8",
  salad: "#B9FF4B",
  saladSoft: "#F4FFE0",
  blue: "#0071E3",
  blueDark: "#005BB5",
  blueSoft: "#E8F2FD",
  accent: "#2E5A43",
  accentHover: "#1F4E3D",
  accentSoft: "#EEF6E8",
  accentBorder: "rgba(46, 90, 67, 0.22)",
  text: "#0A0A0A",
  textMuted: "#5C5A54",
  textSubtle: "#8A857C",
  border: "#C9C1B6",
  borderLight: "rgba(10, 10, 10, 0.08)",
  borderStrong: "rgba(10, 10, 10, 0.16)",
  surface: "#FFFFFF",
  canvas: "#F3F1EA",
  track: "rgba(10, 10, 10, 0.05)",
  inputBg: "#FAF8F4",
  success: "#2E5A43",
  successSoft: "#EEF6E8",
  warn: "#B45309",
  warnSoft: "#FEF3C7",
} as const;

const sans = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

export function WsStack({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

export function WsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-[0_12px_40px_-28px_rgba(46,90,67,0.18)] ring-1 ring-[#2E5A43]/[0.04] ${className}`}
      style={{ borderColor: panel.border }}
    >
      {children}
    </div>
  );
}

export function WsCardHeader({
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
      style={{ borderColor: panel.borderLight }}
    >
      <div>
        <p className="text-[15px] font-semibold" style={{ ...sans, color: panel.text }}>
          {title}
        </p>
        {hint ? (
          <p className="mt-1 text-[13px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
            {hint}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function WsCardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-5 sm:px-6 ${className}`}>{children}</div>;
}

export function WsDivider() {
  return <div className="border-t" style={{ borderColor: panel.borderLight }} />;
}

export function WsSettingBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="border-b py-5 last:border-b-0"
      style={{ borderColor: panel.borderLight }}
    >
      <p className="text-[14px] font-semibold" style={{ ...sans, color: panel.text }}>
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 text-[13px] leading-[1.6]" style={{ ...sans, color: panel.textMuted }}>
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function WsRadioOption({
  selected,
  title,
  description,
  badge,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition sm:px-5"
      style={{
        borderColor: selected ? panel.accentBorder : panel.border,
        backgroundColor: selected ? panel.accentSoft : panel.surface,
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? panel.accent : panel.border }}
      >
        {selected ? (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: panel.accent }} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1" style={sans}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold" style={{ color: panel.text }}>
            {title}
          </span>
          {badge}
        </span>
        <span className="mt-1 block text-[13px] leading-[1.6]" style={{ color: panel.textMuted }}>
          {description}
        </span>
      </span>
    </button>
  );
}

export function WsPillSwitch<T extends string>({
  value,
  options,
  onChange,
  wide,
}: {
  value: T;
  options: { value: T; label: string; ai?: boolean }[];
  onChange: (v: T) => void;
  wide?: boolean;
}) {
  return (
    <div
      className={`inline-flex w-full rounded-full p-1 ${wide ? "sm:max-w-[430px]" : "max-w-[340px]"}`}
      style={{ backgroundColor: panel.borderLight }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-2 text-[12px] font-medium transition sm:px-3 sm:text-[13px]"
            style={{
              ...sans,
              backgroundColor: active ? panel.surface : "transparent",
              color: active ? panel.text : panel.textMuted,
              boxShadow: active ? "0 1px 4px rgba(10,10,10,0.08)" : "none",
            }}
          >
            {opt.ai ? (
              <Sparkles
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: active ? panel.green : panel.textSubtle }}
                strokeWidth={2.2}
              />
            ) : null}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WsOutlinePanel({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.35rem] border bg-transparent ${className}`}
      style={{
        borderColor: panel.borderStrong,
        boxShadow: "0 12px 40px -32px rgba(10,10,10,0.18)",
      }}
    >
      {accent ? (
        <div
          className="h-[3px] w-full"
          style={{ backgroundColor: "rgba(185,255,75,0.72)" }}
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
}

type SegmentTone = "neutral" | "action" | "brand";

export function WsWorkspaceSegment<T extends string>({
  value,
  options,
  onChange,
  tone = "neutral",
  accentValue,
}: {
  value: T;
  options: { value: T; label: string; ai?: boolean }[];
  onChange: (v: T) => void;
  tone?: SegmentTone;
  accentValue?: T;
}) {
  const count = options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const accentActive = accentValue != null && value === accentValue;

  const thumbShadow = accentActive
    ? tone === "action"
      ? "0 0 0 2px rgba(185,255,75,0.5), 0 1px 2px rgba(10,10,10,0.06), 0 8px 20px -10px rgba(37,99,235,0.28)"
      : tone === "brand"
        ? "0 0 0 2px rgba(185,255,75,0.45), 0 1px 2px rgba(10,10,10,0.06), 0 8px 20px -10px rgba(46,90,67,0.28)"
        : "0 1px 2px rgba(10,10,10,0.06), 0 6px 16px -8px rgba(10,10,10,0.18)"
    : "0 1px 2px rgba(10,10,10,0.06), 0 6px 16px -8px rgba(10,10,10,0.18)";

  return (
    <div
      className="relative grid rounded-[1.15rem] border p-1.5"
      style={{
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        borderColor: panel.borderStrong,
        backgroundColor: panel.track,
      }}
    >
      <motion.div
        className="pointer-events-none absolute bottom-1.5 top-1.5 rounded-[0.92rem] bg-white"
        initial={false}
        animate={{
          left: `calc(6px + ${activeIndex} * ((100% - 12px) / ${count}))`,
          width: `calc((100% - 12px) / ${count})`,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 36 }}
        style={{ boxShadow: thumbShadow }}
      />

      {options.map((opt) => {
        const active = value === opt.value;
        const isActionAccent = tone === "action" && opt.value === accentValue;
        const isBrandAccent = tone === "brand" && opt.value === accentValue;
        const textColor = active
          ? isActionAccent
            ? panel.blue
            : isBrandAccent
              ? panel.greenDark
              : panel.text
          : panel.textSubtle;

        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="relative z-10 flex items-center justify-center gap-1.5 px-2 py-3.5 sm:px-3 sm:py-4"
          >
            {opt.ai ? (
              <Sparkles
                className="h-4 w-4 shrink-0 transition-colors duration-200"
                style={{
                  color:
                    active && isActionAccent
                      ? panel.blue
                      : active
                        ? panel.green
                        : panel.textSubtle,
                }}
                strokeWidth={2.15}
              />
            ) : null}
            <span
              className="text-center text-[13px] font-semibold leading-tight tracking-[-0.015em] sm:text-[15px]"
              style={{ ...sans, color: textColor }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WsModePillSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; ai?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <WsWorkspaceSegment
      value={value}
      options={options}
      onChange={onChange}
      tone="action"
      accentValue={"auto" as T}
    />
  );
}

function WsStarRating({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${count} звёзд`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < count;
        return (
          <Star
            key={i}
            className="h-[1.35rem] w-[1.35rem]"
            strokeWidth={1.5}
            fill={filled ? "#F4B942" : "transparent"}
            color={filled ? "#E5A319" : "rgba(10,10,10,0.16)"}
          />
        );
      })}
    </div>
  );
}

export function WsModeStarRow({
  stars,
  value,
  onChange,
  last,
}: {
  stars: number;
  value: "confirm" | "auto";
  onChange: (v: "confirm" | "auto") => void;
  last?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-1 items-center gap-5 px-5 py-5 transition-colors duration-300 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-8 sm:px-6 sm:py-[1.4rem]"
      style={{
        borderBottom: last ? "none" : "1px solid rgba(10,10,10,0.08)",
      }}
    >
      <WsStarRating count={stars} />
      <WsModePillSwitch
        value={value}
        options={[
          { value: "confirm", label: "Полуавтоматический" },
          { value: "auto", label: "Автоматический", ai: true },
        ]}
        onChange={onChange}
      />
    </div>
  );
}

export function WsModeSourceSwitch({
  value,
  onChange,
}: {
  value: "cabinet" | "manual";
  onChange: (v: "cabinet" | "manual") => void;
}) {
  return (
    <div className="w-full sm:w-auto sm:min-w-[280px]">
      <WsWorkspaceSegment
        value={value}
        onChange={onChange}
        tone="brand"
        accentValue="cabinet"
        options={[
          { value: "cabinet", label: "Кабинет" },
          { value: "manual", label: "По тексту" },
        ]}
      />
    </div>
  );
}

/** Переключатель в стиле iOS / Windows — белый бегунок, чёткие состояния. */
export function WsSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
}) {
  const switchId = id ?? label?.replace(/\s+/g, "-").toLowerCase();
  return (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5A43] focus-visible:ring-offset-2"
      style={{
        backgroundColor: checked ? panel.green : "#C5BFB4",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.28)] transition-[left] duration-200 ease-out"
        style={{
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
        }}
      />
    </button>
  );
}

export function WsToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="grid grid-cols-1 items-center gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
      style={{ borderColor: panel.borderLight }}
    >
      <div className="min-w-0">
        <label
          htmlFor={`toggle-${label}`}
          className="cursor-pointer text-[14px] font-semibold"
          style={{ ...sans, color: panel.text }}
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-1 text-[13px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className="flex sm:justify-end">
        <WsSwitch
          id={`toggle-${label}`}
          label={label}
          checked={checked}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

export function WsSegmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <WsSettingBlock title={label} description={hint}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium transition"
              style={{
                ...sans,
                backgroundColor: active ? panel.accent : panel.borderLight,
                color: active ? "#FFFFFF" : panel.text,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </WsSettingBlock>
  );
}

const fieldClass =
  "w-full rounded-lg border px-3.5 py-2.5 text-[14px] leading-[1.6] transition focus:outline-none focus:ring-2";

export function WsTextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold" style={{ ...sans, color: panel.text }}>
        {label}
      </span>
      {hint ? (
        <span className="mt-1 block text-[13px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
          {hint}
        </span>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`mt-3 ${fieldClass} resize-y`}
        style={{
          ...sans,
          borderColor: panel.border,
          backgroundColor: panel.inputBg,
          color: panel.text,
        }}
      />
    </label>
  );
}

export function WsInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "number";
}) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold" style={{ ...sans, color: panel.text }}>
        {label}
      </span>
      {hint ? (
        <span className="mt-1 block text-[13px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
          {hint}
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-3 ${fieldClass}`}
        style={{
          ...sans,
          borderColor: panel.border,
          backgroundColor: panel.inputBg,
          color: panel.text,
        }}
      />
    </label>
  );
}

export function WsPrimaryButton({
  children,
  disabled,
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "outline";
}) {
  const isOutline = variant === "outline";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        ...sans,
        backgroundColor: isOutline ? panel.surface : disabled ? "#C5BFB4" : panel.text,
        color: isOutline ? panel.text : panel.saladSoft,
        border: isOutline ? `1px solid ${panel.border}` : "none",
        boxShadow: isOutline ? "none" : "0 8px 24px -12px rgba(10,10,10,0.35)",
      }}
    >
      {children}
    </button>
  );
}

export function WsStatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "muted";
  children: ReactNode;
}) {
  const bg =
    tone === "ok" ? panel.successSoft : tone === "warn" ? panel.warnSoft : panel.borderLight;
  const color = tone === "ok" ? panel.success : tone === "warn" ? panel.warn : panel.textMuted;
  return (
    <span
      className="inline-flex rounded-md px-2.5 py-1 text-[12px] font-semibold"
      style={{ ...sans, backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

export function WsInfoBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex gap-3 rounded-xl border px-4 py-3.5 text-[13px] leading-[1.6]"
      style={{
        borderColor: panel.accentBorder,
        backgroundColor: panel.saladSoft,
        color: panel.greenDark,
        ...sans,
      }}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: panel.green }} strokeWidth={2} />
      <div>{children}</div>
    </div>
  );
}

export function WsTimelineItem({
  time,
  title,
  detail,
  status,
}: {
  time: string;
  title: string;
  detail: string;
  status: "draft" | "sent" | "settings";
}) {
  const dot =
    status === "sent" ? panel.success : status === "draft" ? panel.accent : panel.textSubtle;
  return (
    <div className="flex gap-4 py-3">
      <div className="flex flex-col items-center">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="mt-1 w-px flex-1 bg-slate-200" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-medium" style={{ ...sans, color: panel.text }}>
            {title}
          </p>
          <span className="text-[12px]" style={{ ...sans, color: panel.textSubtle }}>
            {time}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
          {detail}
        </p>
      </div>
    </div>
  );
}

export function WsPresetChip({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="rounded-xl border px-4 py-3.5 text-left transition"
      style={{
        borderColor: active ? panel.accentBorder : panel.border,
        backgroundColor: active ? panel.accentSoft : panel.surface,
      }}
    >
      <span className="block text-[14px] font-semibold" style={{ ...sans, color: panel.text }}>
        {title}
      </span>
      <span className="mt-1 block text-[12px] leading-[1.45]" style={{ ...sans, color: panel.textMuted }}>
        {description}
      </span>
    </button>
  );
}

/** Стеклянная поверхность для расширенных настроек текста. */
export const glass = {
  surface: "rgba(243, 241, 234, 0.72)",
  surfaceStrong: "rgba(255, 255, 255, 0.82)",
  border: "rgba(10, 10, 10, 0.1)",
  borderSoft: "rgba(10, 10, 10, 0.06)",
  shadow: "0 12px 36px -22px rgba(10,10,10,0.14), inset 0 1px 0 rgba(255,255,255,0.65)",
  activeGlow: "0 0 0 1px rgba(46,90,67,0.16), 0 8px 24px -14px rgba(46,90,67,0.22)",
} as const;

export function WsGlassPanel({
  children,
  className = "",
  borderColor,
}: {
  children: ReactNode;
  className?: string;
  borderColor?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.2rem] border ${className}`}
      style={{
        backgroundColor: glass.surface,
        borderColor: borderColor ?? glass.border,
        boxShadow: glass.shadow,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {children}
    </div>
  );
}

export function WsGlassSectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div
      className="border-b px-5 py-4 sm:px-6"
      style={{
        borderColor: glass.borderSoft,
        backgroundColor: "rgba(185,255,75,0.12)",
        borderLeft: "3px solid rgba(185,255,75,0.75)",
      }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ ...sans, color: panel.green }}
      >
        Раздел
      </p>
      <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] sm:text-[17px]" style={{ ...sans, color: panel.text }}>
        {title}
      </p>
      {hint ? (
        <p className="mt-1 text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...sans, color: panel.textMuted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function WsGlassRadioCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[0.95rem] border px-3.5 py-3 text-left transition sm:px-4"
      style={{
        borderColor: selected ? "rgba(46,90,67,0.22)" : glass.borderSoft,
        backgroundColor: selected ? "rgba(185,255,75,0.16)" : "rgba(255,255,255,0.28)",
        boxShadow: selected ? glass.activeGlow : "none",
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition"
        style={{
          borderColor: selected ? panel.green : "rgba(10,10,10,0.18)",
          backgroundColor: selected ? panel.green : "rgba(255,255,255,0.6)",
        }}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold sm:text-[15px]" style={{ ...sans, color: panel.text }}>
          {title}
        </span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...sans, color: panel.textMuted }}>
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function WsGlassToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3.5"
      style={{ borderColor: glass.borderSoft }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold tracking-[-0.01em]" style={{ ...sans, color: panel.text }}>
          {label}
        </p>
        {hint ? (
          <p className="mt-1 text-[12px] leading-[1.55]" style={{ ...sans, color: panel.textMuted }}>
            {hint}
          </p>
        ) : null}
      </div>
      <div
        className="flex shrink-0 items-center gap-2.5 rounded-[0.9rem] border px-2.5 py-1.5"
        style={{
          borderColor: checked ? "rgba(46,90,67,0.18)" : glass.borderSoft,
          backgroundColor: checked ? "rgba(185,255,75,0.12)" : "rgba(255,255,255,0.25)",
        }}
      >
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ ...sans, color: panel.textSubtle }}>
          {checked ? "Вкл." : "Выкл."}
        </span>
        <WsSwitch label={label} checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

export function WsGlassOptionTrack<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const count = options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      className={`relative grid rounded-[1.05rem] border p-1.5 ${className}`}
      style={{
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        borderColor: panel.borderStrong,
        backgroundColor: panel.track,
      }}
    >
      <motion.div
        className="pointer-events-none absolute bottom-1.5 top-1.5 rounded-[0.85rem] bg-white"
        initial={false}
        animate={{
          left: `calc(6px + ${activeIndex} * ((100% - 12px) / ${count}))`,
          width: `calc((100% - 12px) / ${count})`,
        }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        style={{
          boxShadow:
            "0 0 0 1px rgba(185,255,75,0.35), 0 1px 2px rgba(10,10,10,0.06), 0 8px 20px -10px rgba(37,99,235,0.22)",
        }}
      />
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="relative z-10 px-1.5 py-2.5 text-center text-[12px] font-semibold leading-tight sm:py-3 sm:text-[13px]"
            style={{ ...sans, color: active ? panel.blue : panel.textSubtle }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function WsGlassPresetCard({
  active,
  title,
  description,
  onClick,
  static: isStatic,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick?: () => void;
  static?: boolean;
}) {
  const body = (
    <>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ ...sans, color: active ? panel.blue : panel.textSubtle }}
      >
        {active ? "Выбран" : isStatic ? "Авто" : "Пресет"}
      </span>
      <span className="mt-1.5 block text-[14px] font-semibold tracking-[-0.015em]" style={{ ...sans, color: panel.text }}>
        {title}
      </span>
      <span className="mt-1 block text-[12px] leading-[1.5]" style={{ ...sans, color: panel.textMuted }}>
        {description}
      </span>
    </>
  );

  const surfaceStyle = {
    borderColor: active ? "rgba(37,99,235,0.35)" : glass.borderSoft,
    backgroundColor: active ? "rgba(37,99,235,0.08)" : "rgba(255,255,255,0.28)",
    boxShadow: active
      ? "0 0 0 1px rgba(37,99,235,0.18), 0 8px 24px -14px rgba(37,99,235,0.2)"
      : "none",
  };

  if (isStatic) {
    return (
      <div
        className="rounded-[1.05rem] border px-4 py-3.5 sm:py-4"
        style={surfaceStyle}
        aria-current={active ? "true" : undefined}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="rounded-[1.05rem] border px-4 py-3.5 text-left transition sm:py-4"
      style={surfaceStyle}
    >
      {body}
    </button>
  );
}

/** Текст отзыва/ответа — Geist, удобнее для длинного чтения, чем декоративный serif. */
const composeText = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  letterSpacing: "-0.011em",
  fontWeight: 500,
} as const;

export { sans as wsSans, composeText as wsComposeText, panel as wsPanel };
