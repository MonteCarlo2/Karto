"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Props = {
  value: string;
  onChange: (value: string) => void;
  rotatingPlaceholder: string;
};

const typographyClass =
  "font-semibold leading-[1.06] tracking-[-0.06em]";

/** Нижний предел как доля от максимального кегля на брейкпоинте (~56% — раньше перестаём жать размер). */
const MIN_SCALE_OF_MAX = 0.56;

/** Абсолютный минимум кегля (px): ниже не опускаемся даже при очень длинном названии. */
const ABSOLUTE_MIN_FONT_PX = 60;

function fitFontPx(params: {
  measure: HTMLElement;
  probe: HTMLElement;
  text: string;
  containerWidth: number;
}): number {
  const { measure, probe, text, containerWidth } = params;
  const csProbe = getComputedStyle(probe);
  const maxPx = parseFloat(csProbe.fontSize);
  if (!Number.isFinite(maxPx) || maxPx <= 0) return 48;

  const minPx = Math.min(
    Math.round(maxPx),
    Math.max(
      ABSOLUTE_MIN_FONT_PX,
      Math.round(maxPx * MIN_SCALE_OF_MAX),
    ),
  );
  const avail = Math.max(48, containerWidth - 2);

  measure.textContent = text.length > 0 ? text : "\u00a0";
  measure.style.fontFamily = csProbe.fontFamily;
  measure.style.fontWeight = csProbe.fontWeight;
  measure.style.fontStyle = csProbe.fontStyle;
  measure.style.letterSpacing = csProbe.letterSpacing;
  measure.style.lineHeight = csProbe.lineHeight;

  let low = minPx;
  let high = Math.round(maxPx);
  let best = minPx;

  while (low <= high) {
    const mid = Math.round((low + high) / 2);
    measure.style.fontSize = `${mid}px`;
    if (measure.scrollWidth <= avail) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.min(Math.max(best, minPx), Math.round(maxPx));
}

export function BrandNameHeroInput({ value, onChange, rotatingPlaceholder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);

  const textLine = value.trim().length > 0 ? value : rotatingPlaceholder;

  const refit = useCallback(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    const measure = measureRef.current;
    if (!container || !probe || !measure) return;

    const cs = getComputedStyle(container);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const inner = container.clientWidth - padL - padR;

    const px = fitFontPx({
      measure,
      probe,
      text: textLine,
      containerWidth: inner,
    });
    setFontPx(px);
  }, [textLine]);

  useLayoutEffect(() => {
    refit();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => refit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [refit]);

  useLayoutEffect(() => {
    const onResize = () => refit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refit]);

  const fluidStyle =
    fontPx != null
      ? ({ fontSize: `${fontPx}px`, lineHeight: 1.06 } as const)
      : undefined;

  const responsiveFallback = fontPx == null ? "text-7xl sm:text-8xl md:text-9xl" : "";

  return (
    <div
      ref={containerRef}
      className="relative z-10 mt-9 w-full max-w-[min(94vw,76rem)] pr-[min(5vw,calc(4.5rem-10ch))] lg:pr-[min(14vw,calc(11rem-10ch))]"
    >
      <span
        ref={probeRef}
        className={`pointer-events-none absolute left-0 top-0 -z-10 select-none whitespace-nowrap text-7xl opacity-0 sm:text-8xl md:text-9xl ${typographyClass}`}
        aria-hidden
      >
        A
      </span>
      <span
        ref={measureRef}
        className={`pointer-events-none absolute left-0 top-0 -z-10 select-none whitespace-nowrap opacity-0 ${typographyClass}`}
        aria-hidden
      />

      {!value && (
        <motion.span
          key={rotatingPlaceholder}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
          className={`pointer-events-none absolute left-0 top-0 z-[1] text-neutral-300/80 ${typographyClass} ${responsiveFallback}`}
          style={fluidStyle}
        >
          {rotatingPlaceholder}
        </motion.span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=""
        autoFocus
        className={`relative z-10 min-w-0 w-full max-w-full border-0 bg-transparent text-[#070907] caret-[#2E5A43] outline-none ${typographyClass} ${responsiveFallback}`}
        style={fluidStyle}
      />
    </div>
  );
}
