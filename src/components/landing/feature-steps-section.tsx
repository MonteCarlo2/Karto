"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { cn } from "@/lib/utils"

const features = [
  {
    step: "Шаг 1",
    title: "Загрузка фото",
    content: "Загрузите сырые фотографии вашего товара. Поддерживаются все популярные форматы.",
    image: "https://images.unsplash.com/photo-1556742049-0cf4d7279cc5?q=80&w=2070&auto=format&fit=crop",
  },
  {
    step: "Шаг 2",
    title: "Уточнение деталей",
    content: "Укажите характеристики, категорию и особенности товара в простой форме.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop",
  },
  {
    step: "Шаг 3",
    title: "AI-генерация",
    content: "ИИ создаёт оптимизированное название, описание и рекомендованную цену.",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2031&auto=format&fit=crop",
  },
  {
    step: "Шаг 4",
    title: "Готовый результат",
    content: "Скачайте полный набор: изображения, тексты и метаданные для публикации.",
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=1974&auto=format&fit=crop",
  },
]

export function FeatureStepsSection() {
  const [currentFeature, setCurrentFeature] = useState(0)
  const [progress, setProgress] = useState(0)
  const autoPlayInterval = 4000

  useEffect(() => {
    const timer = setInterval(() => {
      if (progress < 100) {
        setProgress((prev) => prev + 100 / (autoPlayInterval / 100))
      } else {
        setCurrentFeature((prev) => (prev + 1) % features.length)
        setProgress(0)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [progress, features.length, autoPlayInterval])

  return (
    <div className={cn("py-12 md:py-20 bg-gradient-to-b from-white to-muted/30")}>
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-center">
          Как это работает
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-center mb-12">
          Простой процесс создания идеальной карточки товара в несколько шагов
        </p>

        <div className="flex flex-col md:grid md:grid-cols-2 gap-8 md:gap-12 max-w-6xl mx-auto">
          <div className="order-2 md:order-1 space-y-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="flex items-start gap-4 md:gap-6"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: index === currentFeature ? 1 : 0.3 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  className={cn(
                    "w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 shrink-0",
                    index === currentFeature
                      ? "bg-primary border-primary text-primary-foreground scale-110"
                      : "bg-muted border-muted-foreground"
                  )}
                  style={index === currentFeature ? { backgroundColor: "#1F4E3D", borderColor: "#1F4E3D" } : undefined}
                >
                  {index <= currentFeature ? (
                    <span className="text-sm font-bold">✓</span>
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg md:text-xl font-semibold">
                    {feature.title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground mt-1">
                    {feature.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="order-1 md:order-2 relative h-[240px] md:h-[320px] lg:h-[400px] overflow-hidden rounded-2xl bg-muted">
            <AnimatePresence mode="wait">
              {features.map(
                (feature, index) =>
                  index === currentFeature && (
                    <motion.div
                      key={index}
                      className="absolute inset-0 rounded-2xl overflow-hidden"
                      initial={{ y: 60, opacity: 0, rotateX: -15 }}
                      animate={{ y: 0, opacity: 1, rotateX: 0 }}
                      exit={{ y: -60, opacity: 0, rotateX: 15 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    >
                      <Image
                        src={feature.image}
                        alt={feature.step}
                        className="w-full h-full object-cover"
                        width={800}
                        height={500}
                        unoptimized
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-background via-background/50 to-transparent" />
                    </motion.div>
                  )
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
