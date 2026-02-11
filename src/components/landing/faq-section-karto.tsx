"use client"

import { useState } from "react"
import { PhoneCall } from "lucide-react"
import { Accordion } from "@/components/ui/accordion"
import { SparklesCore } from "@/components/ui/sparkles"
import { ContactQuestionModal } from "@/components/ui/contact-question-modal"

const faqItems = [
  {
    title: "Для кого создан сервис KARTO?",
    content:
      "Наша платформа — это инструмент для всех, кто занимается коммерцией. Она создана для селлеров на любых маркетплейсах (Wildberries, Ozon, Яндекс Маркет и др.), позволяя быстро создать упаковку товара. В режиме «Свободное творчество» сервис также полезен дизайнерам и маркетологам, которым нужны уникальные визуалы без затрат на студийную съемку.",
  },
  {
    title: "Не исказит ли нейросеть внешний вид моего товара?",
    content:
      "Это исключено. В KARTO используются алгоритмы, которые сохраняют ваш товар настоящим. Мы не перерисовываем форму и не меняем детали объекта — система лишь аккуратно удаляет фон и вписывает ваш товар в новую сцену с реалистичным освещением и тенями.",
  },
  {
    title: "В чем разница между «Потоком» и «Свободным творчеством»?",
    content:
      "Поток — это автоматизированный бизнес-процесс: вы получаете до 12 вариаций дизайна, готовое SEO-описание и анализ цен в одном цикле. Свободное творчество — это ваша личная мастерская, где вы генерируете любые изображения по своим правилам и промптам без привязки к маркетинговому сценарию.",
  },
  {
    title: "Как долго действуют приобретенные пакеты?",
    content:
      "Все купленные «Потоки» и пакеты генераций в Мастерской активны в течение 30 дней с момента оплаты. Мы работаем по месячному циклу, чтобы обеспечивать максимальную скорость серверов и актуальность инструментов. Пожалуйста, планируйте свою работу заранее — неиспользованные остатки в конце месяца сгорают.",
  },
  {
    title: "Сколько вариантов дизайна я получу в одном «Потоке»?",
    content:
      "В рамках одной сессии «Потока» вам доступно до 12 генераций. Вы можете пробовать разные окружения и стили, пока не найдете идеальный вариант для своей карточки. Все 12 попыток уже включены в стоимость одного Потока.",
  },
  {
    title: "Нужен ли мне VPN или зарубежная карта для оплаты?",
    content:
      "Нет. Сервис KARTO полностью российский и работает без VPN. Оплата принимается через любые российские платежные системы (МИР, СБП, банковские карты). Процесс покупки занимает меньше минуты.",
  },
  {
    title: "Можно ли использовать сервис для создания рекламы в соцсетях?",
    content:
      "Конечно. Хотя мы делаем акцент на маркетплейсах, возможности системы гораздо шире. Вы можете создавать рекламные баннеры, креативы для постов и обложки для видео в режиме «Свободного творчества». Результаты генераций можно скачивать и использовать на любых площадках.",
  },
]

interface FAQSectionKartoProps {
  user?: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null
}

export function FAQSectionKarto({ user }: FAQSectionKartoProps) {
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false)

  return (
    <div
      className="w-full py-16 md:py-24 bg-[#F5F5F0] noise-texture"
      id="faq"
      suppressHydrationWarning
    >
      {/* Тонкая чёрная полоска-разделитель вместо белого разрыва */}
      <div className="w-full h-px bg-neutral-900 shrink-0" aria-hidden />

      <div className="container mx-auto px-4 md:px-6 pt-12 md:pt-16">
        <div className="grid gap-10 lg:gap-24 xl:gap-28 items-start lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="flex flex-col gap-6 lg:max-w-md lg:pr-10">
            <span
              className="inline-flex w-fit items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 pl-3 border-l-2 border-neutral-400"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              FAQ
            </span>
            <div className="flex flex-col gap-3">
              <h2
                className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-neutral-900 max-w-md text-left leading-[1.15]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                <span>Ответы на самые</span>
                <br />
                <span className="text-[#2E5A43] italic">важные вопросы</span>
              </h2>
              <p
                className="text-lg text-neutral-600 max-w-xl leading-relaxed text-left"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Всё, что нужно знать о KARTO.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsQuestionModalOpen(true)}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-400/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-white hover:border-neutral-500 hover:shadow-sm"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <span className="italic">Остались вопросы?</span>
              <span>Напишите нам</span>
              <PhoneCall className="h-4 w-4 shrink-0 opacity-70" />
            </button>
            <ContactQuestionModal
              isOpen={isQuestionModalOpen}
              onClose={() => setIsQuestionModalOpen(false)}
              user={user}
            />
            {/* Полоска и вокруг неё мерцающие звёздочки */}
            <div className="relative mt-5 h-16 w-full max-w-xl overflow-hidden">
              {/* Тонкая полоска по центру */}
              <div className="absolute left-[5%] right-[5%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-neutral-400 to-transparent" aria-hidden />
              {/* Звёздочки вокруг полоски */}
              <div className="absolute inset-0">
                <SparklesCore
                  background="transparent"
                  minSize={0.4}
                  maxSize={1.2}
                  speed={2}
                  particleColor="#737373"
                  particleDensity={1200}
                  className="h-full w-full"
                />
              </div>
              <div
                className="pointer-events-none absolute inset-0 w-full h-full [mask-image:radial-gradient(ellipse_100%_100%_at_50%_50%,black_40%,transparent_85%)]"
                aria-hidden
              />
            </div>
          </div>
          <div className="w-full lg:max-w-2xl lg:ml-auto lg:pl-10">
            <Accordion
              items={faqItems.map((item) => ({
                title: item.title,
                content: (
                  <p className="text-neutral-600 leading-relaxed text-base md:text-lg">
                    {item.content}
                  </p>
                ),
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
