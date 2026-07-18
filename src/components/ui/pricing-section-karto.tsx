"use client"

import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { RainbowButton } from "@/components/ui/rainbow-button"
import { TimelineContent } from "@/components/ui/timeline-animation"
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal"
import { cn } from "@/lib/utils"
import {
  CREDIT_PACKAGES,
  CREDIT_PHOTO_4K,
  enoughForCopy,
  FLOW_CREDITS_PACK_BLURB,
} from "@/lib/credits-pricing"
import { CreditsTariffModal } from "@/components/ui/credits-tariff-modal"
import {
  KARTO_CREATIVE_MODE,
  KARTO_CREATIVE_VALUE_PROP,
  KARTO_FLOW_MODE,
  KARTO_PRICING_MODES,
  KARTO_REVIEWS_MODE,
} from "@/lib/karto-modes"
import { FLOW_PRICES } from "@/lib/subscription"
import {
  AUTO_REPLY_OPTION_LABELS,
  AUTO_REPLY_PACKAGES,
  autoReplyPricePerUnit,
  formatAutoReplyVolume,
} from "@/lib/auto-replies-pricing"
import { welcomePerksPricingNoteRu } from "@/lib/welcome-perks"
import NumberFlow from "@number-flow/react"
import { CheckCheck, Loader2, Check, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useId, useRef, useState, useEffect, useCallback } from "react"

