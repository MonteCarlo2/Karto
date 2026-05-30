"use client";

import { cn } from "@/lib/utils";

type KartoAiOrbProps = {
  size?: number;
  className?: string;
  durationSec?: number;
};

/** Живой AI-orb в духе Siri — палитра KARTO (зелёный + салат). */
export function KartoAiOrb({ size = 52, className, durationSec = 16 }: KartoAiOrbProps) {
  return (
    <div
      className={cn("karto-ai-orb shrink-0", className)}
      style={
        {
          width: size,
          height: size,
          "--karto-orb-duration": `${durationSec}s`,
          "--karto-orb-blur": `${Math.max(size * 0.11, 5)}px`,
          "--karto-orb-contrast": Math.max(size * 0.032, 1.55),
        } as React.CSSProperties
      }
      aria-hidden
    />
  );
}
