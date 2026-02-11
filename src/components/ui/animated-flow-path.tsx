"use client"

import { useEffect, useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger)
}

interface AnimatedFlowPathProps {
  containerRef: React.RefObject<HTMLElement | null>
}

/**
 * Улучшенный компонент анимированной линии потока
 * Использует GSAP для более плавных и сложных анимаций
 */
export function AnimatedFlowPath({ containerRef }: AnimatedFlowPathProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const manifestPathRef = useRef<SVGPathElement>(null)
  const timelinePathRef = useRef<SVGPathElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  // Трансформы для анимации
  const manifestProgress = useTransform(scrollYProgress, [0, 0.4], [0, 1])
  const timelineProgress = useTransform(scrollYProgress, [0.4, 1], [0, 1])

  useEffect(() => {
    if (!manifestPathRef.current || !timelinePathRef.current) return

    const manifestPath = manifestPathRef.current
    const timelinePath = timelinePathRef.current

    // Получаем длину путей
    const manifestLength = manifestPath.getTotalLength()
    const timelineLength = timelinePath.getTotalLength()

    // Устанавливаем strokeDasharray
    manifestPath.style.strokeDasharray = `${manifestLength}`
    timelinePath.style.strokeDasharray = `${timelineLength}`

    // GSAP анимация для более плавного эффекта
    ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top bottom",
      end: "bottom top",
      scrub: 1,
      onUpdate: (self) => {
        const progress = self.progress

        // Манифест линия (первые 40% скролла)
        if (progress <= 0.4) {
          const manifestProgress = progress / 0.4
          gsap.to(manifestPath, {
            strokeDashoffset: manifestLength * (1 - manifestProgress),
            opacity: manifestProgress > 0.1 ? 1 : manifestProgress * 10,
            duration: 0.1,
          })
        }

        // Таймлайн линия (последние 60% скролла)
        if (progress >= 0.4) {
          const timelineProgress = (progress - 0.4) / 0.6
          gsap.to(timelinePath, {
            strokeDashoffset: timelineLength * (1 - timelineProgress),
            opacity: timelineProgress > 0.1 ? 1 : timelineProgress * 10,
            duration: 0.1,
          })
        }
      },
    })
  }, [containerRef])

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 1 }}>
      <svg
        ref={svgRef}
        className="absolute w-full h-full"
        viewBox="0 0 1200 4000"
        preserveAspectRatio="xMidYMin meet"
        style={{ minHeight: "100%", willChange: "transform" }}
      >
        {/* Часть А: Линия огибает заголовок слева (изящный изгиб) */}
        <motion.path
          ref={manifestPathRef}
          d="M 600 0 Q 180 180 120 380 Q 180 580 600 720"
          fill="none"
          stroke="#1F4E3D"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            opacity: useTransform(manifestProgress, [0, 0.1, 1], [0, 1, 1]),
            filter: "drop-shadow(0 2px 4px rgba(31, 78, 61, 0.2))",
            willChange: "stroke-dashoffset, opacity",
          }}
        />

        {/* Часть Б: Вертикальная линия вниз (таймлайн) */}
        <motion.path
          ref={timelinePathRef}
          d="M 600 720 L 600 4000"
          fill="none"
          stroke="#1F4E3D"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            opacity: useTransform(timelineProgress, [0, 0.1, 1], [0, 1, 1]),
            filter: "drop-shadow(0 1px 2px rgba(31, 78, 61, 0.15))",
            willChange: "stroke-dashoffset, opacity",
          }}
        />

        {/* Декоративные точки вдоль линии */}
        {[720, 1200, 1800, 2400].map((y, i) => (
          <motion.circle
            key={i}
            cx="600"
            cy={y}
            r="4"
            fill="#1F4E3D"
            initial={{ scale: 0, opacity: 0 }}
            style={{
              opacity: useTransform(timelineProgress, [i * 0.25, i * 0.25 + 0.1, 1], [0, 1, 1]),
              scale: useTransform(timelineProgress, [i * 0.25, i * 0.25 + 0.1, 1], [0, 1, 1]),
            }}
          />
        ))}
      </svg>
    </div>
  )
}
