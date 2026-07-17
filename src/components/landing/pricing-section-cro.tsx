"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShineBorderCard } from "@/components/ui/shine-border-card"
import { cn } from "@/lib/utils"

const PAYMENT_LOGOS = [
  { name: "Мир", path: "/logos/mir.svg" },
  { name: "СБП", path: "/logos/sbp.svg" },
]

function PriceCard({
  title,
  volume,
  price,
  slogan,
  scarcity,
  shine,
  className,
}: {
  title: string
  volume: string
  price: string
  slogan: string
  scarcity?: string
  shine?: boolean
  className?: string
}) {
  const content = (
    <>
      <h3 className="text-lg font-bold tracking-tight text-[#1F4E3D]">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{volume}</p>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-tight text-foreground">
        {price}
        <span className="text-base font-normal text-muted-foreground"> ₽</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Без скрытых платежей</p>
      <p className="mt-3 text-sm leading-snug text-foreground/90">{slogan}</p>
      {scarcity && (
        <p className="mt-2 text-xs font-medium text-[#84CC16]">{scarcity}</p>
      )}
      <Button asChild size="sm" className="mt-6 w-full" variant={shine ? "default" : "outline"}>
        <Link href="/studio">Выбрать</Link>
      </Button>
    </>
  )

  if (shine) {
    return (
      <ShineBorderCard className={className}>
        {content}
      </ShineBorderCard>
    )
  }

  return (
    <motion.div
      className={cn("rounded-2xl border border-[#1F4E3D]/15 bg-white/80 p-6", className)}
      initial={false}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {content}
    </motion.div>
  )
}

export function PricingSectionCRO() {
  return (
    <section id="pricing" className="bg-[#F5F5F0] py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero: акция + заголовок + подзаголовок */}
        <motion.div
          className="mb-12 text-center md:mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="mb-4 inline-block"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          >
            <Badge className="bg-[#84CC16]/20 text-[#1F4E3D] border-[#84CC16]/40 hover:bg-[#84CC16]/30">
              🎁 Дарю 3 генерации при регистрации
            </Badge>
          </motion.div>
          <h2
            className="text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl"
            style={{ fontFamily: "var(--font-serif)", color: "#1F4E3D" }}
          >
            Инвестируйте в результат, а не в подписки
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
            Платите только за готовые карточки или генерации. Без VPN и зарубежных карт.
          </p>
        </motion.div>

        {/* Два крыла: grid 12 cols */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
          {/* ЛЕВОЕ КРЫЛО: ПОТОК */}
          <div className="space-y-6 lg:col-span-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F4E3D]/80">
                Поток
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Полная упаковка товара: Визуал, SEO-описание и Анализ ниши за 5 минут.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <PriceCard
                title="Быстрый старт"
                volume="1 Поток"
                price="299"
                slogan="Для тех, кто хочет попробовать магию"
              />
              <PriceCard
                title="Набор селлера"
                volume="5 Потоков"
                price="1 190"
                slogan="Выгода 305 ₽. Идеально для новой категории"
                scarcity="🔥 Самый выбираемый тариф этой недели"
                shine
              />
              <PriceCard
                title="Доминирование"
                volume="15 Потоков"
                price="2 990"
                slogan="Всего 199 ₽ за товар. Ваш личный отдел дизайна"
              />
            </div>
          </div>

          {/* ПРАВОЕ КРЫЛО: СВОБОДНОЕ ТВОРЧЕСТВО */}
          <div className="space-y-6 lg:col-span-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F4E3D]/80">
                Креатив
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Чистая мощь интеллекта. Генерация любых образов по вашим правилам.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <PriceCard
                title="Микро"
                volume="10 генераций"
                price="249"
                slogan="Для точечных правок"
              />
              <PriceCard
                title="Базовый"
                volume="30 генераций"
                price="590"
                slogan="Оптимально для регулярного контента"
              />
              <PriceCard
                title="Профи"
                volume="100 генераций"
                price="1 490"
                slogan="14.9 ₽ за кадр. Мощь агентского уровня"
                shine
              />
            </div>
          </div>
        </div>

        {/* Социальное доказательство: оплата */}
        <motion.div
          className="mt-14 flex flex-wrap items-center justify-center gap-6 rounded-xl border border-[#1F4E3D]/10 bg-white/50 px-6 py-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <span className="text-sm font-medium text-muted-foreground">
            Безопасная оплата через РФ-шлюзы
          </span>
          <div className="flex items-center gap-4">
            {PAYMENT_LOGOS.map(({ name, path }) => (
              <span
                key={name}
                className="text-xs font-medium uppercase tracking-wider text-[#1F4E3D]/70"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
