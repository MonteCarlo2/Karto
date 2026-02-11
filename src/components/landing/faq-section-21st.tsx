"use client"

import { PhoneCall } from "lucide-react"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const faqItems = [
  {
    title: "Для кого подходит сервис?",
    content:
      "KARTO идеально подходит для селлеров на Wildberries и Ozon, которые хотят сэкономить время на создании контента, но не готовы терять в качестве. Также полезен менеджерам маркетплейсов, дизайнерам и агентствам.",
  },
  {
    title: "Какие маркетплейсы поддерживаются?",
    content:
      "На данный момент полностью поддерживаются стандарты Wildberries и Ozon. В разработке — поддержка Яндекс.Маркета и СберМегаМаркета.",
  },
  {
    title: "Как работают изображения?",
    content:
      "Мы используем комбинацию алгоритмов для удаления фона и наложения товара на сцены. Ваш товар остаётся настоящим, меняется только окружение. Без перерисовки и искажения формы.",
  },
  {
    title: "Можно ли вносить правки?",
    content:
      "Да, на этапе предпросмотра вы можете заменить фон, скорректировать описание, изменить инфографику или пересчитать цену перед выгрузкой.",
  },
  {
    title: "Есть ли возврат средств?",
    content:
      "Если результат технически неверен (товар искажён, описание не соответствует товару), мы вернём деньги за карточку или предоставим дополнительные попытки бесплатно.",
  },
  {
    title: "Как быстро обрабатывается заказ?",
    content:
      "Стандартное время — 2–3 минуты на одну карточку. При больших объёмах (от 10 карточек) — до 10–15 минут. Уведомление на email по готовности.",
  },
]

export function FAQSection21st() {
  return (
    <div
      className="w-full py-16 md:py-24 bg-white"
      id="faq"
      suppressHydrationWarning
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              Вопросы и ответы
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground max-w-xl text-left">
                Всё, что нужно знать о KARTO
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl leading-relaxed text-left">
                Ответы на частые вопросы о сервисе, форматах и качестве результата.
              </p>
            </div>
            <Button variant="outline" size="lg" className="gap-2 w-fit" asChild>
              <Link href="#">
                Остались вопросы? Напишите нам
                <PhoneCall className="w-4 h-4" />
              </Link>
            </Button>
          </div>
          <div className="w-full">
            <Accordion
              items={faqItems.map((item) => ({
                title: item.title,
                content: <p className="text-muted-foreground">{item.content}</p>,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
