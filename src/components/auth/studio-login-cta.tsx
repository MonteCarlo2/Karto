"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_LABEL = "Войти / Зарегистрироваться";

type StudioLoginCtaVariant = "glass" | "dark-full" | "lime" | "green-pill" | "pognali";

type StudioLoginCtaProps = {
  href: string;
  variant?: StudioLoginCtaVariant;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
};

export function StudioLoginCta({
  href,
  variant = "dark-full",
  className,
  children = DEFAULT_LABEL,
  disabled = false,
}: StudioLoginCtaProps) {
  const label = children;

  if (variant === "glass") {
    return (
      <Link
        href={href}
        aria-disabled={disabled}
        className={cn(
          "px-10 py-5 text-xl md:text-2xl font-semibold transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 relative overflow-hidden",
          disabled && "pointer-events-none opacity-70",
          className
        )}
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          color: "rgba(255, 255, 255, 0.95)",
          borderRadius: "9999px",
          boxShadow: `
                0 4px 16px rgba(0, 0, 0, 0.2),
                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                0 1px 0 rgba(255, 255, 255, 0.3) inset
              `,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "-20%",
            left: "10%",
            width: "60%",
            height: "40%",
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 100%)",
            borderRadius: "50%",
            filter: "blur(15px)",
            pointerEvents: "none",
          }}
        />
        <span>{label}</span>
        <ArrowRight className="h-5 w-5 shrink-0" strokeWidth={2} />
      </Link>
    );
  }

  if (variant === "lime") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex h-[54px] min-w-[176px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[#070907] px-8 text-[17px] font-semibold leading-none text-[#070907] transition-[background-color,box-shadow,filter] duration-200 hover:brightness-[0.97] hover:shadow-[0_4px_18px_-6px_rgba(185,255,75,0.65)] active:brightness-[0.98]",
          className
        )}
        style={{ backgroundColor: "#B9FF4B" }}
      >
        {label}
      </Link>
    );
  }

  if (variant === "green-pill") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1F4E3D] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#2E5A43] hover:shadow-xl",
          className
        )}
      >
        {label}
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  if (variant === "pognali") {
    return (
      <Link
        href={href}
        className={cn(
          "group relative z-10 inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-[1.08rem] border border-white/[0.14] bg-[#070907] px-10 py-[1.12rem] text-[1.2rem] font-semibold tracking-[-0.02em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_32px_-12px_rgba(185,255,75,0.22),0_24px_56px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(46,90,67,0.12)] outline-none ring-offset-[#F3F1EA] transition hover:border-white/[0.26] hover:bg-[#0c1410] sm:py-[1.34rem] sm:text-[1.32rem] md:text-[1.42rem]",
          className
        )}
        style={{ fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        <span className="relative z-10 flex items-center gap-3">
          {label}
          <ArrowRight
            className="h-[1.07em] w-[1.07em] transition group-hover:translate-x-1"
            strokeWidth={2.35}
          />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-semibold text-white shadow-[0_6px_20px_rgba(0,0,0,0.18)] transition-[background-color,box-shadow,transform] duration-200 hover:scale-[1.01] active:scale-[0.98]",
        className
      )}
      style={{ background: "#0a0a0a" }}
    >
      <span>{label}</span>
      <ArrowRight className="h-5 w-5 shrink-0" />
    </Link>
  );
}
