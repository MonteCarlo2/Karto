"use client"

import { useEffect, useId, useState } from "react"
import { motion } from "framer-motion"
import { Marquee } from "@/components/ui/marquee"
import { cn } from "@/lib/utils"

type PatternType = "studio" | "retouch" | "copywriter" | "infographic"

type BentoCardProps = {
  title: string
  description: string
  className?: string
  glow?: boolean
  accent: string
  accentGradient?: string
  tag: string
  /** Узор фона: заполняет блок, убирает пустоту */
  pattern: PatternType
}

function PatternStudio() {
  return (
    <div
      className="absolute inset-0"
      aria-hidden
      style={{
        background: `
          radial-gradient(
            circle at 50% 50%,
            rgba(255,255,255,0.85) 0%,
            rgba(200,230,180,0.5) 25%,
            rgba(132,204,22,0.28) 50%,
            rgba(132,204,22,0.12) 70%,
            transparent 100%
          )
        `,
      }}
    />
  )
}

function PatternRetouch() {
  const id = useId().replace(/:/g, "")
  const w = 180
  const h = 16
  const horizontal: Array<{ d: string }> = []
  for (let row = 0; row < 50; row++) {
    const y = row * (h * 0.6) + (row % 2) * 1
    let d = `M 0 ${y}`
    for (let x = 0; x <= w + 30; x += 6) {
      const wobble = Math.sin((x + row * 2) * 0.1) * 0.8
      d += ` L ${x} ${y + wobble}`
    }
    horizontal.push({ d })
  }
  const diagStep = 5
  const diagLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (let i = 0; i < 120; i++) {
    const x1 = (i * 11) % (w + 40) - 10
    const y1 = -5
    diagLines.push({ x1, y1, x2: x1 + 60, y2: h * 4 + 10 })
  }
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
      <defs>
        <pattern id={`retouch-h-${id}`} width={w} height={h * 4} patternUnits="userSpaceOnUse">
          {horizontal.map((line, i) => (
            <path
              key={i}
              d={line.d}
              fill="none"
              stroke="#84CC16"
              strokeWidth="0.9"
              strokeLinecap="round"
              opacity="0.4"
            />
          ))}
        </pattern>
        <pattern id={`retouch-d-${id}`} width={w + 60} height={h * 4} patternUnits="userSpaceOnUse" patternTransform="rotate(-25)">
          {diagLines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="#1F4E3D"
              strokeWidth="0.7"
              strokeLinecap="round"
              opacity="0.18"
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#retouch-h-${id})`} />
      <rect width="100%" height="100%" fill={`url(#retouch-d-${id})`} />
    </svg>
  )
}

function PatternCopywriter() {
  const chars = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")
  const count = 120
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.11]" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const char = chars[i % chars.length]
        return (
          <span
            key={i}
            className="absolute select-none font-serif font-medium text-[#1F4E3D]"
            style={{
              fontSize: 10 + (i % 6) * 4,
              left: `${(i * 7.3 + (i % 5) * 4) % 98}%`,
              top: `${(i * 4.1 + (i % 3) * 3) % 96}%`,
              transform: `rotate(${-12 + (i % 9) * 6}deg)`,
            }}
          >
            {char}
          </span>
        )
      })}
    </div>
  )
}

function PatternInfographic() {
  const id = useId().replace(/:/g, "")
  const amplitude = 12
  const period = 0.025
  const spacing = 22
  const lineCount = 14
  const paths: string[] = []
  for (let i = 0; i < lineCount; i++) {
    const baseY = 20 + i * spacing
    let d = `M 0 ${baseY}`
    for (let x = 0; x <= 500; x += 4) {
      const y = baseY + Math.sin(x * period) * amplitude
      d += ` L ${x} ${y}`
    }
    paths.push(d)
  }
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 500 320"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`line-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#84CC16" />
          <stop offset="100%" stopColor="#1F4E3D" />
        </linearGradient>
      </defs>
      {/* Плавные параллельные волнистые линии во всю длину — как на скриншоте 3 */}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={i % 2 === 0 ? `url(#line-grad-${id})` : "#1F4E3D"}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={i % 2 === 0 ? 0.5 : 0.4}
        />
      ))}
    </svg>
  )
}

function CardPattern({ type }: { type: PatternType }) {
  switch (type) {
    case "studio":
      return <PatternStudio />
    case "retouch":
      return <PatternRetouch />
    case "copywriter":
      return <PatternCopywriter />
    case "infographic":
      return <PatternInfographic />
    default:
      return null
  }
}

function BentoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
}

