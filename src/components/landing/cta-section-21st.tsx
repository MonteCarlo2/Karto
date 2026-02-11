"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface CTASection21stProps {
  variant?: "pricing" | "final"
  className?: string
}

export function CTASection21st({ variant = "final", className }: CTASection21stProps) {
  if (variant === "pricing") {
    return (
      <section
        className={cn(
          "py-20 md:py-24 relative overflow-hidden",
          className
        )}
      >
        <div className="absolute inset-0 opacity-95" style={{ background: "linear-gradient(135deg, #1F4E3D 0%, #2E5A43 100%)" }} />
        <div className="container relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 px-6">
          <div className="text-white text-center md:text-left">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
              Прозрачное ценообразование
            </h2>
            <p className="text-lg text-white/90">
              Стоимость — от 490 ₽ за полную карточку товара.
            </p>
            <p className="text-base text-white/80 mt-1">
              Без скрытых платежей и подписок.
            </p>
          </div>
          <Button
            size="lg"
            asChild
            className="shrink-0 bg-white text-primary hover:bg-white/90 h-12 px-8 text-base font-medium"
            style={{ color: "#1F4E3D" }}
          >
            <Link href="/pricing">
              Посмотреть тарифы
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section
      className={cn(
        "py-20 md:py-28 relative overflow-hidden bg-gradient-to-b from-muted/50 to-background",
        className
      )}
    >
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ backgroundColor: "#1F4E3D" }} />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-20 bg-primary/20" />
      <div className="container relative z-10 max-w-3xl mx-auto text-center px-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-card border border-border rounded-full shadow-sm mb-8">
          <Sparkles className="w-4 h-4 text-primary" style={{ color: "#1F4E3D" }} />
          <span className="text-sm font-medium">Начните прямо сейчас</span>
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight">
          Создайте первую карточку товара{" "}
          <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(to right, #1F4E3D, rgba(31,78,61,0.7))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            за несколько минут
          </span>
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Регистрация не требует карты. Начните бесплатно и оцените качество.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" asChild className="h-12 px-8 text-base gap-2" style={{ backgroundColor: "#1F4E3D" }}>
            <Link href="/studio?intro=true">
              Начать сейчас
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
            <Link href="/pricing">Посмотреть тарифы</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          ✓ Без кредитной карты &nbsp; ✓ Первая карточка со скидкой &nbsp; ✓ Поддержка
        </p>
      </div>
    </section>
  )
}
