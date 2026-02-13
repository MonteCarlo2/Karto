"use client"

import { useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Image from "next/image"
import { ScanSearch, BarChart3, FileText, CheckCircle, ImagePlus } from "lucide-react"

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger)
}

interface ProcessCardProps {
  title: string
  description: string
  side: "left" | "right"
  visual: "input" | "analysis" | "generation" | "result"
  index: number
  isActive: boolean
}

export function ProcessCard({ title, description, side, visual, index, isActive }: ProcessCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(cardRef, { once: true, margin: "-100px" })

  useEffect(() => {
    if (!cardRef.current || !isInView) return

    const card = cardRef.current
    const ctx = gsap.context(() => {
      // Анимация появления карточки
      gsap.fromTo(
        card,
        {
          opacity: 0,
          y: side === "left" ? -50 : 50,
          scale: 0.9,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.8,
          delay: index * 0.15,
          ease: "power3.out",
        }
      )

      // Параллакс эффект при скролле
      ScrollTrigger.create({
        trigger: card,
        start: "top 80%",
        end: "bottom 20%",
        scrub: 1,
        onUpdate: (self) => {
          const progress = self.progress
          gsap.to(card, {
            y: side === "left" ? -20 * progress : 20 * progress,
            rotation: side === "left" ? -1 * progress : 1 * progress,
            duration: 0.3,
          })
        },
      })
    }, card)

    return () => ctx.revert()
  }, [isInView, side, index])

  return (
    <div
      ref={cardRef}
      className={`relative flex items-center gap-12 ${
        side === "left" ? "flex-row" : "flex-row-reverse"
      }`}
    >
      {/* Текстовая часть */}
      <div className={`flex-1 ${side === "left" ? "pr-12 lg:pr-24" : "pl-12 lg:pl-24"}`}>
        <motion.div
          initial={{ opacity: 0, x: side === "left" ? -30 : 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: "#111111" }}
          >
            {title}
          </h3>
          <p
            className="text-lg md:text-xl leading-relaxed"
            style={{ color: "#666666" }}
          >
            {description}
          </p>
        </motion.div>
      </div>

      {/* Точка на линии */}
      <div className="relative z-20 flex-shrink-0">
        <motion.div
          className="w-6 h-6 rounded-full relative"
          style={{
            backgroundColor: isActive ? "#1F4E3D" : "#d1d5db",
            border: "4px solid #F5F5F0",
            boxShadow: isActive
              ? "0 0 0 8px rgba(31, 78, 61, 0.1), 0 0 20px rgba(31, 78, 61, 0.3)"
              : "none",
          }}
          animate={{
            scale: isActive ? [1, 1.2, 1] : 1,
          }}
          transition={{
            duration: 2,
            repeat: isActive ? Infinity : 0,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Визуальная часть (Карточка) */}
      <div className={`flex-1 ${side === "left" ? "pl-12 lg:pl-24" : "pr-12 lg:pr-24"}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative group"
          style={{ willChange: "transform, opacity" }}
        >
          {/* Карточка с улучшенными анимациями */}
          <div
            className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200 relative overflow-hidden"
            style={{ minHeight: "240px" }}
          >
            {/* Градиентный overlay при hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#1F4E3D]/0 via-[#1F4E3D]/0 to-[#1F4E3D]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />

            {/* Контент карточки */}
            <div className="relative z-10 h-full">
              {visual === "input" && <InputVisual />}
              {visual === "analysis" && <AnalysisVisual />}
              {visual === "generation" && <GenerationVisual />}
              {visual === "result" && <ResultVisual />}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// Компоненты визуализации для каждого шага
function InputVisual() {
  const scanLineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scanLineRef.current) return
    gsap.to(scanLineRef.current, {
      y: 128,
      duration: 2,
      repeat: -1,
      ease: "power2.inOut",
      yoyo: true,
    })
  }, [])

  return (
    <div className="h-full flex flex-col justify-center relative">
      <div className="relative w-full h-32 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300">
        {/* Сканирующая линия */}
        <motion.div
          ref={scanLineRef}
          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#1F4E3D] to-transparent opacity-80"
          style={{
            boxShadow: "0 0 12px rgba(31, 78, 61, 0.6)",
            filter: "blur(0.5px)",
          }}
        />
        {/* Иконка сканирования */}
        <div className="absolute top-2 right-2">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          >
            <ScanSearch className="w-5 h-5 text-[#1F4E3D]" strokeWidth={2} />
          </motion.div>
        </div>
        {/* Пульсирующие точки загрузки */}
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#1F4E3D]"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AnalysisVisual() {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    barsRef.current.forEach((bar, i) => {
      if (!bar) return
      gsap.fromTo(
        bar,
        { height: 0 },
        {
          height: bar.dataset.height || "60%",
          duration: 1,
          delay: i * 0.15,
          ease: "power3.out",
        }
      )
    })
  }, [])

  return (
    <div className="h-full flex flex-col justify-center space-y-3">
      <div className="relative h-32 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 flex items-end justify-center gap-4">
        {[
          { height: "60%", color: "#9ca3af" },
          { height: "45%", color: "#9ca3af" },
          { height: "85%", color: "#1F4E3D" },
        ].map((bar, i) => (
          <div
            key={i}
            ref={(el) => { barsRef.current[i] = el; }}
            data-height={bar.height}
            className="rounded-t relative overflow-hidden"
            style={{
              width: "28%",
              backgroundColor: bar.color,
            }}
          >
            {/* Анимированный градиент внутри столбика */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent"
              animate={{
                y: ["-100%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "linear",
              }}
            />
          </div>
        ))}
        {/* Иконка анализа */}
        <div className="absolute top-2 right-2">
          <BarChart3 className="w-5 h-5 text-[#1F4E3D]" strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}

function GenerationVisual() {
  const linesRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    linesRef.current.forEach((line, i) => {
      if (!line) return
      gsap.fromTo(
        line,
        { width: 0, opacity: 0 },
        {
          width: line.dataset.width || "100%",
          opacity: 1,
          duration: 0.5,
          delay: i * 0.15,
          ease: "power2.out",
        }
      )
    })
  }, [])

  return (
    <div className="h-full flex flex-col justify-center space-y-2.5">
      {[
        { width: "100%" },
        { width: "90%" },
        { width: "75%" },
        { width: "85%" },
        { width: "70%" },
      ].map((line, i) => (
        <div
          key={i}
          ref={(el) => { linesRef.current[i] = el; }}
          data-width={line.width}
          className="h-3.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded relative overflow-hidden"
        >
          {/* Эффект "печати" - белая полоска движется слева направо */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{
              duration: 1.5,
              delay: i * 0.2 + 0.3,
              ease: "easeInOut",
            }}
          />
        </div>
      ))}
      {/* Иконка генерации */}
      <div className="pt-2 flex items-center gap-2">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <FileText className="w-5 h-5 text-[#1F4E3D]" strokeWidth={1.5} />
        </motion.div>
        <span className="text-xs text-gray-500">Генерация описания...</span>
      </div>
    </div>
  )
}

function ResultVisual() {
  const checkmarkRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!checkmarkRef.current || !badgeRef.current) return

    // Анимация появления галочки
    gsap.fromTo(
      checkmarkRef.current,
      { scale: 0, rotation: -180 },
      {
        scale: 1,
        rotation: 0,
        duration: 0.6,
        delay: 0.5,
        ease: "back.out(2)",
      }
    )

    // Анимация появления бейджа
    gsap.fromTo(
      badgeRef.current,
      { opacity: 0, y: 10, scale: 0.8 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        delay: 0.8,
        ease: "power2.out",
      }
    )
  }, [])

  return (
    <div className="h-full flex flex-col space-y-3">
      <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden group">
        <Image
          src="/hero-image.png"
          alt="Готовая карточка"
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        {/* Overlay при hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F4E3D]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Зеленая галочка */}
        <motion.div
          ref={checkmarkRef}
          className="absolute top-2 right-2 w-10 h-10 bg-[#1F4E3D] rounded-full flex items-center justify-center shadow-lg"
        >
          <CheckCircle className="w-6 h-6 text-white" strokeWidth={2.5} fill="white" />
        </motion.div>

        {/* Бейдж "High Margin" */}
        <motion.div
          ref={badgeRef}
          className="absolute bottom-2 left-2 px-3 py-1.5 bg-[#1F4E3D] text-white text-xs font-bold rounded-lg shadow-lg backdrop-blur-sm"
          style={{ backgroundColor: "rgba(31, 78, 61, 0.95)" }}
        >
          High Margin
        </motion.div>
      </div>
    </div>
  )
}
