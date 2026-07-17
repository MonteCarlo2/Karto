"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  CREDIT_PHOTO_2K,
  CREDIT_PHOTO_4K,
  FLOW_CREDITS_BASE,
  FLOW_CREDITS_PACK_BLURB,
  getVideoPolicyProRows,
  getVideoPolicyStandardRows,
  getVideoPolicySyncPerSec,
} from "@/lib/credits-pricing";

function TariffRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-2.5 last:border-0">
      <span className="text-neutral-800 leading-snug">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{value}</span>
    </div>
  );
}

export function CreditsTariffModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const standardRows = getVideoPolicyStandardRows();
  const proRows = getVideoPolicyProRows();
  const syncRows = getVideoPolicySyncPerSec();
  const std720 = standardRows.find((r) => r.resolution === "720p");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            key="credits-tariff-backdrop"
            aria-label="Закрыть"
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            key="credits-tariff-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credits-tariff-title"
            className="fixed left-1/2 top-1/2 z-[61] w-[min(100vw-1.5rem,36rem)] max-h-[min(90vh,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200/90 bg-[#F5F5F0] shadow-2xl shadow-black/15"
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200/80 px-5 py-4">
              <div>
                <h2
                  id="credits-tariff-title"
                  className="text-base font-semibold text-neutral-900"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Таблица тарификации
                </h2>
                <p className="mt-1 text-xs text-neutral-500 leading-snug">
                  Все цены — в кредитах. Списание фиксируется на сервере при запуске генерации.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-200/80 hover:text-neutral-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(min(90vh,44rem)-5.5rem)] px-5 py-4 space-y-4 text-sm">
              <section className="rounded-xl border border-[#84CC16]/35 bg-[#84CC16]/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#365314] mb-1">
                  Базовое правило
                </p>
                <p className="text-sm font-semibold text-neutral-900">
                  {CREDIT_PHOTO_4K} кредитов = одно фото 4K
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Фото
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-1 text-sm">
                  <TariffRow label="Фото 4K" value={`${CREDIT_PHOTO_4K} кред.`} />
                  <TariffRow label="Фото 2K" value={`${CREDIT_PHOTO_2K} кред.`} />
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Видео «Стандарт» · без звука
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-1 text-sm">
                  {std720 ? (
                    <>
                      <TariffRow label="Стандарт 720p · 4 сек" value={`${std720.sec4} кред.`} />
                      <TariffRow label="Стандарт 720p · 8 сек" value={`${std720.sec8} кред.`} />
                      <TariffRow label="Стандарт 720p · 12 сек" value={`${std720.sec12} кред.`} />
                    </>
                  ) : null}
                  {standardRows
                    .filter((r) => r.resolution === "1080p")
                    .map((r) => (
                      <div key={r.resolution}>
                        <TariffRow label="Стандарт 1080p · 4 сек" value={`${r.sec4} кред.`} />
                        <TariffRow label="Стандарт 1080p · 8 сек" value={`${r.sec8} кред.`} />
                        <TariffRow label="Стандарт 1080p · 12 сек" value={`${r.sec12} кред.`} />
                      </div>
                    ))}
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  480p — дешевле (см. полную таблицу в Мастерской). Со звуком: ×2.
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Видео «Студия» · 1080p · без звука
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-1 text-sm">
                  {proRows.map((r) => (
                    <TariffRow
                      key={r.durationSec}
                      label={`Студия · ${r.durationSec} сек`}
                      value={`${r.tokens} кред.`}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">720p ≈ 62% от 1080p. Со звуком — ×2.</p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Видео «Синхрон» по эталону
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-1 text-sm">
                  {syncRows.map((r) => (
                    <TariffRow
                      key={r.resolution}
                      label={`Синхрон ${r.resolution}`}
                      value={`${r.perSec} кред./сек`}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Видео для товара
                </h3>
                <p className="text-sm text-neutral-700 leading-relaxed rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-2.5">
                  Те же ставки, что у «Студии» (5 или 10 сек, 720p / 1080p). Со звуком — ×2.
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  В Потоке
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-2.5 text-sm text-neutral-700 leading-relaxed">
                  <p className="font-semibold text-neutral-900 mb-1">
                    {FLOW_CREDITS_BASE.toLocaleString("ru-RU")} кредитов на запуск
                  </p>
                  <p>{FLOW_CREDITS_PACK_BLURB}</p>
                  <p className="mt-2 text-neutral-600">
                    Текст описания и анализ цены — 0 кредитов. Остаток сгорает при завершении Потока.
                  </p>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** @deprecated Используйте CreditsTariffModal */
export const VideoTokenPolicyModal = CreditsTariffModal;
