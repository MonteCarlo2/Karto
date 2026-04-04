"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  Clapperboard,
  ImageIcon,
  Video,
  CheckCircle2,
  Zap,
} from "lucide-react";

/** Файлы в public/guides/free-video/ — см. README.txt; при отсутствии файла — плейсхолдер. */
const GUIDE_MEDIA = {
  standardImage: "/guides/free-video/standard-example.png",
  standardVideo: "/guides/free-video/standard-example.mp4",
  proImage: "/guides/free-video/pro-example.png",
  proVideo: "/guides/free-video/pro-example.mp4",
  syncImage: "/guides/free-video/sync-example.png",
  syncReferenceVideo: "/guides/free-video/sync-reference-example.mp4",
  syncResultVideo: "/guides/free-video/sync-result-example.mp4",
} as const;

function GuideExampleSlot({
  type,
  src,
  label,
  caption,
  videoMuted = true,
  /** «Синхрон»: вертикальные превью 9:16; «Стандарт»/«Про»: широкий 16:9. */
  frame = "landscape",
}: {
  type: "image" | "video";
  src: string;
  label: string;
  /** Короткая подпись над превью (роль файла в примере). */
  caption?: string;
  videoMuted?: boolean;
  frame?: "landscape" | "portrait";
}) {
  const [failed, setFailed] = useState(false);

  const aspectClass =
    frame === "portrait" ? "aspect-[9/16]" : "aspect-video";

  const placeholder = (
    <div
      className={`flex ${aspectClass} min-h-0 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/10 bg-gradient-to-br from-gray-50 to-gray-100/80 px-4 py-6 text-center`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-[#1F4E3D]/70">
        Пример
      </span>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        Здесь будет {type === "image" ? "изображение" : "видео"}-пример для «{label}».
        <br />
        <span className="font-mono text-[10px] text-gray-400">{src}</span>
      </p>
    </div>
  );

  return (
    <figure className="m-0 flex flex-col gap-2">
      {caption ? (
        <figcaption className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
          {caption}
        </figcaption>
      ) : null}
      {failed ? (
        placeholder
      ) : type === "image" ? (
        /* Фикс. соотношение сторон + object-cover: без «пустых» полос, как у соседнего видео */
        <div
          className={`relative ${aspectClass} w-full overflow-hidden rounded-xl bg-neutral-200/80 shadow-md ring-1 ring-black/8`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Пример: ${label}`}
            className="absolute inset-0 h-full w-full object-cover object-center"
            onError={() => setFailed(true)}
          />
        </div>
      ) : (
        <div
          className={`relative ${aspectClass} w-full overflow-hidden rounded-xl bg-black/10 shadow-md ring-1 ring-black/8`}
        >
          <video
            src={src}
            className="h-full w-full object-cover object-center"
            controls
            playsInline
            muted={videoMuted}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </figure>
  );
}

interface VideoGenerationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Подзаголовок в шапке (например «Свободное творчество» vs «Для товара»). */
  contextLabel?: string;
}

export function VideoGenerationGuideModal({
  isOpen,
  onClose,
  contextLabel = "Свободное творчество · Видео",
}: VideoGenerationGuideModalProps) {
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
          {/* Как у «Сообщение о баге»: затемнение + панель справа */}
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
            aria-labelledby="video-guide-title"
            initial={{ opacity: 0, x: 420 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 420 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[53] flex w-full max-w-xl flex-col bg-[#FAFAF8] font-sans antialiased shadow-[-12px_0_48px_rgba(15,23,42,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col">
              {/* Заголовок всегда виден — не уезжает при прокрутке */}
              <header className="shrink-0 border-b border-gray-200/90 bg-white px-6 pb-5 pt-6 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1F4E3D]/75">
                      {contextLabel}
                    </p>
                    <h2
                      id="video-guide-title"
                      className="mt-2 text-2xl font-bold leading-[1.2] tracking-tight text-gray-900 sm:text-[1.65rem]"
                    >
                      Инструкция по видео-генерации
                    </h2>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-600">
                      Сначала прочитайте вводную и общие советы — затем раздел про выбранный
                      режим. Так проще получить предсказуемый ролик и не тратить генерации
                      впустую.
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
                    Ниже — режимы «Стандарт», «Про» и «Синхрон» с настройками и примерами.
                  </span>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 text-[15px] leading-[1.7] text-gray-700 [scrollbar-gutter:stable]">
              {/* Общие рекомендации */}
              <section className="mb-8">
                <div className="mb-3 flex items-center gap-2 text-[#1F4E3D]">
                  <Lightbulb className="h-4 w-4 shrink-0 text-[#84CC16]" />
                  <h3 className="text-[15px] font-bold">Общие рекомендации</h3>
                </div>

                <div className="mb-5 rounded-2xl border-2 border-[#84CC16]/55 bg-gradient-to-br from-[#ecfccb] via-[#f7fee7] to-white p-4 shadow-[0_8px_30px_rgba(132,204,22,0.18)] ring-1 ring-[#84CC16]/25">
                  <div className="flex gap-3.5">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1F4E3D] text-[#ecfccb] shadow-inner"
                      aria-hidden
                    >
                      <Zap className="h-5 w-5" strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#3f6212]">
                        Важный совет
                      </p>
                      <p className="mt-1.5 text-[17px] font-extrabold leading-snug tracking-tight text-[#1a2e05]">
                        Промпт — основа результата
                      </p>
                      <p className="mt-2.5 text-[14px] font-medium leading-[1.65] text-[#3f6212]">
                        Опишите сцену, движение камеры (или наоборот — статику), освещение,
                        настроение, стиль (кино, реклама, минимализм и т.д.).{" "}
                        <span className="font-semibold text-[#365314]">
                          Чем конкретнее текст, тем меньше случайностей
                        </span>{" "}
                        — и тем предсказуемее кадр.
                      </p>
                    </div>
                  </div>
                </div>

                <ul className="space-y-2.5 pl-1">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#84CC16]" />
                    <span>
                      <strong>Перед запуском проверьте настройки:</strong> режим (Стандарт /
                      Про / Синхрон), длительность, качество, соотношение сторон, звук,
                      референсы — они должны соответствовать вашей задаче.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#84CC16]" />
                    <span>
                      Видео-генерация — <strong>ресурсоёмкий процесс</strong>: одна попытка
                      списывает генерацию. Лучше потратить минуту на уточнение промпта, чем
                      несколько раз перезапускать «наугад».
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#84CC16]" />
                    <span>
                      Если сервис отвечает ошибкой вроде «временно недоступно» — это может
                      быть ограничение на стороне обработки; подождите и повторите позже.
                    </span>
                  </li>
                </ul>
              </section>

              {/* Стандарт */}
              <section className="mb-8 rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#84CC16]" />
                  <h3 className="text-[15px] font-bold text-[#1F4E3D]">Режим «Стандарт»</h3>
                </div>
                <p className="mb-3 text-gray-600">
                  Универсальная модель для <strong>большинства повседневных задач</strong>:
                  короткие ролики для соцсетей, превью, несложные сюжеты, тесты идей. В основе
                  лежит <strong>современная «лёгкая» видео-модель</strong> — без углубления в
                  технические названия: она ориентирована на понятный результат и удобные
                  настройки.
                </p>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  Настройки и возможности
                </p>
                <ul className="mb-4 list-inside list-disc space-y-1 text-gray-600">
                  <li>Несколько вариантов <strong>формата кадра</strong> (вертикаль, квадрат, кино и др.).</li>
                  <li>
                    <strong>Длительность</strong> 4 / 8 / 12 секунд — выберите под площадку
                    (Stories, Reels и т.д.).
                  </li>
                  <li>
                    <strong>Качество</strong> до 1080p — для черновиков можно ниже, для финала
                    выше.
                  </li>
                  <li>
                    <strong>Звук</strong> — включайте, только если нужна атмосфера/музыка в
                    кадре; иначе оставьте выкл.
                  </li>
                  <li>
                    <strong>Статичная камера</strong> — если нужен штатив без «полёта»; для
                    динамики отключите.
                  </li>
                  <li>
                    До <strong>двух референс-изображений по желанию</strong> — стиль, персонаж,
                    продукт; можно не прикреплять ни одного и описать всё только промптом.
                  </li>
                </ul>
                <div className="mb-3 rounded-xl border border-[#1F4E3D]/18 bg-gradient-to-br from-[#F0FDF4] to-white px-3.5 py-3 text-[13px] leading-snug text-[#1b4332] shadow-sm ring-1 ring-[#1F4E3D]/5">
                  <strong className="text-[#1F4E3D]">Референс-изображение необязательно.</strong>{" "}
                  На иллюстрации ниже показан вариант <em>с</em> опорной картинкой для наглядности.
                  Генерация в «Стандарте» доступна и <strong>только по тексту</strong>, без загрузки
                  фото.
                </div>
                <p className="mb-2 text-[12px] font-semibold text-gray-500">
                  Пример: опорное фото + итоговый ролик
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <GuideExampleSlot
                    type="image"
                    src={GUIDE_MEDIA.standardImage}
                    label="Стандарт"
                    caption="Опорное фото (по желанию)"
                  />
                  <GuideExampleSlot
                    type="video"
                    src={GUIDE_MEDIA.standardVideo}
                    label="Стандарт"
                    caption="Пример результата"
                    videoMuted={false}
                  />
                </div>
              </section>

              {/* Про */}
              <section className="mb-8 rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-[#84CC16]" />
                  <h3 className="text-[15px] font-bold text-[#1F4E3D]">Режим «Про»</h3>
                </div>
                <p className="mb-3 text-gray-600">
                  <strong>Pro</strong> — для сцен, где важнее выразительность, детализация и
                  «киношность». Подходит для более сложных описаний, рекламных задумок и
                  акцентного визуала. Система сама выбирает ветку:{" "}
                  <strong>только текст</strong> или <strong>текст + одно опорное изображение</strong>{" "}
                  — в зависимости от того, загрузили вы картинку или нет.
                </p>
                <ul className="mb-4 list-inside list-disc space-y-1 text-gray-600">
                  <li>
                    <strong>Форматы кадра</strong> — набор уже под «сильные» вертикальные и
                    широкие композиции.
                  </li>
                  <li>
                    <strong>Длительность</strong> 5 или 10 секунд — под более развёрнутый
                    монтажный такт.
                  </li>
                  <li>
                    <strong>Качество</strong> фиксировано под высокую детализацию (как в
                    интерфейсе).
                  </li>
                  <li>
                    Не больше <strong>одного</strong> референс-изображения, если вы его
                    добавляете — заранее решите, что удерживать (лицо, товар, стиль). Без фото
                    режим работает <strong>только по промпту</strong>.
                  </li>
                </ul>
                <div className="mb-3 rounded-xl border border-[#1F4E3D]/18 bg-gradient-to-br from-[#F0FDF4] to-white px-3.5 py-3 text-[13px] leading-snug text-[#1b4332] shadow-sm ring-1 ring-[#1F4E3D]/5">
                  <strong className="text-[#1F4E3D]">Референс-изображение необязательно.</strong>{" "}
                  Пример с картинкой ниже — лишь один из сценариев; для «Про» достаточно
                  текстового описания, если вам не нужна опора на фото.
                </div>
                <p className="mb-2 text-[12px] font-semibold text-gray-500">
                  Пример: опорное фото + итоговый ролик
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <GuideExampleSlot
                    type="image"
                    src={GUIDE_MEDIA.proImage}
                    label="Про"
                    caption="Опорное фото (по желанию)"
                  />
                  <GuideExampleSlot
                    type="video"
                    src={GUIDE_MEDIA.proVideo}
                    label="Про"
                    caption="Пример результата"
                    videoMuted={false}
                  />
                </div>
              </section>

              {/* Синхрон */}
              <section className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Video className="h-4 w-4 text-amber-700" />
                  <h3 className="text-[15px] font-bold text-[#1F4E3D]">Режим «Синхрон»</h3>
                </div>
                <p className="mb-3 text-gray-700">
                  Самый <strong>специализированный</strong> режим: вы задаёте{" "}
                  <strong>изображение персонажа или объекта</strong> и{" "}
                  <strong>эталонное видео с движением</strong>. Платформа старается{" "}
                  <strong>перенести движение</strong> с видео на то, что на картинке. Это не
                  «обычная» генерация с нуля — требования к входным файлам строже.
                </p>
                <div className="mb-3 flex gap-2 rounded-lg bg-amber-100/60 p-3 text-[12px] text-amber-950">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  <p>
                    <strong>Частые ошибки и сбои</strong> чаще всего связаны не с «поломкой
                    кнопки», а с тем, что <strong>входы не подходят под задачу</strong>: плохо
                    читаемый силуэт, несовпадение позы, слишком тяжёлое или длинное видео,
                    сильный шум. В таких случаях обработка может завершиться ошибкой — это
                    нормальная реакция системы. Упростите сцену, сократите ролик, улучшите
                    контраст фигуры на фото.
                  </p>
                </div>
                <ul className="mb-3 list-inside list-disc space-y-1 text-gray-600">
                  <li>
                    Обязательно: <strong>ровно одно фото</strong> и{" "}
                    <strong>одно reference-видео</strong> (движение «откуда копируем»).
                  </li>
                  <li>
                    <strong>Ориентация «По фото» / «По видео»</strong> — от чего в первую
                    очередь брать композицию и постановку кадра; попробуйте оба варианта, если
                    результат неустойчивый.
                  </li>
                  <li>
                    <strong>Качество</strong> 720p или 1080p — выше нагрузка на обработку;
                    начните с 720p для отладки идеи.
                  </li>
                  <li>
                    Длительность и пропорции в интерфейсе завязаны на загруженное видео —
                    заранее подготовьте клип <strong>разумной длины</strong> и без лишнего
                    монтажа.
                  </li>
                </ul>
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                  <ImageIcon className="h-3.5 w-3.5" /> Пример цепочки: фото → движение → результат
                </p>
                <p className="mb-3 text-[12px] leading-relaxed text-gray-500">
                  Здесь все три файла часть одного сценария: сначала загружается фото и эталонное
                  видео, затем получается итоговый ролик.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <GuideExampleSlot
                    type="image"
                    src={GUIDE_MEDIA.syncImage}
                    label="Синхрон"
                    caption="Исходное фото"
                    frame="portrait"
                  />
                  <GuideExampleSlot
                    type="video"
                    src={GUIDE_MEDIA.syncReferenceVideo}
                    label="Синхрон"
                    caption="Эталон (движение)"
                    videoMuted={false}
                    frame="portrait"
                  />
                  <GuideExampleSlot
                    type="video"
                    src={GUIDE_MEDIA.syncResultVideo}
                    label="Синхрон"
                    caption="Пример результата"
                    videoMuted={false}
                    frame="portrait"
                  />
                </div>
              </section>

              <p className="border-t border-gray-200 pt-5 text-center text-[13px] leading-relaxed text-gray-500">
                Экспериментируйте, сохраняйте удачные промпты и референсы — так вы быстрее
                найдёте свой визуальный язык. Удачных генераций!
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

/** Кнопка открытия инструкции — компактная, под блоком лимитов справа */
export function VideoGenerationGuideTrigger({
  onOpen,
  highlight = false,
}: {
  onOpen: () => void;
  highlight?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      animate={
        highlight
          ? {
              boxShadow: [
                "0 8px 18px rgba(31,78,61,0.12)",
                "0 10px 24px rgba(132,204,22,0.28)",
                "0 8px 18px rgba(31,78,61,0.12)",
              ],
              borderColor: [
                "rgba(31,78,61,0.2)",
                "rgba(132,204,22,0.62)",
                "rgba(31,78,61,0.2)",
              ],
            }
          : undefined
      }
      transition={highlight ? { duration: 2.1, repeat: Infinity, ease: "easeInOut" } : undefined}
      className="group relative flex max-w-[11rem] flex-col items-center gap-1.5 rounded-2xl border-2 border-[#1F4E3D]/20 bg-white px-3 py-2.5 text-center shadow-md shadow-[#1F4E3D]/10 transition-colors hover:border-[#1F4E3D]/40 hover:bg-[#F0FDF4]/80"
    >
      {highlight && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-[#A3E635] ring-2 ring-white" />
      )}
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1F4E3D] text-white shadow-inner ring-2 ring-[#84CC16]/30">
        <BookOpen className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-[#1F4E3D]">
        Перед генерацией
      </span>
      <span className="text-[9px] font-semibold leading-snug text-gray-500 group-hover:text-gray-700">
        Ознакомьтесь с инструкцией
      </span>
      {highlight && (
        <span className="text-[8px] font-semibold leading-none tracking-wide text-[#4d7c0f]">
          Рекомендуем перед первым запуском
        </span>
      )}
    </motion.button>
  );
}
