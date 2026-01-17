"use client"

import { Metadata } from "next"
import { motion } from "framer-motion"
import { Section } from "@/components/layout/section"
import { PricingCard } from "@/components/ui/pricing-card"
import { CheckCircle2, Sparkles, Zap, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function PricingPage() {
  return (
    <>
      {/* Hero Section */}
      <Section className="pt-24 pb-16 md:pt-32 md:pb-20 relative overflow-hidden gradient-mesh">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-border rounded-full shadow-sm mb-6">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Прозрачное ценообразование</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Выберите свой тариф
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
            Платите только за то, что используете. Без скрытых подписок и обязательств.
          </p>
        </motion.div>
      </Section>

      {/* Pricing Cards */}
      <Section className="py-20">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <PricingCard
              title="Одна карточка"
              price="490"
              description="Идеально для теста или штучных товаров"
              features={[
                "1 товар",
                "5 вариантов изображений",
                "SEO-описание и название",
                "Расчет рекомендованной цены",
                "Инфографика и метаданные",
                "Скачивание в высоком качестве",
                "Поддержка в чате"
              ]}
            />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <PricingCard
              title="Пакет «Старт»"
              price="3 900"
              description="Для начинающих селлеров"
              isPopular
              features={[
                "10 товаров (390 ₽/шт)",
                "Все функции тарифа «Одна карточка»",
                "Приоритетная генерация",
                "История заказов",
                "Расширенная поддержка",
                "Экспорт в Excel/CSV",
                "Бесплатные правки"
              ]}
            />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <PricingCard
              title="Для агентств"
              price="Индивидуально"
              description="Большие объемы и API"
              buttonText="Связаться с нами"
              features={[
                "От 100 товаров в месяц",
                "Персональный менеджер",
                "Доступ к API",
                "Кастомные шаблоны дизайна",
                "Оплата по счету",
                "Приоритетная поддержка 24/7",
                "Интеграции с вашими системами"
              ]}
            />
          </motion.div>
        </div>
      </Section>

      {/* Features Comparison */}
      <Section className="bg-muted/30 py-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Что входит во все тарифы</h2>
            <p className="text-lg text-muted-foreground">
              Базовые возможности доступны каждому
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Shield, title: "Гарантия качества", desc: "Возврат средств при технических ошибках" },
              { icon: Zap, title: "Быстрая обработка", desc: "2-3 минуты на карточку" },
              { icon: CheckCircle2, title: "Без искажений", desc: "Товар сохраняется точно таким, каким вы загрузили" },
              { icon: Sparkles, title: "AI-оптимизация", desc: "Умные названия и описания для продаж" },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-xl p-6 border border-border shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* FAQ Section */}
      <Section className="py-20">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Частые вопросы о тарифах</h2>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                q: "Можно ли изменить тариф позже?",
                a: "Да, вы можете в любой момент перейти на другой тариф. Неиспользованные карточки из текущего тарифа сохраняются."
              },
              {
                q: "Есть ли пробный период?",
                a: "Да, первая карточка доступна со скидкой 50%. Это позволит вам оценить качество без рисков."
              },
              {
                q: "Что происходит с неиспользованными карточками?",
                a: "Карточки из пакетных тарифов не сгорают. Вы можете использовать их в любое время в течение 12 месяцев."
              },
              {
                q: "Можно ли оплатить картой?",
                a: "Да, мы принимаем все основные банковские карты, а также переводы. Для агентств доступна оплата по счету."
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-xl p-6 border border-border shadow-sm"
              >
                <h3 className="font-bold text-lg mb-2">{item.q}</h3>
                <p className="text-muted-foreground">{item.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA Section */}
      <Section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-95"></div>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 text-center max-w-2xl mx-auto"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Готовы начать?
          </h2>
          <p className="text-xl text-white/90 mb-10">
            Создайте первую карточку товара прямо сейчас
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="ghost" 
              asChild 
              className="bg-white text-primary hover:bg-[#2E5A43]/10 h-14 px-10 text-lg shadow-xl"
            >
              <Link href="/app">Создать карточку</Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              asChild 
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 h-14 px-10 text-lg"
            >
              <Link href="/#faq">Задать вопрос</Link>
            </Button>
          </div>
        </motion.div>
      </Section>
    </>
  )
}
