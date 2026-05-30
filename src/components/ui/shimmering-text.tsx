"use client";

import { useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

type ShimmeringTextProps = {
  text: string;
  duration?: number;
  delay?: number;
  repeat?: boolean;
  repeatDelay?: number;
  className?: string;
  startOnView?: boolean;
  once?: boolean;
  spread?: number;
  color?: string;
  shimmerColor?: string;
};

export function ShimmeringText({
  text,
  duration = 2,
  delay = 0,
  repeat = true,
  repeatDelay = 0.5,
  className,
  startOnView = false,
  once = false,
  spread = 2,
  color = "rgba(46,90,67,0.72)",
  shimmerColor = "#2E5A43",
}: ShimmeringTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once, margin: "-10% 0px" });
  const dynamicSpread = useMemo(() => text.length * spread, [text, spread]);
  const shouldAnimate = !startOnView || isInView;

  return (
    <motion.span
      ref={ref}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[background-repeat:no-repeat,padding-box]",
        className
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage: `linear-gradient(90deg, transparent calc(50% - var(--spread)), ${shimmerColor}, transparent calc(50% + var(--spread))), linear-gradient(${color}, ${color})`,
        } as React.CSSProperties
      }
      initial={{ backgroundPosition: "100% center", opacity: 0.85 }}
      animate={
        shouldAnimate
          ? { backgroundPosition: "0% center", opacity: 1 }
          : undefined
      }
      transition={{
        backgroundPosition: {
          repeat: repeat ? Infinity : 0,
          duration,
          delay,
          repeatDelay,
          ease: "linear",
        },
        opacity: { duration: 0.25, delay },
      }}
    >
      {text}
    </motion.span>
  );
}
