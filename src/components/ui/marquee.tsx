"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type MarqueeProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
  pauseOnHover?: boolean
  vertical?: boolean
  reverse?: boolean
  repeat?: number
  duration?: number
}

export function Marquee({
  className,
  reverse,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 6,
  duration = 28,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...props}
      className={cn(
        "group flex overflow-hidden [--gap:0.5rem] [gap:var(--gap)]",
        vertical ? "flex-col" : "flex-row",
        className
      )}
      style={{ ["--duration" as string]: `${duration}s` } as React.CSSProperties}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          className={cn("flex shrink-0 [gap:var(--gap)]", vertical ? "flex-col" : "flex-row")}
          style={{
            animation: `${vertical ? "marquee-vertical" : "marquee-horizontal"} var(--duration) linear infinite`,
            animationDirection: reverse ? "reverse" : "normal",
            animationPlayState: pauseOnHover ? "running" : undefined,
          }}
        >
          {children}
        </div>
      ))}

      <style>{`
        @keyframes marquee-horizontal {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-100% - var(--gap))); }
        }
        @keyframes marquee-vertical {
          from { transform: translateY(0); }
          to { transform: translateY(calc(-100% - var(--gap))); }
        }
        .group:hover > div {
          animation-play-state: ${pauseOnHover ? "paused" : "running"};
        }
      `}</style>
    </div>
  )
}

