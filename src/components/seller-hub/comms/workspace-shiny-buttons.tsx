"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { panel, wsSans } from "./settings-ui";

type WsShinyBlackButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  size?: "md" | "lg" | "xl";
  icon?: ReactNode;
};

const sizeClasses = {
  md: "px-5 py-3 text-[14px] sm:text-[15px]",
  lg: "px-6 py-3.5 text-[15px] sm:text-[16px]",
  xl: "px-8 py-4 text-[16px] sm:text-[17px]",
};

/** Чёрная CTA с бликами и салатовым ореолом — в духе «Погнали». */
export function WsShinyBlackButton({
  children,
  loading,
  disabled,
  size = "lg",
  icon,
  className,
  ...props
}: WsShinyBlackButtonProps) {
  return (
    <span className={cn("group relative isolate inline-flex w-full", className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-[1.15rem] bg-[radial-gradient(ellipse_at_50%_100%,rgba(185,255,75,0.35),transparent_68%)] opacity-80 blur-[14px] transition group-hover:opacity-100"
      />
      <button
        type="button"
        disabled={disabled || loading}
        style={wsSans}
        className={cn(
          "relative z-10 inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-[1.05rem] border border-white/[0.14] bg-[#070907] font-semibold tracking-[-0.02em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_32px_-12px_rgba(185,255,75,0.22),0_24px_56px_-20px_rgba(0,0,0,0.55)] outline-none transition hover:border-white/[0.26] hover:bg-[#0c1410] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_40px_-10px_rgba(185,255,75,0.32),0_30px_64px_-18px_rgba(0,0,0,0.58)] disabled:pointer-events-none disabled:opacity-45",
          sizeClasses[size]
        )}
        {...props}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_50%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[-45%] -left-[15%] w-[48%] bg-gradient-to-r from-transparent via-white/[0.26] to-transparent opacity-95 mix-blend-screen animate-shiny-black-cta"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[-55%] -left-[20%] w-[36%] bg-gradient-to-r from-transparent via-white/[0.14] to-transparent mix-blend-overlay animate-shiny-black-cta-soft"
        />
        <span className="relative z-10 flex items-center gap-2.5">
          {loading ? <Loader2 className="h-[1.1em] w-[1.1em] animate-spin" strokeWidth={2.2} /> : icon}
          {children}
        </span>
      </button>
    </span>
  );
}

type WsSaladOutlineButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: ReactNode;
};

export function WsSaladOutlineButton({
  children,
  icon,
  className,
  ...props
}: WsSaladOutlineButtonProps) {
  return (
    <button
      type="button"
      style={wsSans}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[1rem] border px-5 py-3 text-[14px] font-semibold transition hover:brightness-[1.02] sm:text-[15px]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

type WsSystemBlueButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: "md" | "lg";
  icon?: ReactNode;
};

const blueSizeClasses = {
  md: "px-5 py-3 text-[14px] sm:text-[15px]",
  lg: "px-6 py-3.5 text-[15px] sm:text-[16px]",
};

/** Плоский системный синий — без градиента и бликов. */
export function WsSystemBlueButton({
  children,
  disabled,
  size = "md",
  icon,
  className,
  ...props
}: WsSystemBlueButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2.5 rounded-[1.05rem] border font-semibold tracking-[-0.02em] text-white outline-none transition hover:brightness-[0.96] disabled:pointer-events-none disabled:opacity-45",
        blueSizeClasses[size],
        className
      )}
        style={{
          ...wsSans,
          backgroundColor: panel.blue,
          borderColor: panel.blueDark,
          boxShadow: "0 2px 8px rgba(0,113,227,0.28)",
        }}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

type WsSystemGreenButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: "md" | "lg";
  icon?: ReactNode;
};

/** Плоская зелёная CTA — режим «Ответы», вариант A. */
export function WsSystemGreenButton({
  children,
  disabled,
  size = "md",
  icon,
  className,
  ...props
}: WsSystemGreenButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2.5 rounded-[1.05rem] border font-semibold tracking-[-0.02em] text-white outline-none transition hover:brightness-[0.96] disabled:pointer-events-none disabled:opacity-45",
        blueSizeClasses[size],
        className
      )}
      style={{
        ...wsSans,
        backgroundColor: panel.green,
        borderColor: panel.greenDark,
        boxShadow: "0 2px 8px rgba(46,90,67,0.28)",
      }}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

type WsLiquidSaladButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  size?: "md" | "publish";
};

/** Контрастная CTA — тёмное стекло + кислотный салат, не сливается с блоком ответа. */
export function WsLiquidSaladButton({
  children,
  loading,
  disabled,
  size = "md",
  className,
  ...props
}: WsLiquidSaladButtonProps) {
  const sizeClasses =
    size === "publish"
      ? "min-h-[3.75rem] rounded-[1.1rem] px-9 py-5 text-[17px] sm:min-h-[4rem] sm:px-10 sm:py-[1.35rem] sm:text-[18px]"
      : "rounded-[1rem] px-6 py-3.5 text-[15px] sm:px-7 sm:py-3.5 sm:text-[16px]";

  return (
    <button
      type="button"
      disabled={disabled || loading}
      style={{
        ...wsSans,
        backgroundColor: "rgba(31, 78, 61, 0.78)",
        color: panel.salad,
        WebkitBackdropFilter: "blur(20px) saturate(165%)",
        backdropFilter: "blur(20px) saturate(165%)",
        border: "1.5px solid rgba(185, 255, 75, 0.72)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.12), 0 12px 32px -12px rgba(10,10,10,0.42)",
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 font-bold tracking-[-0.03em] outline-none transition duration-200 hover:border-[rgba(185,255,75,0.95)] hover:bg-[rgba(46,90,67,0.88)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_36px_-12px_rgba(10,10,10,0.48)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
        sizeClasses,
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-[1.15em] w-[1.15em] animate-spin" strokeWidth={2.3} /> : null}
      {children}
    </button>
  );
}

/** @deprecated используйте WsInboxSendButton */
export const WsGlassGreenPublishButton = WsLiquidSaladButton;

type WsInboxSendButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

/** Кислотно-салатовая «ОТПРАВИТЬ» — как бейдж в разделе Бренд. */
export function WsInboxSendButton({
  loading,
  disabled,
  className,
  ...props
}: WsInboxSendButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      style={{
        ...wsSans,
        backgroundColor: panel.salad,
        color: panel.text,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -1px 0 rgba(46,90,67,0.12), 0 10px 28px -12px rgba(46,90,67,0.38)",
        border: "1px solid rgba(46,90,67,0.2)",
      }}
      className={cn(
        "inline-flex min-w-[14.5rem] items-center justify-center gap-3 rounded-full px-12 py-4 text-[15px] font-bold uppercase tracking-[0.14em] outline-none transition duration-200 hover:brightness-[1.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_12px_32px_-10px_rgba(46,90,67,0.42)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 sm:min-w-[16rem] sm:px-14 sm:py-[1.05rem] sm:text-[16px]",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-[1.15em] w-[1.15em] animate-spin" strokeWidth={2.4} />
      ) : (
        <>
          <span>ОТПРАВИТЬ</span>
          <Send className="h-[1.05em] w-[1.05em] shrink-0" strokeWidth={2.35} aria-hidden />
        </>
      )}
    </button>
  );
}
