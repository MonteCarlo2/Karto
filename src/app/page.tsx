"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2, Sparkles, Zap, Shield, Image as ImageIcon, Play, TrendingUp, Clock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/layout/section"
import { StepCard } from "@/components/ui/feature-card"
import { Accordion } from "@/components/ui/accordion"
import { VideoPlaceholder } from "@/components/ui/video-placeholder"
import { ComparisonCard } from "@/components/ui/comparison-card"
import { FeatureCard } from "@/components/ui/feature-card"
import { VideoBackground } from "@/components/ui/video-background"
import Image from "next/image"

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 }
}

const staggerContainer = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.1 }
}

export default function Home() {
  return (
    <>
      {/* SECTION 1: HERO - Изображение на весь экран с рельефностью */}
      <section className="relative w-full overflow-hidden" style={{ maxWidth: '100vw', margin: 0, padding: 0, height: '100vh', minHeight: '100vh', maxHeight: '100vh', paddingTop: '0' }}>
        {/* Фоновое видео - точно по границам viewport с эффектом полотна */}
        <div className="absolute inset-0 w-full h-full" style={{ overflow: 'hidden', maxWidth: '100%', width: '100%', height: '100vh', maxHeight: '100vh' }}>
          <VideoBackground
            src="/hero-video.mp4"
            className="absolute inset-0 w-full h-full"
          />
          {/* Эффект рельефности - полотно */}
          <div className="absolute inset-0" style={{
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.08), inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.12)',
            border: '1px solid rgba(0,0,0,0.05)',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 50%, rgba(0,0,0,0.02) 100%)'
          }}></div>
        </div>
        
        {/* Контент поверх изображения - выровнен по левому краю, по центру вертикально */}
        <div className="absolute inset-0 flex items-center">
          <div className="w-full px-8 lg:px-16 xl:px-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="max-w-4xl space-y-6 text-left"
            >
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: '#000000', fontWeight: 700 }}>
                От замысла<br/>
                к ясной форме.
              </h1>
              
              <p className="text-xl md:text-2xl leading-relaxed" style={{ color: '#666666', fontFamily: 'var(--font-sans)', fontWeight: 400 }}>
                Сборка карточки товара в одном потоке.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button size="lg" asChild className="h-12 px-8 text-base">
                  <Link href="/studio?intro=true">
                    Создать карточку
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                  <Link href="/pricing">Посмотреть тарифы</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 2: TRUST BADGES / LOGOS */}
      <Section className="py-12 border-y border-border/50 bg-white/50">
        <div className="text-center mb-8">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Доверяют профессионалы
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
          {["Wildberries", "Ozon", "Яндекс.Маркет", "СберМегаМаркет"].map((name, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.6 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-xl font-semibold text-muted-foreground"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </Section>

      {/* SECTION 3: HOW IT WORKS - Улучшенная версия */}
      <Section id="how-it-works" className="bg-gradient-to-b from-white to-muted/30 py-24">
        <motion.div 
          variants={staggerContainer}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <motion.h2 
            variants={fadeIn}
            className="text-4xl md:text-5xl font-bold mb-6"
          >
            Как это работает
          </motion.h2>
          <motion.p 
            variants={fadeIn}
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Простой процесс создания идеальной карточки товара в несколько шагов
          </motion.p>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <StepCard 
            number={1} 
            title="Загрузка фото" 
            description="Загрузите сырые фотографии вашего товара прямо с телефона или камеры. Поддерживаются все популярные форматы."
            delay={0.1}
          />
          <StepCard 
            number={2} 
            title="Уточнение деталей" 
            description="Укажите основные характеристики, категорию и особенности товара в простой интуитивной форме."
            delay={0.2}
          />
          <StepCard 
            number={3} 
            title="AI-генерация" 
            description="Наш AI создает оптимизированное название, продающее описание и рассчитывает рекомендованную цену."
            delay={0.3}
          />
          <StepCard 
            number={4} 
            title="Готовый результат" 
            description="Скачайте полный набор: изображения в высоком качестве, тексты и метаданные для публикации."
            delay={0.4}
          />
        </div>
      </Section>

      {/* SECTION 4: KEY FEATURES - Новый блок */}
      <Section className="bg-white py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Почему выбирают KARTO</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Профессиональные инструменты для создания продающих карточек
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Без искажений"
            description="Товар сохраняется точно таким, каким вы его загрузили. Никаких «галлюцинаций» и перерисовок."
            delay={0.1}
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Молниеносная скорость"
            description="Полная карточка товара готова за 2-3 минуты. Не нужно ждать часами или днями."
            delay={0.2}
          />
          <FeatureCard
            icon={<ImageIcon className="w-6 h-6" />}
            title="Профессиональные шаблоны"
            description="Готовые шаблоны под Wildberries, Ozon и другие маркетплейсы. Соответствие всем требованиям."
            delay={0.3}
          />
          <FeatureCard
            icon={<CheckCircle2 className="w-6 h-6" />}
            title="SEO-оптимизация"
            description="Названия и описания оптимизированы для поисковых систем маркетплейсов."
            delay={0.4}
          />
          <FeatureCard
            icon={<Sparkles className="w-6 h-6" />}
            title="Умная генерация"
            description="AI анализирует товар и создает контент, который действительно продает."
            delay={0.5}
          />
          <FeatureCard
            icon={<TrendingUp className="w-6 h-6" />}
            title="Рекомендации по цене"
            description="Автоматический расчет оптимальной цены на основе анализа рынка и конкурентов."
            delay={0.6}
          />
        </div>
      </Section>

      {/* SECTION 5: IMAGE QUALITY - С видео */}
      <Section className="bg-gradient-to-br from-muted/50 to-white py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div {...fadeIn}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-6">
              <ImageIcon className="w-4 h-4" />
              Качество изображений
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Изображения без искажений товара
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              В отличие от обычных генераторов, KARTO сохраняет геометрию и детали вашего товара неизменными. 
              Мы работаем с вашим товаром, а не перерисовываем его.
            </p>
            
            <ul className="space-y-4 mb-8">
              {[
                "Форма товара сохраняется 1 в 1",
                "Без перерисовки и «галлюцинаций»",
                "Готовые шаблоны под Wildberries и Ozon",
                "Быстрые правки фона и инфографики",
                "Экспорт в высоком разрешении"
              ].map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 text-lg"
                >
                  <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
          
          <motion.div 
            {...fadeIn} 
            transition={{ delay: 0.2 }}
            className="relative"
          >
            <VideoPlaceholder 
              title="Сравнение качества"
              description="Оригинал vs Обработка KARTO"
              size="lg"
              className="rounded-3xl shadow-2xl"
            />
          </motion.div>
        </div>
      </Section>

      {/* SECTION 6: EXAMPLES - Улучшенные карточки */}
      <Section id="examples" className="bg-white py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Примеры работ</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Реальные карточки, созданные в KARTO. Посмотрите разницу.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { category: "Одежда", label: "Футболка" },
            { category: "Электроника", label: "Наушники" },
            { category: "Красота", label: "Крем" },
            { category: "Дом и сад", label: "Ваза" },
            { category: "Спорт", label: "Кроссовки" },
            { category: "Аксессуары", label: "Сумка" },
          ].map((item, i) => (
            <ComparisonCard
              key={i}
              category={item.category}
              delay={i * 0.1}
            />
          ))}
        </div>
      </Section>

      {/* SECTION 7: PRICING TEASER - Улучшенный */}
      <Section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-95"></div>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="text-white">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Прозрачное ценообразование</h2>
            <p className="text-xl text-white/90">Стоимость — от 490 ₽ за полную карточку товара.</p>
            <p className="text-lg text-white/80 mt-2">Без скрытых платежей и подписок.</p>
          </div>
          <Button 
            size="lg" 
            variant="ghost" 
            asChild 
              className="shrink-0 bg-white text-primary hover:bg-[#2E5A43]/10 h-14 px-10 text-lg shadow-xl"
          >
            <Link href="/pricing">Посмотреть все тарифы <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </motion.div>
      </Section>

      {/* SECTION 8: FAQ */}
      <Section id="faq" className="bg-white py-24">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Вопросы и ответы</h2>
            <p className="text-xl text-muted-foreground">
              Все, что вам нужно знать о KARTO
            </p>
          </motion.div>
          
          <Accordion items={[
            {
              title: "Для кого подходит сервис?",
              content: "KARTO идеально подходит для селлеров на Wildberries и Ozon, которые хотят сэкономить время на создании контента, но не готовы терять в качестве. Также сервис полезен менеджерам маркетплейсов, дизайнерам и агентствам, работающим с e-commerce."
            },
            {
              title: "Какие маркетплейсы поддерживаются?",
              content: "На данный момент мы полностью поддерживаем стандарты Wildberries и Ozon. Форматы изображений и текстов оптимизированы под требования этих площадок. В разработке поддержка Яндекс.Маркета и СберМегаМаркета."
            },
            {
              title: "Как работают изображения?",
              content: "Мы используем комбинацию передовых алгоритмов для удаления фона и наложения товара на профессиональные сцены. Ваш товар остается настоящим, меняется только окружение. Никакой перерисовки или искажения формы."
            },
            {
              title: "Можно ли вносить правки?",
              content: "Да, на этапе предпросмотра вы можете заменить фон, скорректировать описание, изменить инфографику или пересчитать цену перед финальной выгрузкой. Все изменения сохраняются в вашем аккаунте."
            },
            {
              title: "Есть ли возврат средств?",
              content: "Если результат генерации технически неверен (товар искажен, описание не соответствует товару), мы вернем деньги за эту карточку или предоставим дополнительные попытки бесплатно. Гарантия качества — наш приоритет."
            },
            {
              title: "Как быстро обрабатывается заказ?",
              content: "Стандартное время обработки одной карточки — 2-3 минуты. При больших объемах (от 10 карточек) обработка может занять до 10-15 минут. Вы получите уведомление на email, когда все будет готово."
            }
          ]} />
        </div>
      </Section>

      {/* SECTION 9: FINAL CTA - Роскошный */}
      <Section className="py-32 relative overflow-hidden gradient-mesh">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-3xl mx-auto text-center"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-border rounded-full shadow-sm mb-8"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Начните прямо сейчас</span>
          </motion.div>
          
          <h2 className="text-4xl md:text-6xl font-bold mb-8 leading-tight">
            Создайте первую карточку товара <br/>
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              за несколько минут
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
            Регистрация не требует кредитной карты. Начните бесплатно и оцените качество.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="h-16 px-12 text-lg shadow-2xl hover:shadow-primary/20">
              <Link href="/studio?intro=true">
                Начать сейчас 
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-16 px-12 text-lg border-2">
              <Link href="/pricing">Посмотреть тарифы</Link>
            </Button>
    </div>
          
          <p className="mt-6 text-sm text-muted-foreground">
            ✓ Без кредитной карты  ✓ Первая карточка со скидкой  ✓ Поддержка 24/7
          </p>
        </motion.div>
      </Section>
    </>
  )
}
