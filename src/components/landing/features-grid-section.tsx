"use client"

import { Shield, Zap, Image as ImageIcon, CheckCircle2, Sparkles, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

const features = [
  {
    icon: Shield,
    title: "Без искажений",
    description: "Товар сохраняется точно таким, каким вы его загрузили. Никаких перерисовок.",
  },
  {
    icon: Zap,
    title: "Молниеносная скорость",
    description: "Полная карточка товара готова за 2–3 минуты.",
  },
  {
    icon: ImageIcon,
    title: "Профессиональные шаблоны",
    description: "Готовые форматы под Wildberries, Ozon и другие маркетплейсы.",
  },
  {
    icon: CheckCircle2,
    title: "SEO-оптимизация",
    description: "Названия и описания оптимизированы для поиска на маркетплейсах.",
  },
  {
    icon: Sparkles,
    title: "Умная генерация",
    description: "ИИ создаёт контент, который действительно продаёт.",
  },
  {
    icon: TrendingUp,
    title: "Рекомендации по цене",
    description: "Расчёт оптимальной цены на основе анализа рынка и конкурентов.",
  },
]

export function FeaturesGridSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="mx-auto max-w-5xl px-6 space-y-12">
        <div className="grid items-center gap-4 md:grid-cols-2 md:gap-12">
          <h2 className="text-3xl md:text-4xl font-semibold text-foreground">
            Почему выбирают KARTO
          </h2>
          <p className="max-w-sm text-muted-foreground sm:ml-auto">
            Профессиональные инструменты для создания продающих карточек без лишних усилий.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="space-y-3 group">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                    style={{ backgroundColor: "rgba(31,78,61,0.12)", color: "#1F4E3D" }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
