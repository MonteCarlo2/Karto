"use client"

import { RainbowButton } from "@/components/ui/rainbow-button"
import { TimelineContent } from "@/components/ui/timeline-animation"
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal"
import { cn } from "@/lib/utils"
import NumberFlow from "@number-flow/react"
import { CheckCheck } from "lucide-react"
import { motion } from "framer-motion"
import { useId, useRef, useState } from "react"

const PricingSwitch2 = ({
  button1,
  button2,
  onSwitch,
  className,
  layoutId,
}: {
  button1: string
  button2: string
  onSwitch: (value: string) => void
  className?: string
  layoutId?: string
}) => {
  const [selected, setSelected] = useState("0")
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `switch-${uniqueId}`

  const handleSwitch = (value: string) => {
    setSelected(value)
    onSwitch(value)
  }

  return (
    <div
      className={cn(
        "relative z-10 flex w-full rounded-full bg-neutral-200/80 border border-neutral-300/80 p-1.5 md:inline-flex md:w-auto",
        className
      )}
    >
      <button
        type="button"
        onClick={() => handleSwitch("0")}
        className={cn(
          "relative z-10 min-h-14 flex-shrink-0 rounded-full px-6 py-3 text-base font-semibold transition-colors touch-manipulation w-full md:w-auto",
          selected === "0"
            ? "text-white"
            : "text-neutral-600 hover:text-neutral-900"
        )}
      >
        {selected === "0" && (
          <motion.span
            layoutId={switchLayoutId}
            className="absolute inset-0 rounded-full bg-neutral-900 shadow-lg shadow-black/20"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
        <span className="relative whitespace-nowrap">{button1}</span>
      </button>
      <button
        type="button"
        onClick={() => handleSwitch("1")}
        className={cn(
          "relative z-10 min-h-14 flex-shrink-0 rounded-full px-6 py-3 text-base font-semibold transition-colors touch-manipulation w-full md:w-auto",
          selected === "1"
            ? "text-white"
            : "text-neutral-600 hover:text-neutral-900"
        )}
      >
        {selected === "1" && (
          <motion.span
            layoutId={switchLayoutId}
            className="absolute inset-0 rounded-full bg-neutral-900 shadow-lg shadow-black/20"
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
        <span className="relative whitespace-nowrap">{button2}</span>
      </button>
    </div>
  )
}

const PricingSwitch3 = ({
  options,
  value,
  onSwitch,
  className,
  layoutId,
}: {
  options: [string, string, string]
  value: string
  onSwitch: (value: string) => void
  className?: string
  layoutId?: string
}) => {
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `switch3-${uniqueId}`
  const index = value === "0" ? 0 : value === "1" ? 1 : 2

  return (
    <div
      className={cn(
        "relative z-10 w-full flex rounded-full bg-neutral-200/80 border border-neutral-300/80 p-1.5",
        className
      )}
    >
      {options.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSwitch(String(i))}
          className={cn(
            "relative z-10 flex-1 min-h-14 rounded-full px-2 py-3 text-sm font-semibold transition-colors touch-manipulation",
            index === i ? "text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {index === i && (
            <motion.span
              layoutId={switchLayoutId}
              className="absolute inset-0 rounded-full bg-[#84CC16] shadow-lg shadow-[#84CC16]/30"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  )
}

const FLOW_FEATURES = [
  "До 12 продающих фото на товар",
  "SEO-текст под Wildberries и Ozon",
  "Анализ цен и ниши в один клик",
  "Всё в одном потоке — без лишних переключений",
  "Готово за 5 минут",
]

const CREATIVE_FEATURES = [
  "Генерируйте что угодно по своим правилам",
  "Любые стили и сцены — без ограничений",
  "Без привязки к карточке: чистая креативность",
  "Свой промпт — свой результат",
  "Скачивайте в высоком разрешении",
]

const FLOW_OPTIONS: [string, string, string] = ["1 Поток", "5 Потоков", "15 Потоков"]
const CREATIVE_OPTIONS: [string, string, string] = ["10 ген.", "30 ген.", "100 ген."]

const FLOW_PRICES = [299, 1190, 2990]
const CREATIVE_PRICES = [249, 590, 1490]

const FLOW_BONUS: (string | null)[] = [null, "Выгода 305 ₽", "199 ₽ за товар"]
const CREATIVE_BONUS: (string | null)[] = [null, null, "14.9 ₽ за кадр"]

export default function PricingSectionKarto() {
  const [mode, setMode] = useState<"0" | "1">("0")
  const [tariff, setTariff] = useState("0")
  const pricingRef = useRef<HTMLDivElement>(null)

  const isFlow = mode === "0"
  const tariffIndex = Number.parseInt(tariff, 10) || 0
  const features = isFlow ? FLOW_FEATURES : CREATIVE_FEATURES
  const tariffOptions = isFlow ? FLOW_OPTIONS : CREATIVE_OPTIONS
  const prices = isFlow ? FLOW_PRICES : CREATIVE_PRICES
  const bonuses = isFlow ? FLOW_BONUS : CREATIVE_BONUS
  const currentPrice = prices[tariffIndex] ?? prices[0]
  const bonusLabel = bonuses[tariffIndex]

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: { delay: i * 0.2, duration: 0.5 },
    }),
    hidden: { filter: "blur(10px)", y: -20, opacity: 0 },
  }

  return (
    <section
      id="pricing"
      className="min-h-screen w-full bg-[#F5F5F0] py-12 md:py-16"
      ref={pricingRef}
    >
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-7xl flex-col justify-center px-6 sm:px-8 lg:px-12">
        {/* Бейдж */}
        <TimelineContent
          animationNum={0}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mb-4 flex justify-center"
        >
          <span className="rounded-full border border-[#84CC16]/40 bg-[#84CC16]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
            Варианты участия
          </span>
        </TimelineContent>

        {/* Заголовок: две строки, вторая крупнее и курсив; отступ сверху чтобы не обрезало */}
        <h2
          className="mb-4 pt-4 text-center text-neutral-900 overflow-visible"
          style={{ fontFamily: "var(--font-serif)", lineHeight: 1.2 }}
        >
          <span className="block text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.1}
              staggerFrom="first"
              reverse
              containerClassName="justify-center"
              transition={{ type: "spring", stiffness: 250, damping: 40, delay: 0.15 }}
            >
              Инвестиция в
            </VerticalCutReveal>
          </span>
          <span className="mt-2 block text-4xl font-bold italic tracking-tight text-[#1F4E3D] md:text-5xl lg:text-7xl leading-[1.15]">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.1}
              staggerFrom="first"
              reverse
              containerClassName="justify-center"
              transition={{ type: "spring", stiffness: 250, damping: 40, delay: 0.25 }}
            >
              безупречный результат.
            </VerticalCutReveal>
          </span>
        </h2>

        <TimelineContent
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mb-2 text-center text-lg leading-relaxed text-neutral-600 md:text-xl"
        >
          От разовых генераций до масштабного производства контента. Выберите план, который соответствует вашим амбициям на маркетплейсах.
        </TimelineContent>

        <TimelineContent
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mb-10 text-center text-sm text-neutral-500"
        >
          Пакеты «Поток» и «Свободное творчество» не суммируются: покупка генераций не даёт доступа к Потоку и наоборот — выберите один формат.
        </TimelineContent>

        <div className="grid gap-14 md:grid-cols-[1fr_1.2fr] md:gap-16 lg:gap-20">
          {/* Левая колонка: особенности левее, анимация только при первом появлении в viewport */}
          <div className="md:max-w-sm md:justify-self-start pl-0">
            <TimelineContent
              animationNum={2}
              timelineRef={pricingRef}
              customVariants={revealVariants}
              className="mb-6 text-lg font-bold uppercase tracking-wider text-neutral-700 md:text-xl"
            >
              Что вы получаете
            </TimelineContent>
            <ul className="space-y-3">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-4 rounded-xl border-l-4 border-[#84CC16] bg-white/60 py-3 pl-4 pr-4 shadow-sm"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#84CC16]">
                    <CheckCheck className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm font-medium leading-snug text-neutral-800 md:text-base">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Правая колонка: переключатели, цена, кнопка; больше отступ между блоками */}
          <div className="flex flex-col justify-center space-y-12">
            <TimelineContent
              animationNum={4}
              timelineRef={pricingRef}
              customVariants={revealVariants}
            >
              <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                Режим
              </h4>
              <PricingSwitch2
                button1="Поток"
                button2="Свободное творчество"
                onSwitch={(v) => {
                  setMode(v as "0" | "1")
                  setTariff("0")
                }}
                layoutId="karto-mode"
              />
            </TimelineContent>

            <TimelineContent
              animationNum={5}
              timelineRef={pricingRef}
              customVariants={revealVariants}
            >
              <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                {isFlow ? "Объём потоков" : "Количество генераций"}
              </h4>
              <PricingSwitch3
                options={tariffOptions}
                value={tariff}
                onSwitch={setTariff}
                layoutId="karto-tariff"
              />
            </TimelineContent>

            <TimelineContent
              animationNum={6}
              timelineRef={pricingRef}
              customVariants={revealVariants}
              className="flex flex-col gap-5 pt-2"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-6xl font-bold tracking-tight text-neutral-900 md:text-7xl lg:text-8xl">
                  <NumberFlow
                    value={currentPrice}
                    className="text-6xl font-bold md:text-7xl lg:text-8xl"
                  />
                  <span className="ml-1 text-4xl text-neutral-500">₽</span>
                </span>
                {bonusLabel && (
                  <span className="rounded-full bg-[#84CC16]/25 px-3 py-1.5 text-sm font-semibold text-neutral-800">
                    {bonusLabel}
                  </span>
                )}
              </div>
              <div className="w-full max-w-xs">
                <RainbowButton href="/studio" className="w-full min-w-0">
                  Выбрать тариф
                </RainbowButton>
              </div>
              <p className="text-sm text-neutral-500">
                Без скрытых платежей. По истечении месяца тарифы обнуляются
              </p>
            </TimelineContent>
          </div>
        </div>
      </div>
    </section>
  )
}
