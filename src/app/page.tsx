"use client"

import { useState, useEffect, Suspense } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Wrench } from "lucide-react"
import { HeroSection } from "@/components/landing/hero-section"
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
const AutoRepliesIntroSection = dynamic(
  () =>
    import("@/components/landing/auto-replies-intro-section").then((m) => ({
      default: m.AutoRepliesIntroSection,
    })),
  { loading: () => <section className="min-h-[50vh] bg-[#F5F5F0]" aria-hidden /> }
)
const AutoRepliesCapabilitiesSection = dynamic(
  () =>
    import("@/components/landing/auto-replies-capabilities-section").then((m) => ({
      default: m.AutoRepliesCapabilitiesSection,
    })),
  { loading: () => <section className="min-h-[50vh] bg-[#F5F5F0]" aria-hidden /> }
)
const PricingSectionKarto = dynamic(
  () => import("@/components/ui/pricing-section-karto").then((m) => ({ default: m.default })),
  { loading: () => <section className="min-h-[50vh] bg-muted/20" aria-hidden /> }
)
const FAQSectionKarto = dynamic(
  () => import("@/components/landing/faq-section-karto").then((m) => ({ default: m.FAQSectionKarto })),
  { loading: () => <section className="min-h-[30vh] bg-background" aria-hidden /> }
)

/** Не трогаем hash/query, пока Supabase забирает сессию из URL (иначе ломается вход после magic link / OAuth). */
function urlHasPendingSupabaseAuth(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash;
  if (h.includes("access_token") || h.includes("refresh_token")) return true;
  const q = new URLSearchParams(window.location.search);
  if (q.has("code")) return true;
  return false;
}

function HomeContent() {
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        setUser(session?.user || null);
        if (searchParams.get("welcome_back") === "1") {
          if (session) {
            showToast({
              type: "success",
              message: "С возвращением! Вы вошли в свой аккаунт.",
            });
          }
          const u = new URL(window.location.href);
          u.searchParams.delete("welcome_back");
          window.history.replaceState({}, "", u.pathname + u.search + u.hash);
        }
      } catch (error) {
        console.warn("Ошибка проверки сессии:", error);
      }
    };
    checkUser();
    return () => {
      cancelled = true;
    };
  }, [searchParams, showToast]);

  // Обновление URL при прокрутке по секциям (как это работает, цена, вопросы), чтобы при повторном клике «Цена» происходил переход
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sectionIds = ["hero", "how-it-works", "auto-replies", "pricing", "faq"];
    let ticking = false;
    const updateHash = () => {
      if (urlHasPendingSupabaseAuth()) return;
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
      {/* SECTION 1: HERO — видео + контент по ветру (~2 с) */}
      <HeroSection />

      {/* Sticky Scroll Reveal — как у Framer: слева текст по шагам, справа «запись экрана» с курсором */}
      <StickyScrollReveal />

      <FreeGenSection />

      <AutoRepliesIntroSection />

      <AutoRepliesCapabilitiesSection />

      <TeamResultSection />

      <MarketplaceLogoTicker />

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