/** Селектор пакетов автоответов: шире стандартной строки, салатовая таблетка. */
const ReviewsPackageSwitch = ({
  options,
  value,
  onSwitch,
  layoutId,
  className,
}: {
  options: readonly string[]
  value: string
  onSwitch: (value: string) => void
  layoutId?: string
  className?: string
}) => {
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `reviews-switch-${uniqueId}`
  const parsed = Number.parseInt(value, 10)
  const index =
    Number.isFinite(parsed) && parsed >= 0 && parsed < options.length ? parsed : 0

  return (
    <div
      className={cn(
        "relative z-10 flex w-full rounded-full border border-neutral-300/80 bg-neutral-200/80 p-1.5",
        className
      )}
    >
      {options.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSwitch(String(i))}
          className={cn(
            "relative z-10 min-h-14 flex-1 rounded-full px-1 py-3 text-base font-bold tabular-nums transition-colors touch-manipulation sm:px-1.5 sm:text-lg",
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

/** Одна строка сегментов (как «генерации изображений»): лайм #84CC16, активный текст белый. Поддерживает 3–4 и больше опций. */
const PricingSwitchRow = ({
  options,
  value,
  onSwitch,
  className,
  layoutId,
  compact,
  largeLabels,
}: {
  options: readonly string[]
  value: string
  onSwitch: (value: string) => void
  className?: string
  layoutId?: string
  compact?: boolean
  /** Чуть крупнее подписи (переключатель «Режим»). */
  largeLabels?: boolean
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
        compact ? "flex-wrap gap-1.5 rounded-2xl" : "",
        className
      )}
    >
      {options.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSwitch(String(i))}
          className={cn(
            compact
              ? "relative z-10 min-h-11 flex-1 min-w-[calc(25%-0.5rem)] rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors touch-manipulation sm:min-w-0 sm:flex-1 sm:rounded-full sm:px-1.5 sm:py-3 sm:text-xs"
              : largeLabels
                ? "relative z-10 flex-1 min-h-14 rounded-full px-2 py-3 text-base font-semibold transition-colors touch-manipulation sm:px-3 sm:text-lg"
                : "relative z-10 flex-1 min-h-14 rounded-full px-1.5 py-3 text-sm font-semibold transition-colors touch-manipulation sm:px-2",
            index === i ? "text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {index === i && (
            <motion.span
              layoutId={switchLayoutId}
              className={cn(
                "absolute inset-0 bg-[#84CC16] shadow-lg shadow-[#84CC16]/30",
                compact ? "rounded-xl sm:rounded-full" : "rounded-full"
              )}
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
  FLOW_CREDITS_PACK_BLURB,
  "Фото и видео из одного баланса кредитов",
  "SEO-текст под Wildberries и Ozon",
  "Анализ цен и ниши в один клик",
  "Всё в одном потоке — без лишних переключений",
  "Готово за 5 минут",
]

const CREATIVE_FEATURES = [
  KARTO_CREATIVE_VALUE_PROP,
  "Один баланс кредитов — фото 4K и видео",
  "100 кредитов = одно фото 4K; видео «Студия» и «Синхрон» — в таблице тарификации",
  "Режим «Для товара» и «Свободное фото»",
  "Любые стили и сцены",
  "Свой промпт — свой результат",
  "Скачивайте в высоком разрешении",
]

const REVIEWS_FEATURES = [
  "Два ИИ на каждый ответ: один пишет, второй проверяет",
  "Wildberries, Ozon и Яндекс Маркет — одно окно",
  "Режимы: по тексту, полуавтомат и автомат",
  "Купленные ответы действуют 30 дней; автопродление пакета можно включить или отключить в профиле",
  "Перегенерация ответа бесплатна",
  "API, аналитика и настройки под ваш бренд",
]

const PRICING_MODE_LABELS = KARTO_PRICING_MODES.map((m) => m.title)

const FLOW_OPTIONS: [string, string, string] = ["1 Поток", "5 Потоков", "15 Потоков"]

/** Переключатель пакетов кредитов — крупные подписи «800 кр.» и т.д. */
const CreditsPackageSwitch = ({
  options,
  value,
  onSwitch,
  layoutId,
}: {
  options: readonly string[]
  value: string
  onSwitch: (value: string) => void
  layoutId?: string
}) => {
  const uniqueId = useId()
  const switchLayoutId = layoutId ?? `credits-switch-${uniqueId}`
  const parsed = Number.parseInt(value, 10)
  const index =
    Number.isFinite(parsed) && parsed >= 0 && parsed < options.length ? parsed : 0

  return (
    <div className="relative z-10 flex w-full flex-wrap gap-1.5 rounded-2xl border border-neutral-300/80 bg-neutral-200/80 p-1.5">
      {options.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSwitch(String(i))}
          className={cn(
            "relative z-10 min-h-12 flex-1 min-w-[calc(50%-0.5rem)] rounded-xl px-2 py-2.5 text-sm font-bold tabular-nums transition-colors touch-manipulation sm:min-w-0 sm:flex-1 sm:rounded-full sm:px-3 sm:py-3 sm:text-base md:text-lg",
            index === i ? "text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {index === i && (
            <motion.span
              layoutId={switchLayoutId}
              className="absolute inset-0 rounded-xl bg-[#84CC16] shadow-lg shadow-[#84CC16]/30 sm:rounded-full"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative block text-center leading-tight">{label}</span>
        </button>
      ))}
    </div>
  )
}


const CREDIT_OPTION_LABELS = CREDIT_PACKAGES.map(
  (p) => `${p.credits.toLocaleString("ru-RU")} кр.`
)

const FLOW_BONUS: (string | null)[] = [null, "Выгода 305 ₽", "199 ₽ за товар"]

interface PricingSectionKartoProps {
  user?: { id: string } | null
}

export default function PricingSectionKarto({ user }: PricingSectionKartoProps) {
  const router = useRouter()
  const [mode, setMode] = useState<"0" | "1" | "2">("0")
  const [tariff, setTariff] = useState("0")
  const [selecting, setSelecting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pricingRef = useRef<HTMLDivElement>(null)
  const [promoCodeInput, setPromoCodeInput] = useState("")
  const [promoBusy, setPromoBusy] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoApplied, setPromoApplied] = useState<{
    finalRub: number
    originalRub: number
    discountPercent: number
    discountRub?: number
  } | null>(null)
  /** Поле ввода промокода показываем только после «Есть промокод». */
  const [promoFieldsOpen, setPromoFieldsOpen] = useState(false)
  /** Автопродление пакета «Отзывы» — по умолчанию включено. */
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(true)
  const [tariffTableOpen, setTariffTableOpen] = useState(false)

  useEffect(() => {
    setPromoApplied(null)
    setPromoError(null)
  }, [mode, tariff])

  useEffect(() => {
    if (!confirmOpen) {
      setPromoFieldsOpen(false)
      setAutoRenewEnabled(true)
    }
  }, [confirmOpen])

  const applyPromo = useCallback(async () => {
    if (!user || !promoCodeInput.trim()) return
    setPromoBusy(true)
    setPromoError(null)
    try {
      const supabase = createBrowserClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setPromoError("Войдите в аккаунт")
        setPromoApplied(null)
        return
      }
      const isFl = mode === "0"
      const paymentKind =
        mode === "2" ? "auto_replies" : isFl ? "flow" : "credits"
      const res = await fetch("/api/payment/promo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          promoCode: promoCodeInput.trim(),
          paymentKind,
          mode,
          tariffIndex: Number.parseInt(tariff, 10) || 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.success) {
        setPromoApplied(null)
        setPromoError(typeof data.error === "string" ? data.error : "Не удалось применить")
        return
      }
      setPromoApplied({
        finalRub: data.finalRub,
        originalRub: data.originalRub,
        discountPercent: data.discountPercent,
        ...(typeof data.discountRub === "number" ? { discountRub: data.discountRub } : {}),
      })
    } catch {
      setPromoError("Ошибка сети")
      setPromoApplied(null)
    } finally {
      setPromoBusy(false)
    }
  }, [user, mode, tariff, promoCodeInput])

  const doSelectTariff = async () => {
    if (!user) return
    setSelecting(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`
      const isFlow = mode === "0"
      const isReviews = mode === "2"
      const paymentKind = isReviews ? "auto_replies" : isFlow ? "flow" : "credits"
      const tariffIndex = Number.parseInt(tariff, 10) || 0

      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode,
          paymentKind,
          tariffIndex,
          ...(isReviews ? { autoRenew: autoRenewEnabled } : {}),
          ...(promoApplied && promoCodeInput.trim()
            ? { promoCode: promoCodeInput.trim() }
            : {}),
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
  const isReviews = mode === "2"
  const isCreative = mode === "1"
  const maxTariffIndex = isReviews
    ? AUTO_REPLY_PACKAGES.length - 1
    : isFlow
      ? FLOW_OPTIONS.length - 1
      : CREDIT_PACKAGES.length - 1
  const tariffIndex = Math.min(
    maxTariffIndex,
    Math.max(0, Number.parseInt(tariff, 10) || 0)
  )
  const reviewsPack = AUTO_REPLY_PACKAGES[tariffIndex] ?? AUTO_REPLY_PACKAGES[0]
  const creditPack = CREDIT_PACKAGES[tariffIndex] ?? CREDIT_PACKAGES[0]
  const features = isFlow ? FLOW_FEATURES : isReviews ? REVIEWS_FEATURES : CREATIVE_FEATURES
  const currentPrice = isFlow
    ? FLOW_PRICES[tariffIndex] ?? FLOW_PRICES[0]
    : isReviews
      ? reviewsPack.priceRub
      : creditPack.priceRub
  const bonusLabel = isReviews
    ? `${autoReplyPricePerUnit(reviewsPack.replies, reviewsPack.priceRub)} ₽ за ответ`
    : isFlow
      ? FLOW_BONUS[tariffIndex] ?? null
      : tariffIndex === CREDIT_PACKAGES.length - 1
        ? `${(creditPack.priceRub / creditPack.photosEquiv).toFixed(1)} ₽ за фото 4K`
        : null

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
          От разовых генераций до масштабного производства контента.{" "}
          <strong className="font-semibold text-neutral-700">{KARTO_FLOW_MODE.title}</strong> —{" "}
          {KARTO_FLOW_MODE.tagline.toLowerCase()};{" "}
          <strong className="font-semibold text-neutral-700">{KARTO_CREATIVE_MODE.title}</strong> —{" "}
          {KARTO_CREATIVE_MODE.tagline.toLowerCase()}.
        </TimelineContent>

        <TimelineContent
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mb-10 text-center text-sm text-neutral-500"
        >
          Пакеты «{KARTO_FLOW_MODE.title}», «{KARTO_CREATIVE_MODE.title}» и «{KARTO_REVIEWS_MODE.title}» не
          суммируются — выберите нужный режим. Пакеты кредитов {KARTO_CREATIVE_MODE.title} — на фото и видео.
          Пакеты ответов действуют один месяц.
        </TimelineContent>

        {!user ? (
          <TimelineContent
            animationNum={1}
            timelineRef={pricingRef}
            customVariants={revealVariants}
            className="mb-10 flex justify-center px-2"
          >
            <p className="max-w-2xl rounded-2xl border border-[#84CC16]/35 bg-gradient-to-r from-[#84CC16]/12 via-white/70 to-[#2E5A43]/8 px-5 py-4 text-center text-sm leading-relaxed text-neutral-700 shadow-sm backdrop-blur-sm md:text-[15px]">
              <span className="font-semibold text-[#2E5A43]">Старт бесплатно:</span>{" "}
              {welcomePerksPricingNoteRu()}
            </p>
          </TimelineContent>
        ) : null}

        <div className="grid gap-14 overflow-visible md:grid-cols-[1fr_1.2fr] md:gap-16 lg:gap-20">
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
          <div className="flex flex-col justify-center space-y-12 overflow-visible">
            <TimelineContent
              animationNum={4}
              timelineRef={pricingRef}
              customVariants={revealVariants}
            >
              <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                Режим
              </h4>
              <PricingSwitchRow
                options={PRICING_MODE_LABELS}
                value={mode}
                onSwitch={(v) => {
                  setMode(v as "0" | "1" | "2")
                  setTariff("0")
                }}
                layoutId="karto-mode"
                largeLabels
              />
            </TimelineContent>

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
                  <p className="mt-3 text-sm text-neutral-500">{FLOW_CREDITS_PACK_BLURB}</p>
                  <button
                    type="button"
                    onClick={() => setTariffTableOpen(true)}
                    className="mt-2 text-sm font-semibold text-[#1F4E3D] underline decoration-[#1F4E3D]/35 underline-offset-2 hover:text-[#163d30]"
                  >
                    Таблица тарификации кредитов →
                  </button>
                </>
              ) : isReviews ? (
                <>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Пакет ответов
                  </h4>
                  <div className="relative -mx-2 w-[calc(100%+1rem)] sm:-mx-3 sm:w-[calc(100%+1.5rem)] md:-ml-4 md:-mr-14 md:w-[calc(100%+4.5rem)] lg:-mr-20 lg:w-[calc(100%+5.5rem)] xl:-mr-28 xl:w-[calc(100%+7rem)]">
                    <ReviewsPackageSwitch
                      options={AUTO_REPLY_OPTION_LABELS}
                      value={tariff}
                      onSwitch={setTariff}
                      layoutId="karto-reviews-tariff"
                    />
                  </div>
                  <p className="mt-3 text-sm text-neutral-500">
                    {formatAutoReplyVolume(reviewsPack.replies)} — на месяц
                  </p>
                </>
              ) : (
                <>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
                    Пакет кредитов
                  </h4>
                  <CreditsPackageSwitch
                    options={CREDIT_OPTION_LABELS}
                    value={tariff}
                    onSwitch={setTariff}
                    layoutId="karto-credits-tariff"
                  />
                  <p className="mt-3 text-sm text-neutral-500">
                    {enoughForCopy(creditPack.credits)}
                  </p>
                  <div className="mt-4 rounded-xl border border-[#84CC16]/30 bg-white/60 px-4 py-3 text-sm leading-relaxed text-neutral-600">
                    <p className="font-semibold text-neutral-800">
                      {CREDIT_PHOTO_4K} кредитов = одно фото 4K
                    </p>
                    <button
                      type="button"
                      onClick={() => setTariffTableOpen(true)}
                      className="mt-2 text-sm font-semibold text-[#1F4E3D] underline decoration-[#1F4E3D]/35 underline-offset-2 hover:text-[#163d30]"
                    >
                      Таблица тарификации →
                    </button>
                  </div>
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
                  <>
                    <RainbowButton
                      href="/login?returnUrl=/#pricing"
                      className="w-full min-w-0 inline-flex items-center justify-center"
                    >
                      Войти, чтобы выбрать тариф
                    </RainbowButton>
                    <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                      {welcomePerksPricingNoteRu()}
                    </p>
                  </>
                )}
              </div>
              <p className="text-sm text-neutral-500">
                {isReviews
                  ? "Без скрытых платежей. Пакет действует один месяц; неиспользованные ответы аннулируются. Перегенерация бесплатна."
                  : "Без скрытых платежей. Пакеты действуют 30 дней с даты оплаты; неиспользованные остатки по истечении периода аннулируются."}
              </p>
            </TimelineContent>
          </div>
        </div>
      </div>

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
                  <div className="rounded-xl bg-white/80 border border-neutral-200/80 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Режим</span>
                      <span className="font-medium text-neutral-900">
                        {isFlow
                          ? KARTO_FLOW_MODE.title
                          : isReviews
                            ? KARTO_REVIEWS_MODE.title
                            : KARTO_CREATIVE_MODE.title}
                      </span>
                    </div>
                    {isCreative ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Пакет</span>
                        <span className="font-medium text-neutral-900 text-right max-w-[60%]">
                          {CREDIT_OPTION_LABELS[tariffIndex]} — {enoughForCopy(creditPack.credits)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Объём</span>
                        <span className="font-medium text-neutral-900 text-right max-w-[60%]">
                          {isReviews
                            ? formatAutoReplyVolume(reviewsPack.replies)
                            : FLOW_OPTIONS[tariffIndex]}
                        </span>
                      </div>
                    )}
                    {!promoFieldsOpen ? (
                      <button
                        type="button"
                        onClick={() => setPromoFieldsOpen(true)}
                        className="mt-0.5 w-full rounded-lg py-2 text-left text-sm font-semibold text-[#1F4E3D] underline decoration-[#1F4E3D]/35 underline-offset-2 hover:text-[#163d30]"
                      >
                        Есть промокод
                      </button>
                    ) : (
                      <div className="mt-2 space-y-2 rounded-lg border border-dashed border-neutral-200 bg-white/60 px-3 py-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={promoCodeInput}
                            onChange={(e) => {
                              setPromoCodeInput(e.target.value.toUpperCase())
                              setPromoApplied(null)
                              setPromoError(null)
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Введите код"
                            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium uppercase tracking-wide text-neutral-900 placeholder:text-neutral-400 focus:border-[#1F4E3D]/40 focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/20"
                          />
                          <button
                            type="button"
                            onClick={() => void applyPromo()}
                            disabled={promoBusy || !promoCodeInput.trim()}
                            className="shrink-0 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:opacity-50"
                          >
                            {promoBusy ? "Проверка…" : "Применить"}
                          </button>
                        </div>
                        {promoError ? (
                          <p className="text-xs font-medium text-red-600">{promoError}</p>
                        ) : null}
                        {promoApplied ? (
                          <p className="text-xs font-semibold text-[#1F4E3D]">
                            {promoApplied.discountRub != null
                              ? `Скидка ${promoApplied.discountRub} ₽ учтена`
                              : `Скидка ${promoApplied.discountPercent}% учтена`}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setPromoFieldsOpen(false)
                            setPromoCodeInput("")
                            setPromoApplied(null)
                            setPromoError(null)
                          }}
                          className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
                        >
                          Скрыть
                        </button>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline border-t border-neutral-100 pt-2">
                      <span className="text-neutral-500">Сумма</span>
                      <div className="text-right">
                        {promoApplied ? (
                          <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0">
                            <span className="text-sm text-neutral-400 line-through">
                              {promoApplied.originalRub} ₽
                            </span>
                            <span className="text-2xl font-bold text-[#1F4E3D]">
                              {promoApplied.finalRub} ₽
                            </span>
                          </span>
                        ) : (
                          <span className="text-2xl font-bold text-[#1F4E3D]">
                            {currentPrice} ₽
                          </span>
                        )}
                      </div>
                    </div>
                    {isReviews && (
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200/80 bg-white/60 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={autoRenewEnabled}
                          onChange={(e) => setAutoRenewEnabled(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-[#1F4E3D] focus:ring-[#1F4E3D]/30"
                        />
                        <span className="text-sm leading-snug text-neutral-700">
                          <span className="block font-semibold text-neutral-900">
                            Включить автопродление пакета
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {autoRenewEnabled
                              ? `Раз в 30 дней с карты будет списываться ${promoApplied?.finalRub ?? currentPrice} ₽ за тот же объём ответов. Отключить или удалить карту можно в профиле в любой момент.`
                              : "Пакет не продлится автоматически — по истечении 30 дней остаток ответов аннулируется."}
                          </span>
                        </span>
                      </label>
                    )}
                    <p className="text-xs leading-relaxed text-neutral-500">
                      Нажимая «Подтверждаю», вы соглашаетесь с{" "}
                      <a
                        href="/payments-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[#1F4E3D] underline decoration-[#1F4E3D]/35 underline-offset-2"
                      >
                        Политикой платежей
                      </a>
                      {isReviews && autoRenewEnabled
                        ? `, включая автопродление пакета «Отзывы» на сумму ${promoApplied?.finalRub ?? currentPrice} ₽ каждые 30 дней до отключения в профиле.`
                        : "."}
                    </p>
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

      <CreditsTariffModal open={tariffTableOpen} onClose={() => setTariffTableOpen(false)} />
    </section>
  )
}
