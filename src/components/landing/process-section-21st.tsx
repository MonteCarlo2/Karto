"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useInView } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowRight, Upload, FileText, ImageIcon, TrendingUp } from "lucide-react"

const PRIMARY = "#1F4E3D"
const BG = "#F5F5F0"

const steps: {
  id: string
  stage: string
  title: string
  short: string
  /** Путь к гифке/скрину этапа (опционально). */
  mediaSrc?: string
  mediaAlt?: string
}[] = [
  {
    id: "understanding",
    stage: "Понимание",
    title: "Загружаете товар и контекст",
    short: "Фото, категория, пожелания — система фиксирует идею.",
    mediaSrc: undefined,
    mediaAlt: "Экран этапа Понимание",
  },
  {
    id: "description",
    stage: "Описание",
    title: "ИИ создаёт продающие тексты",
    short: "Четыре стиля, название, блоки, инфографика.",
    mediaSrc: undefined,
    mediaAlt: "Экран этапа Описание",
  },
  {
    id: "visual",
    stage: "Визуал",
    title: "Генерация изображений карточки",
    short: "Варианты визуала, выбор лучшего, серия снимков.",
    mediaSrc: undefined,
    mediaAlt: "Экран этапа Визуал",
  },
  {
    id: "price",
    stage: "Цена",
    title: "Рекомендации и итог",
    short: "Анализ рынка, цена, готовая карточка для выгрузки.",
    mediaSrc: undefined,
    mediaAlt: "Экран этапа Цена",
  },
]

/** Мини-макет экрана этапа (плейсхолдер под гифку), чтобы карточка не выглядела пустой */
function StepMockup({ step, index }: { step: (typeof steps)[0]; index: number }) {
  if (step.mediaSrc) {
    return (
      <div className="absolute inset-0 rounded-xl overflow-hidden bg-muted">
        <Image
          src={step.mediaSrc}
          alt={step.mediaAlt || step.stage}
          fill
          className="object-cover object-top"
        />
      </div>
    )
  }
  // Стилизованные «мини-интерфейсы» по референсам (Framer/Pixso — вложенный UI)
  return (
    <div className="absolute inset-0 rounded-xl overflow-hidden bg-white/90 border border-black/5 shadow-inner flex items-center justify-center p-4">
      {index === 0 && (
        <div className="w-full max-w-[200px] space-y-2">
          <div className="h-9 rounded-lg bg-muted border border-border flex items-center gap-2 px-3">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Фото товара</span>
          </div>
          <div className="h-8 rounded bg-muted/70 border border-border/50" />
          <div className="h-8 rounded bg-muted/50 border border-border/50 w-[80%]" />
        </div>
      )}
      {index === 1 && (
        <div className="w-full max-w-[200px] space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 rounded-full bg-muted" style={{ width: `${60 + i * 20}%` }} />
          ))}
          <div className="flex gap-1 pt-1">
            {["Офиц.", "Продаж.", "Структ.", "Бал."].map((l) => (
              <span key={l} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium" style={{ color: PRIMARY }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      {index === 2 && (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[180px]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted border border-border flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
      {index === 3 && (
        <div className="w-full max-w-[200px] space-y-2 text-center">
          <div className="text-2xl font-bold tracking-tight" style={{ color: PRIMARY }}>₽ 1 490</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Рекомендация</div>
          <div className="h-6 rounded-full bg-primary/20 w-full max-w-[120px] mx-auto" />
        </div>
      )}
    </div>
  )
}

function BentoCard({
  step,
  index,
  className,
  span = false,
  delay = 0,
}: {
  step: (typeof steps)[0]
  index: number
  className?: string
  span?: boolean
  delay?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-60px" })
  const rotation = index % 2 === 0 ? -0.5 : 0.5

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 40, rotate: rotation }}
      animate={isInView ? { opacity: 1, y: 0, rotate: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "relative rounded-2xl md:rounded-3xl bg-white border border-black/[0.06] shadow-lg shadow-black/[0.04] overflow-hidden",
        "flex flex-col",
        span ? "md:col-span-2" : "",
        className
      )}
    >
      <div className="flex-1 flex flex-col p-5 sm:p-6 md:p-7 min-h-0">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl text-white text-base sm:text-lg font-bold shrink-0"
            style={{ backgroundColor: PRIMARY }}
          >
            {index + 1}
          </span>
          <span
            className="text-xs sm:text-sm font-semibold uppercase tracking-wider"
            style={{ color: PRIMARY }}
          >
            {step.stage}
          </span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight mb-1.5">
          {step.title}
        </h3>
        <p className="text-sm text-muted-foreground leading-snug mb-4">
          {step.short}
        </p>
        <div className="relative flex-1 min-h-[140px] sm:min-h-[160px] rounded-xl overflow-hidden mt-auto">
          <StepMockup step={step} index={index} />
        </div>
      </div>
    </motion.article>
  )
}

export function ProcessSection21st() {
  return (
    <section
      className="relative overflow-hidden px-4 sm:px-6 py-14 md:py-20"
      style={{ backgroundColor: BG }}
    >
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, ${PRIMARY} 1px, transparent 1px), linear-gradient(to bottom, ${PRIMARY} 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Заголовок — крупно, по референсам */}
        <div className="text-center mb-10 md:mb-14">
          <span
            className="inline-block text-[11px] sm:text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4"
            style={{ color: PRIMARY, backgroundColor: "rgba(31,78,61,0.12)" }}
          >
            Как это работает
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-tight px-2">
            Хаос идей превращается в{" "}
            <span className="italic" style={{ color: PRIMARY }}>
              структуру
            </span>
          </h2>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Четыре этапа одного потока — от загрузки до готовой карточки для маркетплейсов.
          </p>
        </div>

        {/* Бенто-сетка: необычный порядок, крупные карточки */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
          <BentoCard step={steps[0]} index={0} span className="md:row-span-2 md:min-h-[420px]" delay={0} />
          {/* Блок-цитата «всё в одном потоке» — по референсам (bento.me, quote card) */}
          <motion.div
            initial={{ opacity: 0, y: 24, rotate: 1.2 }}
            whileInView={{ opacity: 1, y: 0, rotate: 1.2 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative rounded-2xl md:rounded-3xl overflow-hidden p-6 sm:p-8 flex flex-col justify-center min-h-[160px] sm:min-h-[180px] shadow-xl shadow-black/10"
            style={{ backgroundColor: PRIMARY, color: "white" }}
          >
            <span className="text-4xl sm:text-5xl font-serif leading-none opacity-80">«</span>
            <p className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight mt-1">
              Всё в одном потоке
            </p>
            <p className="text-sm sm:text-base text-white/80 mt-1">
              Без переключения вкладок и потери контекста
            </p>
          </motion.div>
          <BentoCard step={steps[1]} index={1} delay={0.08} />
          <BentoCard step={steps[2]} index={2} delay={0.12} />
          <BentoCard step={steps[3]} index={3} span delay={0.16} />
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="flex justify-center pt-8 pb-2"
        >
          <Button
            size="lg"
            asChild
            className="gap-2 shadow-xl text-base h-12 px-8 rounded-xl"
            style={{ backgroundColor: PRIMARY }}
          >
            <Link href="/studio?intro=true">
              Создать карточку
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
