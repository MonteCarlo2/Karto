"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { hubSans } from "@/components/seller-hub/hub-ui";

/** Окно «Список изменений»: минималистичная история обновлений по месяцам. */
export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={hubSans}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Список изменений"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[min(82vh,680px)] w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] border border-black/[0.1] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-3 pt-5">
              <h3 className="text-[17px] font-semibold text-[var(--hub-text)]">Список изменений</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--hub-text-muted)] outline-none transition-colors hover:bg-black/[0.06]"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              {CHANGELOG.map((month, i) => (
                <section key={month.id} className={i === 0 ? "" : "mt-6 border-t border-black/[0.08] pt-5"}>
                  <h4 className="mb-3 text-[13px] font-medium text-[var(--hub-text-subtle)]">{month.title}</h4>
                  <ul className="space-y-3">
                    {month.items.map((item) => (
                      <li key={`${item.date}-${item.text.slice(0, 24)}`} className="grid grid-cols-[96px_1fr] gap-4 text-[15px] leading-[1.55]">
                        <span className="text-[var(--hub-text-subtle)]">{item.date}</span>
                        <span className="text-[var(--hub-text)]">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
