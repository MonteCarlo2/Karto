import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Новый логотип KARTO (design/logo/kit): векторные SVG без полей.
 * Прежний PNG был с большими пустыми полями, и размеры во всех вызовах (maxWidth/maxHeight, size)
 * подобраны под него. Чтобы ничего не раздувалось и вызывающий код не менять, масштабируем здесь.
 */
const LOGO_FIT = 0.73; // доля видимой ширины старого файла
const MARK_FIT = 0.86; // доля видимой ширины старого знака
const LOGO_ASPECT = 1454 / 431; // ширина / высота комплекта «знак + слово»

/** «light» для светлых фонов, «dark» для тёмных (рамка и буквы кремовые, салатовый неоновый). */
export type LogoTone = "light" | "dark";

const LOGO_SRC: Record<LogoTone, string> = {
  light: "/brand/karto-logo-primary.svg",
  dark: "/brand/karto-logo-ondark.svg",
};
const MARK_SRC: Record<LogoTone, string> = {
  light: "/brand/karto-mark-primary.svg",
  dark: "/brand/karto-mark-ondark.svg",
};

/** Знак KARTO без слова (для узкой панели и компактных шапок). */
export function KartoLogoMark({
  className,
  size = 72,
  tone = "light",
}: {
  className?: string;
  size?: number;
  tone?: LogoTone;
}) {
  const inner = Math.round(size * MARK_FIT);
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      suppressHydrationWarning
    >
      <Image
        src={MARK_SRC[tone]}
        alt=""
        width={inner}
        height={inner}
        className="h-full w-full object-contain"
        style={{ width: inner, height: inner }}
        priority
        unoptimized
      />
    </div>
  );
}

export function Logo({
  className,
  maxWidth = 200,
  maxHeight = 130,
  tone = "light",
}: {
  className?: string;
  /** Макс. ширина (px), как у прежнего логотипа. Для сайдбара workspace — ~280. */
  maxWidth?: number;
  maxHeight?: number;
  tone?: LogoTone;
}) {
  const width = Math.round(maxWidth * LOGO_FIT);
  const height = Math.round(width / LOGO_ASPECT);
  return (
    <div className={cn("flex items-center", className)} suppressHydrationWarning>
      <Image
        src={LOGO_SRC[tone]}
        alt="KARTO"
        width={width}
        height={height}
        className="h-auto w-full max-w-full object-contain"
        priority
        unoptimized
        style={{
          width: "auto",
          height: "auto",
          maxWidth: `${width}px`,
          maxHeight: `${maxHeight}px`,
        }}
      />
    </div>
  );
}
