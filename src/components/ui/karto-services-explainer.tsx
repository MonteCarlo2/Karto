"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const PRIMARY = "#1F4E3D";
const LIME = "#84CC16";

/**
 * Кнопка + модалка: чем «Поток» отличается от «Свободного творчества».
 */
export function KartoServicesExplainer({
  variant = "link",
  className = "",
}: {
  variant?: "link" | "button";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "button"
            ? `inline-flex items-center gap-1.5 rounded-xl border border-[#2E5A43]/30 bg-gradient-to-br from-white to-[#f3f6f3] px-3 py-1.5 text-xs font-semibold text-[#1F4E3D] shadow-[0_2px_12px_rgba(31,78,61,0.08)] transition-all hover:border-[#2E5A43]/45 hover:shadow-[0_4px_20px_rgba(31,78,61,0.12)] ${className}`
            : `inline-flex items-center gap-1 text-xs font-semibold text-[#2E5A43] underline underline-offset-2 hover:text-[#14532d] ${className}`
        }
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} />
        Чем Поток отличается от свободного творчества?
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-[#1a2e24]/55 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="karto-explainer-title"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="fixed left-1/2 top-1/2 z-[201] w-[min(calc(100vw-1.25rem),44rem)] max-h-[min(88vh,680px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.35rem] border border-[#1F4E3D]/20 shadow-[0_32px_80px_-16px_rgba(15,40,30,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
              style={{
                background:
                  "linear-gradient(165deg, #f6f3ec 0%, #eef4ee 42%, #e2ebe4 100%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Декор: сетка + блик */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.045]"
                style={{
                  backgroundImage: `linear-gradient(to right, ${PRIMARY} 1px, transparent 1px), linear-gradient(to bottom, ${PRIMARY} 1px, transparent 1px)`,
                  backgroundSize: "24px 24px",
                }}
              />
              <div
                className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
                style={{ background: `radial-gradient(circle, ${LIME} 0%, transparent 70%)` }}
              />
              <div
                className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
                style={{ background: `radial-gradient(circle, ${PRIMARY} 0%, transparent 72%)` }}
              />

              <div
                className="relative flex items-start justify-between gap-3 border-b border-[#1F4E3D]/12 px-5 py-4 sm:px-6 sm:py-5"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(247,250,247,0.5) 100%)",
                }}
              >
                <div className="min-w-0 pr-6">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.22em] mb-2"
                    style={{ color: PRIMARY }}
                  >
                    KARTO
                  </p>
                  <h2
                    id="karto-explainer-title"
                    className="text-[1.6rem] sm:text-3xl md:text-[2.125rem] font-bold leading-[1.12] tracking-tight text-neutral-900"
                    style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
                  >
                    Чем{" "}
                    <span style={{ color: PRIMARY }}>Поток</span> отличается от{" "}
                    <span className="text-[#3f6212]">свободного творчества</span>
                  </h2>
                  <div
                    className="mt-3 h-1 w-14 sm:w-20 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${LIME} 0%, ${PRIMARY} 100%)`,
                    }}
                    aria-hidden
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-xl border border-neutral-200/80 bg-white/60 p-2 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-900"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="relative max-h-[calc(min(88vh,680px)-7.5rem)] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                  <div
                    className="relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-[0_8px_28px_-8px_rgba(54,83,20,0.2)]"
                    style={{
                      borderColor: "rgba(132, 204, 22, 0.45)",
                      background:
                        "linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(236,252,203,0.35) 55%, rgba(220,252,231,0.25) 100%)",
                    }}
                  >
                    <div
                      className="absolute right-0 top-0 h-24 w-24 rounded-bl-full opacity-[0.12]"
                      style={{ background: LIME }}
                    />
                    <h3
                      className="relative text-[11px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: "#3f6212" }}
                    >
                      Свободное творчество
                    </h3>
                    <p className="relative mt-2.5 text-sm leading-relaxed text-neutral-800">
                      Вы сами задаёте промпты, форматы фото и видео, режим «для товара». Пакеты
                      генераций изображений и видео-кредиты покупаются отдельно и{" "}
                      <strong className="font-semibold text-neutral-900">не открывают Поток</strong>.
                    </p>
                  </div>

                  <div
                    className="relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-[0_8px_28px_-8px_rgba(31,78,61,0.28)]"
                    style={{
                      borderColor: "rgba(31, 78, 61, 0.38)",
                      background:
                        "linear-gradient(210deg, rgba(255,255,255,0.97) 0%, rgba(236,253,245,0.55) 48%, rgba(209,250,229,0.38) 100%)",
                    }}
                  >
                    <div
                      className="absolute left-0 bottom-0 h-28 w-28 rounded-tr-full opacity-[0.15]"
                      style={{ background: PRIMARY }}
                    />
                    <div
                      className="absolute -right-6 top-0 h-20 w-20 rounded-full opacity-[0.08] blur-2xl"
                      style={{ background: LIME }}
                    />
                    <h3
                      className="relative text-[11px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: PRIMARY }}
                    >
                      Поток
                    </h3>
                    <p className="relative mt-2.5 text-sm leading-relaxed text-neutral-800">
                      Готовый путь карточки: этапы от «Понимания» до цены и результатов. Один запуск
                      Потока — отдельная покупка. Стартовые бонусы свободного творчества к Потоку{" "}
                      <strong className="font-semibold text-neutral-900">не применяются</strong>.
                    </p>
                  </div>
                </div>

                <div
                  className="mt-4 rounded-2xl border px-4 py-3.5 text-xs leading-relaxed sm:text-[13px]"
                  style={{
                    borderColor: "rgba(31, 78, 61, 0.14)",
                    background:
                      "linear-gradient(90deg, rgba(254,252,232,0.85) 0%, rgba(236,253,245,0.75) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                  }}
                >
                  <strong className="font-semibold text-neutral-900">Стартовый бонус:</strong> при
                  регистрации начисляются бесплатные генерации изображений в{" "}
                  <strong className="text-[#365314]">свободном творчестве</strong> и видео-кредиты —
                  они видны в профиле и в разделе свободного творчества, но{" "}
                  <strong className="font-semibold text-neutral-900">не заменяют покупку Потока</strong>.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/#pricing"
                    onClick={() => setOpen(false)}
                    className="inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                    style={{
                      background: `linear-gradient(135deg, ${PRIMARY} 0%, #163d30 100%)`,
                      boxShadow: "0 4px 16px rgba(31,78,61,0.3)",
                    }}
                  >
                    Цены и пакеты
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex rounded-xl border border-[#1F4E3D]/20 bg-white/80 px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
                  >
                    Понятно
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
