"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import {
  VIDEO_TOKEN_PACKAGES,
  getVideoPolicyStandardRows,
  getVideoPolicyProRows,
  getVideoPolicySyncPerSec,
} from "@/lib/video-token-pricing"

export function VideoTokenPolicyModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const standardRows = getVideoPolicyStandardRows()
  const proRows = getVideoPolicyProRows()
  const syncRows = getVideoPolicySyncPerSec()

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            key="policy-backdrop"
            aria-label="Закрыть"
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            key="policy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-policy-title"
            className="fixed left-1/2 top-1/2 z-[61] w-[min(100vw-1.5rem,28rem)] max-h-[min(88vh,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-200/90 bg-[#F5F5F0] shadow-2xl shadow-black/15"
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200/80 px-5 py-4">
              <div>
                <h2
                  id="video-policy-title"
                  className="text-base font-semibold text-neutral-900"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Ценовая политика видео
                </h2>
                <p className="mt-1 text-xs text-neutral-500 leading-snug">
                  Списание в токенах за один ролик. Звук (где доступен) умножает стоимость ×2. Итог фиксируется на сервере.
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

            <div className="overflow-y-auto max-h-[calc(min(88vh,36rem)-5.5rem)] px-5 py-4 space-y-5 text-sm">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Пакеты кредитов
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/70 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-neutral-200/80 bg-neutral-100/50 text-neutral-600">
                        <th className="px-2.5 py-2 font-semibold">Пакет</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Токены</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VIDEO_TOKEN_PACKAGES.map((p) => (
                        <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                          <td className="px-2.5 py-2 text-neutral-800">{p.name}</td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-neutral-800">
                            {p.tokens.toLocaleString("ru-RU")}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-neutral-800">
                            {p.priceRub} ₽
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Стандарт (без звука)
                </h3>
                <div className="rounded-xl border border-neutral-200/80 bg-white/70 overflow-x-auto text-xs">
                  <table className="w-full text-left min-w-[260px]">
                    <thead>
                      <tr className="border-b border-neutral-200/80 bg-neutral-100/50 text-neutral-600">
                        <th className="px-2 py-2 font-semibold">Качество</th>
                        <th className="px-2 py-2 font-semibold text-right">4 сек</th>
                        <th className="px-2 py-2 font-semibold text-right">8 сек</th>
                        <th className="px-2 py-2 font-semibold text-right">12 сек</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standardRows.map((r) => (
                        <tr key={r.resolution} className="border-b border-neutral-100 last:border-0">
                          <td className="px-2 py-2 font-medium text-neutral-800">{r.resolution}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.sec4}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.sec8}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.sec12}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">Со звуком: значения ×2.</p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Студия PRO · 1080p
                </h3>
                <ul className="rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2 space-y-1 text-xs text-neutral-800">
                  {proRows.map((r) => (
                    <li key={r.durationSec} className="flex justify-between tabular-nums">
                      <span>{r.durationSec} сек</span>
                      <span className="font-medium">{r.tokens} ток.</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-neutral-500">Со звуком: ×2.</p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Синхрон по эталону
                </h3>
                <ul className="rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2 space-y-1 text-xs text-neutral-800">
                  {syncRows.map((r) => (
                    <li key={r.resolution} className="flex justify-between">
                      <span>{r.resolution}</span>
                      <span className="font-medium tabular-nums">{r.perSec} ток./сек</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 mb-2">
                  Видео для товара
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed rounded-xl border border-neutral-200/80 bg-white/70 px-3 py-2">
                  Те же базовые значения, что у Студии PRO; для 720p стоимость ниже (~62% от 1080p). Со звуком — ×2.
                </p>
              </section>

              <p className="text-[11px] text-neutral-500 leading-relaxed pb-1">
                Пример: пакет 1&nbsp;250 ток. — около 8–9 роликов Стандарт 720p, 8&nbsp;сек без звука (140 ток. за ролик) или около 16 роликов 4&nbsp;сек (75 ток.).
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
