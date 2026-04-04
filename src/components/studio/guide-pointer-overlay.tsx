"use client";

import { motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";

/** Подсказка над кнопкой «инструкция»: короткий текст + «машущая» стрелка вниз. */
export function GuidePointerOverlay({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-full left-1/2 z-[55] mb-0.5 flex -translate-x-1/2 flex-col items-center">
      <div className="relative max-w-[13.5rem] rounded-xl border border-[#2E5A43]/18 bg-white/95 px-3 py-2 pr-7 shadow-[0_8px_28px_rgba(31,78,61,0.15)] backdrop-blur-sm">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-1 top-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Скрыть подсказку"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="text-center text-[10px] font-semibold leading-snug text-[#1F4E3D]">{message}</p>
      </div>
      <motion.div
        animate={{ y: [0, 5, 0] }}
        transition={{ repeat: Infinity, duration: 1.15, ease: "easeInOut" }}
        aria-hidden
      >
        <ChevronDown className="h-5 w-5 text-[#84CC16]" strokeWidth={2.5} />
      </motion.div>
    </div>
  );
}
