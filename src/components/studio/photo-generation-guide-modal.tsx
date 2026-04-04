"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  ImageIcon,
  CheckCircle2,
  Layers,
} from "lucide-react";

interface PhotoGenerationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PhotoGenerationGuideModal({ isOpen, onClose }: PhotoGenerationGuideModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[52] bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-guide-title"
            initial={{ opacity: 0, x: 420 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 420 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[53] flex w-full max-w-xl flex-col bg-[#FAFAF8] font-sans antialiased shadow-[-12px_0_48px_rgba(15,23,42,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col">
              <header className="shrink-0 border-b border-gray-200/90 bg-white px-6 pb-5 pt-6 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1F4E3D]/75">
                      Фото · Свободное творчество и «Для товара»
                    </p>
                    <h2
                      id="photo-guide-title"
                      className="mt-2 text-2xl font-bold leading-[1.2] tracking-tight text-gray-900 sm:text-[1.65rem]"
                    >
                      Инструкция по фото-генерации
                    </h2>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
                      Несколько минут внимания — меньше разочарований и лишних генераций. Нейросеть
                      не заменяет дизайнера: она интерпретирует ваш текст и референсы.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                    aria-label="Закрыть инструкцию"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#1F4E3D]/12 bg-[#F0FDF4]/60 px-3 py-2.5 text-[13px] text-[#1F4E3D]">
                  <BookOpen className="h-4 w-4 shrink-0 text-[#84CC16]" />
                  <span className="font-medium leading-snug">
                    Советы одинаково полезны в режиме «Свободное творчество» и «Для товара».
                  </span>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 text-[15px] leading-[1.7] text-gray-700 [scrollbar-gutter:stable]">
                <section className="mb-8">
                  <div className="mb-3 flex items-center gap-2 text-[#1F4E3D]">
                    <Lightbulb className="h-4 w-4 shrink-0 text-[#84CC16]" />
                    <h3 className="text-[15px] font-bold">Как писать промпт</h3>
                  </div>
                  <ul className="list-disc space-y-2 pl-5 text-[14px]">
                    <li>
                      Опишите сцену конкретно: где находится объект, освещение, фон, настроение
                      (например: «мягкий дневной свет, светлая кухня, минимализм»).
                    </li>
                    <li>
                      Одна основная идея за раз. Слишком много деталей в одном запросе повышает
                      риск «каши» и артефактов.
                    </li>
                    <li>
                      Если нужен стиль — назовите его словами (реализм, студийное фото, иллюстрация
                      и т.п.), без противоречий.
                    </li>
                  </ul>
                </section>

                <section className="mb-8">
                  <div className="mb-3 flex items-center gap-2 text-[#1F4E3D]">
                    <Layers className="h-4 w-4 shrink-0 text-[#84CC16]" />
                    <h3 className="text-[15px] font-bold">Режим «Для товара»</h3>
                  </div>
                  <p className="text-[14px]">
                    Загрузите чёткое фото товара. Модель опирается на него: чем лучше исходник, тем
                    стабильнее силуэт и материалы. Если результат «уплывает» от товара — упростите
                    фон в промпте или попробуйте другой ракурс в описании.
                  </p>
                </section>

                <section className="mb-8">
                  <div className="mb-3 flex items-center gap-2 text-[#1F4E3D]">
                    <ImageIcon className="h-4 w-4 shrink-0 text-[#84CC16]" />
                    <h3 className="text-[15px] font-bold">Формат кадра</h3>
                  </div>
                  <p className="text-[14px]">
                    Соотношение сторон (например 3:4, 9:16, 1:1) влияет на композицию. Для карточки
                    маркетплейса заранее подумайте, как кадр обрежется на площадке — иногда лучше
                    оставить больше «воздуха» по краям.
                  </p>
                </section>

                <section className="mb-8 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <h3 className="text-[15px] font-bold">Риски и ограничения AI</h3>
                  </div>
                  <ul className="list-disc space-y-2 pl-5 text-[14px] text-amber-950/90">
                    <li>
                      Возможны артефакты: лишние пальцы, искажённый текст, «шум» в мелких деталях.
                      Всегда проверяйте результат глазами перед публикацией.
                    </li>
                    <li>
                      Текст на изображении (логотипы, цены) часто выходит неточно — для важных надписей
                      лучше доработать макет отдельно.
                    </li>
                    <li>
                      Результат зависит от модели и настроек: не каждая попытка будет «идеальной» с
                      первого раза — это нормально.
                    </li>
                  </ul>
                </section>

                <section className="mb-6">
                  <div className="mb-3 flex items-center gap-2 text-[#1F4E3D]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#84CC16]" />
                    <h3 className="text-[15px] font-bold">Маркетплейсы и правила</h3>
                  </div>
                  <p className="text-[14px]">
                    Требования Wildberries, Ozon, Яндекс Маркета и др. к фото и запрещённому контенту
                    остаются на стороне площадки. KARTO помогает визуализировать идеи, но ответственность
                    за соответствие правилам площадки и закону — у продавца.
                  </p>
                </section>

                <p className="border-t border-gray-200 pt-5 text-center text-[13px] leading-relaxed text-gray-500">
                  Сохраняйте удачные промпты и варианты — так вы быстрее находите свой стиль. Удачных
                  генераций!
                </p>
              </div>

              <footer className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-[#1F4E3D] py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1a4535]"
                >
                  Понятно, закрыть инструкцию
                </button>
              </footer>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function PhotoGenerationGuideTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group flex max-w-[11rem] flex-col items-center gap-1.5 rounded-2xl border-2 border-[#1F4E3D]/20 bg-white px-3 py-2.5 text-center shadow-md shadow-[#1F4E3D]/10 transition-colors hover:border-[#1F4E3D]/40 hover:bg-[#F0FDF4]/80"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1F4E3D] text-white shadow-inner ring-2 ring-[#84CC16]/30">
        <ImageIcon className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-[#1F4E3D]">
        Перед генерацией
      </span>
      <span className="text-[9px] font-semibold leading-snug text-gray-500 group-hover:text-gray-700">
        Инструкция по фото
      </span>
    </motion.button>
  );
}
