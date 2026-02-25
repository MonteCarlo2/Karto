"use client"

import { useState, useEffect, Suspense } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VideoBackground } from "@/components/ui/video-background"
import { createBrowserClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"

const BugReportModal = dynamic(
  () => import("@/components/ui/bug-report-modal").then((m) => ({ default: m.BugReportModal })),
  { ssr: false }
)

// Ниже первого экрана — подгружаем по мере прокрутки, чтобы не блокировать первый рендер и LCP
const StickyScrollReveal = dynamic(
  () => import("@/components/landing/sticky-scroll-reveal").then((m) => ({ default: m.StickyScrollReveal })),
  { loading: () => <section className="min-h-[60vh] bg-[#F5F5F0]" aria-hidden /> }
)
const FreeGenSection = dynamic(
  () => import("@/components/landing/free-gen-section").then((m) => ({ default: m.FreeGenSection })),
  { loading: () => <section className="min-h-[40vh] bg-background" aria-hidden /> }
)
const MarketplaceLogoTicker = dynamic(
  () => import("@/components/landing/marketplace-logo-ticker").then((m) => ({ default: m.MarketplaceLogoTicker })),
  { loading: () => <div className="h-24 bg-muted/30" aria-hidden /> }
)
const TeamResultSection = dynamic(
  () => import("@/components/landing/team-result-section").then((m) => ({ default: m.TeamResultSection })),
  { loading: () => <section className="min-h-[30vh] bg-background" aria-hidden /> }
)
const PricingSectionKarto = dynamic(
  () => import("@/components/ui/pricing-section-karto").then((m) => ({ default: m.default })),
  { loading: () => <section className="min-h-[50vh] bg-muted/20" aria-hidden /> }
)
const FAQSectionKarto = dynamic(
  () => import("@/components/landing/faq-section-karto").then((m) => ({ default: m.FAQSectionKarto })),
  { loading: () => <section className="min-h-[30vh] bg-background" aria-hidden /> }
)

function HomeContent() {
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error) {
        console.warn("Ошибка проверки сессии:", error);
      }
    };
    checkUser();
  }, []);

  // Сообщение при входе по уже привязанному Яндекс-аккаунту (аккаунт уже был зарегистрирован)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("welcome_back") === "1") {
      showToast({
        type: "success",
        message: "С возвращением! Вы вошли в свой аккаунт.",
      });
      window.history.replaceState({}, "", window.location.pathname + window.location.hash || "");
    }
  }, [searchParams, showToast]);

  // Обновление URL при прокрутке по секциям (как это работает, цена, вопросы), чтобы при повторном клике «Цена» происходил переход
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sectionIds = ["hero", "how-it-works", "pricing", "faq"];
    let ticking = false;
    const updateHash = () => {
      const y = window.scrollY + window.innerHeight * 0.35;
      let current = "";
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (y >= top) {
            current = sectionIds[i] === "hero" ? "" : sectionIds[i];
            break;
          }
        }
      }
      const want = current ? `#${current}` : "";
      if (window.location.hash !== want) {
        window.history.replaceState({}, "", window.location.pathname + want);
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateHash);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    updateHash();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div suppressHydrationWarning>
      {/* Кнопка "Сообщить о проблеме" - фиксированная в правом нижнем углу, маленькая и неприметная */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 200 }}
        onClick={() => setIsBugReportOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center group border border-gray-300"
        title="Сообщить о проблеме"
      >
        <Wrench className="w-4 h-4 group-hover:rotate-12 transition-transform" />
      </motion.button>

      {/* Модальное окно отчета о неполадке */}
      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
        user={user}
      />
      {/* SECTION 1: HERO - Изображение на весь экран с рельефностью */}
      <section id="hero" className="relative w-full overflow-hidden" style={{ maxWidth: '100vw', margin: 0, padding: 0, height: '100vh', minHeight: '100vh', maxHeight: '100vh', paddingTop: '0' }} suppressHydrationWarning>
        {/* Фоновое видео - точно по границам viewport с эффектом полотна */}
        <div className="absolute inset-0 w-full h-full" style={{ overflow: 'hidden', maxWidth: '100%', width: '100%', height: '100vh', maxHeight: '100vh' }} suppressHydrationWarning>
          <VideoBackground
            src="/hero-video.mp4"
            className="absolute inset-0 w-full h-full"
          />
          {/* Эффект рельефности - полотно */}
          <div className="absolute inset-0" suppressHydrationWarning style={{
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.08), inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.12)',
            border: '1px solid rgba(0,0,0,0.05)',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 50%, rgba(0,0,0,0.02) 100%)'
          }}></div>
        </div>
        
        {/* Контент поверх изображения - выровнен по левому краю, по центру вертикально */}
        <div className="absolute inset-0 flex items-center" suppressHydrationWarning>
          <div className="w-full px-8 lg:px-16 xl:px-24" suppressHydrationWarning>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="max-w-4xl space-y-6 text-left"
            >
              <p className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#1F4E3D' }} aria-hidden="true">
                KARTO
              </p>
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
                  <Link href="#pricing">Посмотреть тарифы</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </div>

      </section>

      {/* Sticky Scroll Reveal — как у Framer: слева текст по шагам, справа «запись экрана» с курсором */}
      <StickyScrollReveal />

      {/* Секция Свободной Генерации (Новая) */}
      <FreeGenSection />

      <MarketplaceLogoTicker />
      <TeamResultSection />

      {/* Раздел цен — интерактивные тарифы (режим + объём) */}
      <PricingSectionKarto user={user} />

      {/* FAQ — сразу после тарифов; после FAQ главная заканчивается */}
      <FAQSectionKarto user={user} />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] text-[#1F4E3D]">Загрузка...</div>}>
      <HomeContent />
    </Suspense>
  )
}
