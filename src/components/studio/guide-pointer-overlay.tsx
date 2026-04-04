"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Лёгкая подсказка под кнопкой «инструкция»: рукописная стрелка вверх + текст на фоне сетки, без блоков и рамок.
 */
export function GuidePointerOverlay({
  onDismiss,
  /** Необязательная короткая строчка мельче основного текста */
  subtitle,
}: {
  onDismiss: () => void;
  subtitle?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-full z-[55] mt-1 w-[5.75rem] -translate-x-1/2"
      aria-live="polite"
    >
      <div className="pointer-events-auto relative flex flex-col items-center">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute -right-3 -top-2 z-[1] rounded-full p-0.5 text-[#1F4E3D]/35 transition-colors hover:text-[#1F4E3D]/65"
          aria-label="Скрыть подсказку"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>

        <motion.div
          className="-mb-1 -mt-5 text-[#1F4E3D]/55"
          animate={{ y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          aria-hidden
        >
          <svg
            width="60"
            height="82"
            viewBox="0 0 60 82"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="overflow-visible drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]"
          >
            {/* Витая «рукописная» стрелка: петля в середине, наконечник вверх */}
            <path
              d="M30 79 C12 73 4 58 14 48 C22 40 36 46 40 34 C44 22 34 14 26 12 C20 10 18 6 22 3 C25 1 28 1 30 2.5"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M30 2.5 L23 10 M30 2.5 L36 9"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </motion.div>

        <p
          className="max-w-[5.5rem] text-center text-[11px] font-medium italic leading-tight tracking-wide text-[#2E5A43]/78"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.85)" }}
        >
          Лучше прочитать
        </p>
        {subtitle ? (
          <p
            className="mt-0.5 max-w-[6.5rem] text-center text-[9px] font-normal leading-snug text-[#64748B]/85"
            style={{ textShadow: "0 1px 0 rgba(255,255,255,0.8)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
