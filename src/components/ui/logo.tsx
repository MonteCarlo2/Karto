import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

/** Знак KARTO без текста (для узкой панели и компактных шапок). */
export function KartoLogoMark({
  className,
  size = 72,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      suppressHydrationWarning
    >
      <Image
        src="/logo-flow.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        priority
        unoptimized
        sizes={`${size}px`}
      />
    </div>
  );
}

export function Logo({
  className,
  maxWidth = 200,
  maxHeight = 130,
}: {
  className?: string;
  /** Макс. ширина wordmark (px). Для сайдбара workspace — ~280. */
  maxWidth?: number;
  maxHeight?: number;
}) {
  return (
    <div className={cn("flex items-center", className)} suppressHydrationWarning>
      <Image
        src="/logo.png"
        alt="KARTO"
        width={maxWidth}
        height={maxHeight}
        className="h-auto w-full max-w-full object-contain"
        priority
        unoptimized
        style={{
          width: "auto",
          height: "auto",
          maxWidth: `${maxWidth}px`,
          maxHeight: `${maxHeight}px`,
        }}
      />
    </div>
  );
}