function BentoCard({ title, description, className, glow, accent, accentGradient, tag, pattern }: BentoCardProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <motion.article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-black/10 bg-white/90 p-6 sm:p-7 shadow-sm backdrop-blur-sm",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:border-[#84CC16]/30",
        glow && "hover:shadow-[#84CC16]/25",
        className
      )}
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 },
      }}
    >
      {/* Узор фона — заполняет блок, убирает пустоту (только на клиенте, чтобы избежать SSR-гидрации) */}
      {mounted && <CardPattern type={pattern} />}
      {/* Салатовая полоска слева — при наведении */}
      <div
        className="absolute left-0 top-0 bottom-0 z-[1] w-1 rounded-l-2xl bg-[#84CC16] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
      {/* Тег-подсказка: в левом верхнем углу, при наведении */}
      <div
        className="absolute left-3 top-3 z-10 -translate-x-1 translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
        aria-hidden
      >
        <span className="inline-block rounded-full border border-[#84CC16]/50 bg-[#84CC16]/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#1F4E3D] shadow-sm">
          {tag}
        </span>
      </div>
      {/* Крупная буква на фоне */}
      <div
        className="pointer-events-none absolute -right-2 -top-2 z-[1] select-none font-serif text-[8rem] font-bold leading-none tracking-tighter text-[#84CC16]/25 sm:text-[9rem] md:-right-4 md:-top-4 md:text-[10rem]"
        aria-hidden
      >
        {accent}
      </div>
      {accentGradient && (
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-50"
          style={{ background: accentGradient }}
          aria-hidden
        />
      )}
      {glow && (
        <div className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#84CC16]/15 blur-3xl" />
        </div>
      )}
      {/* Текст: по умолчанию скрыт, появляется только при наведении */}
      <div className="relative z-10 flex min-h-[140px] flex-col justify-end opacity-0 translate-y-1 sm:min-h-[160px] transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
        <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">
          {title}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:mt-4 sm:text-lg">
          {description}
        </p>
      </div>
    </motion.article>
  )
}

const MARQUEE_IMAGES = [
  // 8 товарных карточек
  "/gallery/card-1.png",
  "/gallery/card-2.png",
  "/gallery/card-3.png",
  "/gallery/card-4.png",
  "/gallery/card-5.png",
  "/gallery/card-6.png",
  "/gallery/card-7.jpeg",
  "/gallery/card-8.png",
  // 9‑я — тетрадка
  "/gallery/for-gallery.jpg",
]

function MarqueeColumn({
  images,
  reverse,
  duration,
}: {
  images: string[]
  reverse?: boolean
  duration: number
}) {
  return (
    <Marquee
      vertical
      reverse={reverse}
      repeat={8}
      duration={duration}
      className="h-full w-full [--gap:0.75rem]"
    >
      {images.map((src, idx) => (
        <div
          key={`${src}-${idx}`}
          className="relative w-full shrink-0 overflow-hidden rounded-3xl shadow-sm"
        >
          <img
            src={src}
            alt="Карточка товара"
            className="block w-full h-auto"
            draggable={false}
          />
        </div>
      ))}
    </Marquee>
  )
}

export function TeamResultSection() {
  const leftImages = MARQUEE_IMAGES.filter((_, i) => i % 2 === 0)
  const rightImages = MARQUEE_IMAGES.filter((_, i) => i % 2 === 1)

  return (
    <section className="relative overflow-hidden bg-[#F5F5F0] py-8 md:py-10">
      <div className="mx-auto max-w-[1800px] px-3 sm:px-4 lg:px-5">
        <motion.div
          className="mb-6 max-w-4xl"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h2
            className="text-3xl font-bold leading-tight tracking-tight md:text-5xl md:leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="bg-gradient-to-r from-[#1F4E3D] via-[#2d6b4e] to-[#1F4E3D] bg-clip-text text-transparent">
              Весь штат сотрудников
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#1F4E3D] to-[#3d7a5c] bg-clip-text text-transparent">
              внутри одной кнопки
            </span>
          </h2>
        </motion.div>

        <div className="grid min-h-[88vh] grid-cols-12 gap-3">
          <motion.div
            className="col-span-12 lg:col-span-8"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
          >
            <BentoGrid>
              <BentoCard
                className="sm:col-span-2"
                glow
                pattern="studio"
                tag="Студия"
                accent="С"
                accentGradient="linear-gradient(135deg, transparent 40%, rgba(132,204,22,0.05) 100%)"
                title="Своя студия в кармане"
                description="Забудьте об аренде за 5000₽/час и логистике товаров. Генерируйте профессиональный свет и локации мгновенно."
              />
              <BentoCard
                pattern="retouch"
                tag="Ретушь"
                accent="Р"
                accentGradient="linear-gradient(135deg, transparent 50%, rgba(31,78,61,0.03) 100%)"
                title="Ретушер"
                description="Автоматическая цветокоррекция и удаление дефектов. Идеальный кадр без ожидания."
              />
              <BentoCard
                pattern="copywriter"
                tag="Текст"
                accent="Т"
                accentGradient="linear-gradient(135deg, transparent 50%, rgba(31,78,61,0.03) 100%)"
                title="Копирайтер и SEO"
                description="Генерация смыслов, которые продают. Полное соответствие алгоритмам маркетплейсов."
              />
              <BentoCard
                className="sm:col-span-2"
                pattern="infographic"
                tag="Инфографика"
                accent="И"
                accentGradient="linear-gradient(135deg, transparent 50%, rgba(132,204,22,0.04) 100%)"
                title="Дизайнер инфографики"
                description="Сборка инфографики по законам маркетинга. Минимум правок — максимум конверсии."
              />
            </BentoGrid>
          </motion.div>

          <motion.div
            className="col-span-12 lg:col-span-4"
            initial={{ opacity: 0, x: 26 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.65, ease: "easeOut", delay: 0.15 }}
          >
            <div className="relative h-[88vh] min-h-[760px]">
              <div className="grid h-full grid-cols-2 gap-2">
                <MarqueeColumn images={leftImages} reverse duration={22} />
                <MarqueeColumn images={rightImages} reverse duration={31} />
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#F5F5F0] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#F5F5F0] to-transparent" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

