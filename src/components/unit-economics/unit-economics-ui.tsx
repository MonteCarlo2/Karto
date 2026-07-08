"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Фирменная палитра юнит-экономики */
export const UE = {
  pageBg: "#F3F1EA",
  panelForm: "#FDFDFB",
  panelResults: "#FFFFFF",
  text: "#070907",
  textMuted: "#6B6B63",
  sectionDivider: "#ECEBE6",
  inputBg: "#F9F8F3",
  inputBorder: "#C5C4BC",
  rowDivider: "#F5F5F5",
  lime: "#B9FF4B",
  green: "#1F4E3D",
  greenPayout: "#00B050",
  ozon: "#005BFF",
  wb: "#CB11AB",
  costBar: "#B8BEC6",
  loss: "#DC2626",
} as const;

const MARKETPLACE_LOGOS = {
  ozon: "/logos/marketplace-ozon-app.png",
  wildberries: "/logos/marketplace-wildberries-app.png",
} as const;

function SwitchTabLogo({ src, active }: { src: string; active: boolean }) {
  if (active) return null;

  return (
    <Image
      src={src}
      alt=""
      width={26}
      height={26}
      className="h-6 w-6 shrink-0 object-contain"
      unoptimized
    />
  );
}

/** Монолитная панель */
export function MonolithPanel({
  children,
  className,
  variant = "form",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "form" | "results";
}) {
  if (variant === "results") {
    return (
      <div
        className={cn(
          "rounded-[20px] border-2 border-black bg-white p-6 sm:p-7",
          "shadow-[0_16px_56px_-12px_rgba(0,0,0,0.22),0_4px_16px_-4px_rgba(0,0,0,0.08)]",
          className
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[20px] p-8 shadow-[0_4px_28px_-10px_rgba(7,9,7,0.1)]",
        className
      )}
      style={{ backgroundColor: UE.panelForm }}
    >
      {children}
    </div>
  );
}

/** Секция внутри монолита */
export function FormSection({
  title,
  icon,
  children,
  last = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={cn("pb-6", !last && "mb-6 border-b")}
      style={!last ? { borderColor: UE.sectionDivider } : undefined}
    >
      <h2
        className="mb-4 flex items-center gap-3 text-lg font-bold tracking-tight"
        style={{ color: UE.text }}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-medium", className)}
      style={{ color: UE.textMuted }}
    >
      {children}
    </label>
  );
}

const inputClass = cn(
  "w-full rounded-[10px] border px-3.5 py-2.5 text-lg font-semibold tabular-nums outline-none transition",
  "bg-[#F9F8F3] border-[#C5C4BC] text-[#070907]",
  "focus:border-[#070907] focus:bg-white",
  "focus:shadow-[0_0_0_3px_rgba(185,255,75,0.4),0_0_0_1px_#070907]"
);

export function NumberField({
  value,
  onChange,
  suffix,
  prefix,
  suffixBadge = false,
  min = 0,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  prefix?: string;
  suffixBadge?: boolean;
  min?: number;
  step?: number;
  className?: string;
}) {
  const padLeft = prefix ? "pl-10" : "";
  const padRight = suffix ? (suffixBadge ? "pr-14" : "pr-10") : "";

  return (
    <div className={cn("relative", className)}>
      {prefix ? (
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold"
          style={{ color: UE.text }}
        >
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
        className={cn(inputClass, padLeft, padRight)}
      />
      {suffix ? (
        suffixBadge ? (
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-xs font-bold"
            style={{ backgroundColor: "#070907", color: UE.lime }}
          >
            {suffix}
          </span>
        ) : (
          <span
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold"
            style={{ color: UE.text }}
          >
            {suffix}
          </span>
        )
      ) : null}
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, "appearance-none", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6B63' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.875rem center",
        backgroundSize: "0.65rem",
      }}
    >
      {children}
    </select>
  );
}

export function HandoffSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex w-full max-w-md rounded-[12px] border-2 border-black/10 p-1"
      style={{ backgroundColor: UE.inputBg }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-[9px] px-4 py-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200",
              active
                ? "bg-[#070907] text-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.35)]"
                : "bg-transparent hover:text-[#070907]"
            )}
            style={!active ? { color: UE.textMuted } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-[10px] border p-0.5"
      style={{ borderColor: UE.inputBorder, backgroundColor: UE.inputBg }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150",
            value === opt.value
              ? "bg-[#070907] text-white shadow-sm"
              : "bg-transparent hover:text-[#070907]"
          )}
          style={value !== opt.value ? { color: UE.textMuted } : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MarketplaceSwitch({
  value,
  onChange,
}: {
  value: "ozon" | "wildberries";
  onChange: (v: "ozon" | "wildberries") => void;
}) {
  const isWb = value === "wildberries";

  return (
    <div
      className="relative box-border h-12 w-[360px] max-w-full shrink-0 rounded-[14px] p-1"
      style={{ backgroundColor: "rgba(235, 231, 222, 0.9)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1 top-1 h-10 rounded-[10px]"
        style={{
          width: "calc(50% - 4px)",
          backgroundColor: isWb ? UE.wb : UE.ozon,
          transform: isWb ? "translateX(100%)" : "translateX(0)",
          transition:
            "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      <div className="relative flex h-full">
        <button
          type="button"
          onClick={() => onChange("ozon")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2.5 text-[15px] font-semibold tracking-tight transition-colors duration-300",
            !isWb ? "text-white" : "text-[#6B6B63]"
          )}
        >
          <SwitchTabLogo src={MARKETPLACE_LOGOS.ozon} active={!isWb} />
          Ozon
        </button>
        <button
          type="button"
          onClick={() => onChange("wildberries")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2.5 text-[15px] font-semibold tracking-tight transition-colors duration-300",
            isWb ? "text-white" : "text-[#6B6B63]"
          )}
        >
          <SwitchTabLogo src={MARKETPLACE_LOGOS.wildberries} active={isWb} />
          Wildberries
        </button>
      </div>
    </div>
  );
}

const actionBtnBase =
  "inline-flex h-[54px] shrink-0 items-center justify-center rounded-[10px] text-[17px] font-semibold leading-none transition-[background-color,box-shadow,filter] duration-200 active:brightness-[0.98]";

export function CalculatePrimaryButton({
  onClick,
  children = "Рассчитать",
}: {
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${actionBtnBase} min-w-[176px] border-2 border-[#070907] px-11 text-[#070907] hover:brightness-[0.97] hover:shadow-[0_4px_18px_-6px_rgba(185,255,75,0.65)]`}
      style={{ backgroundColor: UE.lime }}
    >
      {children}
    </button>
  );
}

export function ResetSecondaryButton({
  onClick,
  children = "Сбросить",
}: {
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${actionBtnBase} min-w-[156px] bg-[#EBEAE4] px-9 text-[#070907] hover:bg-[#E2E1DA]`}
    >
      {children}
    </button>
  );
}

export function ParamGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-4", cols === 1 && "grid-cols-1")}>
      {children}
    </div>
  );
}

export function ParamGridItem({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : undefined}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function FieldStack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function OptionalToggle({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-black/8 bg-white/60 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 accent-[#070907]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold" style={{ color: UE.text }}>
            {label}
          </span>
          {description ? (
            <span className="mt-1 block text-xs leading-relaxed" style={{ color: UE.textMuted }}>
              {description}
            </span>
          ) : null}
        </span>
      </label>
      <AnimatePresence initial={false}>
        {checked && children ? (
          <motion.div
            key="optional-content"
            initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.24, bounce: 0 }}
            className="overflow-visible"
          >
            <div className="mt-4 pl-7">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type { LucideIcon } from "lucide-react";
