"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { RainbowButton } from "@/components/ui/rainbow-button"
import { VideoTokenPolicyModal } from "@/components/ui/video-token-policy-modal"
import { TimelineContent } from "@/components/ui/timeline-animation"
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal"
import { cn } from "@/lib/utils"
import { VIDEO_TOKEN_PACKAGES } from "@/lib/video-token-pricing"
import NumberFlow from "@number-flow/react"
import { CheckCheck, Loader2, Check, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useId, useRef, useState, useEffect } from "react"

const PricingSwitch2 = ({
  button1,
  button2,
  selectedKey,
  onSwitch,
  className,
  layoutId,
}: {
  button1: string
  button2: string
  /** "0" = первая кнопка, "1" = вторая */
  selectedKey: string
  onSwitch: (value: string) => void
  className?: string
  layoutId?: string
}) => {
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `switch-${uniqueId}`

  const handleSwitch = (value: string) => {
    onSwitch(value)
  }

  return (
    <div
      className={cn(
        /* inline-flex + self-start: в колонке flex не растягивается на всю ширину (как у «Формат») */
        "relative z-10 inline-flex max-w-full self-start rounded-full bg-neutral-200/80 border border-neutral-300/80 p-1.5",
        className
      )}
    >
      <button
        type="button"
        onClick={() => handleSwitch("0")}
        className={cn(
          "relative z-10 min-h-14 flex-shrink-0 rounded-full px-6 py-3 text-base font-semibold transition-colors touch-manipulation",
          selectedKey === "0"
            ? "text-white"
            : "text-neutral-600 hover:text-neutral-900"
        )}
      >
        {selectedKey === "0" && (
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
          "relative z-10 min-h-14 flex-shrink-0 rounded-full px-6 py-3 text-base font-semibold transition-colors touch-manipulation",
          selectedKey === "1"
            ? "text-white"
            : "text-neutral-600 hover:text-neutral-900"
        )}
      >
        {selectedKey === "1" && (
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

/** Одна строка сегментов (как «генерации изображений»): лайм #84CC16, активный текст белый. Поддерживает 3–4 и больше опций. */
const PricingSwitchRow = ({
  options,
  value,
  onSwitch,
  className,
  layoutId,
}: {
  options: readonly string[]
  value: string
  onSwitch: (value: string) => void
  className?: string
  layoutId?: string
}) => {
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `switch-row-${uniqueId}`
  const parsed = Number.parseInt(value, 10)
  const index =
    Number.isFinite(parsed) && parsed >= 0 && parsed < options.length ? parsed : 0

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
            "relative z-10 flex-1 min-h-14 rounded-full px-1.5 py-3 text-sm font-semibold transition-colors touch-manipulation sm:px-2",
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
          <span className="relative block text-center leading-tight">{label}</span>
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
  "Изображения и видео в одной Мастерской — кадры и кредиты покупаются отдельными пакетами",
  "Любые стили и сцены — без ограничений",
  "Без привязки к карточке: чистая креативность",
  "Свой промпт — свой результат",
  "Скачивайте в высоком разрешении",
]

const FLOW_OPTIONS: [string, string, string] = ["1 Поток", "5 Потоков", "15 Потоков"]
const CREATIVE_OPTIONS: [string, string, string] = ["10 ген.", "30 ген.", "100 ген."]
/** Пакеты видео-кредитов (токены только на видео) */
const VIDEO_TOKEN_OPTIONS: [string, string, string, string] = [
  "1 250 ток.",
  "2 850 ток.",
  "6 250 ток.",
  "12 500 ток.",
]

const FLOW_PRICES = [299, 1190, 2990]
const CREATIVE_PRICES = [249, 590, 1490]
/** Цены видео-пакетов = VIDEO_TOKEN_PACKAGES (сейчас тест: 1 ₽). */
const VIDEO_TOKEN_PRICES = VIDEO_TOKEN_PACKAGES.map((p) => p.priceRub)

const FLOW_BONUS: (string | null)[] = [null, "Выгода 305 ₽", "199 ₽ за товар"]
const CREATIVE_BONUS: (string | null)[] = [null, null, "14.9 ₽ за кадр"]

interface PricingSectionKartoProps {
  user?: { id: string } | null
}

export default function PricingSectionKarto({ user }: PricingSectionKartoProps) {
  const router = useRouter()
  const [mode, setMode] = useState<"0" | "1">("0")
  const [tariff, setTariff] = useState("0")
  /** Индекс пакета видео-кредитов (0–3) */
  const [videoTariff, setVideoTariff] = useState("0")
  /** В «Свободном творчестве»: "0" фото (генерации), "1" видео (токены) */
  const [creativeMediaSub, setCreativeMediaSub] = useState<"0" | "1">("0")
  const [selecting, setSelecting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [videoPolicyOpen, setVideoPolicyOpen] = useState(false)
  const pricingRef = useRef<HTMLDivElement>(null)

  const doSelectTariff = async () => {
    if (!user) return
    setSelecting(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`
      const isFlow = mode === "0"
      const paymentKind =
        isFlow ? "flow" : creativeMediaSub === "1" ? "video_tokens" : "creative"
      const tariffIndex =
        paymentKind === "video_tokens"
          ? Number.parseInt(videoTariff, 10) || 0
          : Number.parseInt(tariff, 10) || 0

      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode,
          paymentKind,
          tariffIndex,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Ошибка создания платежа")
      if (data.success === false && data.error) throw new Error(data.error)
      const confirmationUrl = data.confirmation_url
      if (confirmationUrl) {
        if (data.paymentId && typeof data.paymentId === "string") {
          document.cookie = `karto_pending_payment_id=${encodeURIComponent(data.paymentId)}; path=/; max-age=600; SameSite=Lax`
        }
        setConfirmOpen(false)
        window.location.href = confirmationUrl
        return
      }
      throw new Error(data.error || "Не получена ссылка на оплату")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка. Попробуйте позже."
      alert(msg)
    } finally {
      setSelecting(false)
    }
  }

  const handleSelectTariff = () => {
    if (!user) {
      router.push("/login?returnUrl=/#pricing")
      return
    }
    setConfirmOpen(true)
  }

  useEffect(() => {
    if (!confirmOpen) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false)
    }
    window.addEventListener("keydown", onEscape)
    return () => window.removeEventListener("keydown", onEscape)
  }, [confirmOpen])

  const isFlow = mode === "0"
  const isCreativeVideo = !isFlow && creativeMediaSub === "1"
  const tariffIndex = Number.parseInt(tariff, 10) || 0
  const videoTariffIndex = Number.parseInt(videoTariff, 10) || 0
  const features = isFlow ? FLOW_FEATURES : CREATIVE_FEATURES
  const bonuses = isFlow ? FLOW_BONUS : CREATIVE_BONUS
  const currentPrice = isFlow
    ? FLOW_PRICES[tariffIndex] ?? FLOW_PRICES[0]
    : isCreativeVideo
      ? VIDEO_TOKEN_PRICES[videoTariffIndex] ?? VIDEO_TOKEN_PRICES[0]
      : CREATIVE_PRICES[tariffIndex] ?? CREATIVE_PRICES[0]
  const bonusLabel = isFlow || isCreativeVideo ? null : bonuses[tariffIndex]

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
          Пакеты «Поток» и «Свободное творчество» не суммируются: покупка генераций не даёт доступа к Потоку и наоборот — выберите один формат. В свободном творчестве сначала выберите фото или видео: видео-кредиты (токены) только на видео и не тратят пакет кадров изображений.
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
                selectedKey={mode}
                onSwitch={(v) => {
                  setMode(v as "0" | "1")
                  setTariff("0")
                  setVideoTariff("0")
                  setCreativeMediaSub("0")
                }}
                layoutId="karto-mode"
              />
            </TimelineContent>

            {!isFlow && (
              <>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                  Формат
                </h4>
                <PricingSwitch2
                  button1="Фото"
                  button2="Видео"
                  selectedKey={creativeMediaSub}
                  onSwitch={(v) => {
                    setCreativeMediaSub(v as "0" | "1")
                    setTariff("0")
                    setVideoTariff("0")
                  }}
                  layoutId="karto-creative-media"
                />
              </>
            )}

            <TimelineContent
              animationNum={5}
              timelineRef={pricingRef}
              customVariants={revealVariants}
            >
              {isFlow ? (
                <>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Объём потоков
                  </h4>
                  <PricingSwitchRow
                    options={FLOW_OPTIONS}
                    value={tariff}
                    onSwitch={setTariff}
                    layoutId="karto-tariff"
                  />
                </>
              ) : isCreativeVideo ? (
                <>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Видео-кредиты
                  </h4>
                  <PricingSwitchRow
                    options={VIDEO_TOKEN_OPTIONS}
                    value={videoTariff}
                    onSwitch={setVideoTariff}
                    layoutId="karto-video-tariff"
                  />
                  <button
                    type="button"
                    onClick={() => setVideoPolicyOpen(true)}
                    className="mt-2 text-left text-[11px] font-medium text-[#2E5A43] underline-offset-2 hover:underline decoration-[#84CC16]/60"
                  >
                    Ценовая политика видео
                  </button>
                </>
              ) : (
                <>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Генерации изображений
                  </h4>
                  <PricingSwitchRow
                    options={CREATIVE_OPTIONS}
                    value={tariff}
                    onSwitch={setTariff}
                    layoutId="karto-tariff"
                  />
                </>
              )}
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
                {user ? (
                  <RainbowButton
                    type="button"
                    onClick={handleSelectTariff}
                    disabled={selecting}
                    className="w-full min-w-0 inline-flex items-center justify-center gap-2"
                  >
                    {selecting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Выбор...
                      </>
                    ) : (
                      "Выбрать тариф"
                    )}
                  </RainbowButton>
                ) : (
                  <RainbowButton
                    href="/login?returnUrl=/#pricing"
                    className="w-full min-w-0 inline-flex items-center justify-center"
                  >
                    Войти, чтобы выбрать тариф
                  </RainbowButton>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                Без скрытых платежей. Пакеты действуют 30 дней с даты оплаты; неиспользованные остатки по истечении периода аннулируются.
              </p>
            </TimelineContent>
          </div>
        </div>
      </div>

      <VideoTokenPolicyModal open={videoPolicyOpen} onClose={() => setVideoPolicyOpen(false)} />

      {/* Окно подтверждения тарифа */}
      <AnimatePresence>
        {confirmOpen && (
          <>
            <motion.div
              key="confirm-backdrop"
              role="presentation"
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setConfirmOpen(false)}
            />
            <motion.div
              key="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-tariff-title"
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-2xl border border-neutral-200/80 bg-[#F5F5F0] shadow-xl shadow-black/10">
                <div className="border-b border-neutral-200/80 px-6 py-5">
                  <h3
                    id="confirm-tariff-title"
                    className="text-xl font-semibold text-neutral-900"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    Подтверждение тарифа
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Проверьте выбор перед продолжением
                  </p>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div className="rounded-xl bg-white/80 border border-neutral-200/80 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Режим</span>
                      <span className="font-medium text-neutral-900">
                        {isFlow ? "Поток" : "Свободное творчество"}
                      </span>
                    </div>
                    {!isFlow && (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Формат</span>
                        <span className="font-medium text-neutral-900">
                          {isCreativeVideo ? "Видео" : "Фото"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">
                        {isCreativeVideo ? "Пакет" : "Объём"}
                      </span>
                      <span className="font-medium text-neutral-900 text-right max-w-[60%]">
                        {isCreativeVideo
                          ? VIDEO_TOKEN_OPTIONS[videoTariffIndex]
                          : isFlow
                            ? FLOW_OPTIONS[tariffIndex]
                            : CREATIVE_OPTIONS[tariffIndex]}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1 border-t border-neutral-100">
                      <span className="text-neutral-500">Сумма</span>
                      <span className="text-2xl font-bold text-[#1F4E3D]">
                        {currentPrice} ₽
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                      Что вы получаете
                    </p>
                    <ul className="space-y-2">
                      {features.slice(0, 5).map((text, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                          <span className="mt-0.5 shrink-0 rounded-full bg-[#84CC16]/20 p-0.5">
                            <Check className="h-3.5 w-3.5 text-[#1F4E3D]" strokeWidth={2.5} />
                          </span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="flex gap-3 px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    <X className="h-4 w-4" />
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={doSelectTariff}
                    disabled={selecting}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F4E3D] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#163d30] disabled:opacity-60"
                  >
                    {selecting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Переход к оплате...
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4" />
                        Подтверждаю
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  )
}
