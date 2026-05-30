"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronLeft } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";
import type {
  AutoRepliesMarketplaceId,
  AutoRepliesUsageId,
} from "@/lib/auto-replies/types";
import { patchMarketplaceSettings, syncMarketplaceUsageFromWizard } from "@/lib/auto-replies/settings-store";
import { persistAutoRepliesWorkspacePrefs, readAutoRepliesWorkspacePrefs, setWorkspacePrefsUserId } from "@/lib/auto-replies/workspace-prefs";
import {
  bootstrapAutoRepliesFromSupabase,
  setAutoRepliesSyncContext,
} from "@/lib/auto-replies/auto-replies-sync";
import { hasExistingAutoRepliesSetup } from "@/lib/auto-replies/auto-replies-setup";
import {
  OZON_API_KEY_SCOPES_HINT,
  OZON_CABINET_MODE_SUBSCRIPTION_LINE,
} from "@/lib/auto-replies/ozon-subscription";
import { OzonMarketplaceSelectedNotice } from "@/components/auto-replies/workspace/ozon-subscription-callout";
import { WorkspaceSupportChrome } from "@/components/auto-replies/workspace/workspace-support-chrome";
import { AUTO_REPLY_WELCOME_CREDITS } from "@/lib/auto-replies-welcome";

type Step = 1 | 2 | 3;
type MarketplaceId = AutoRepliesMarketplaceId;
type UsageId = AutoRepliesUsageId;

const ease = [0.22, 1, 0.36, 1] as const;

const step3List = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.11, delayChildren: 0.08 },
  },
};

const step3Item = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.48, ease },
  },
};

const readSerif = {
  fontFamily: "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
} as const;

const uiSans = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

const marketplaces: {
  id: MarketplaceId;
  name: string;
  logo: string;
  imgClass: string;
}[] = [
  {
    id: "ozon",
    name: "Ozon",
    logo: "/logos/ozon.png",
    imgClass: "h-[3.25rem] w-auto sm:h-16 md:h-[4.25rem]",
  },
  {
    id: "wildberries",
    name: "Wildberries",
    logo: "/logos/wildberries.png",
    imgClass: "h-14 w-auto sm:h-[4.25rem] md:h-[4.5rem]",
  },
  {
    id: "yandex",
    name: "Яндекс Маркет",
    logo: "/logos/yandex-market.png",
    imgClass:
      "h-16 w-auto max-w-[min(280px,85vw)] sm:h-[4.5rem] md:h-[4.75rem]",
  },
];

const usageOptions: {
  id: UsageId;
  title: string;
  lead: string;
  api: "no" | "yes";
}[] = [
  {
    id: "manual",
    title: "Только по тексту отзыва",
    lead:
      "Вы копируете текст отзыва в поле — KARTO даёт персональный ответ. Кабинет подключать не нужно.",
    api: "no",
  },
  {
    id: "semi",
    title: "Кабинет: вы решаете, когда отправить ответ",
    lead:
      "Отзывы приходят из магазина по API — перед публикацией ответа вы каждый раз подтверждаете отправку самостоятельно.",
    api: "yes",
  },
  {
    id: "auto",
    title: "Кабинет: всё делает система за вас",
    lead:
      "Новые отзывы обрабатываются без вашего шага там, где маркетплейс это разрешает. Связка с кабинетом по API обязательна.",
    api: "yes",
  },
];

/** Финальный CTA «Погнали»: Shiny-блики + живые салатово-зелёные ореолы снаружи. */
function ShinyBlackPognaliLink({
  href,
  onBeforeNavigate,
}: {
  href: string;
  onBeforeNavigate?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;

    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push(`/login?redirect=${encodeURIComponent(href)}`);
      return;
    }

    setBusy(true);
    try {
      await onBeforeNavigate?.();
      if (session.access_token) {
        try {
          const res = await fetch("/api/auto-replies/welcome-grant", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const data = (await res.json()) as { granted?: boolean; message?: string };
          if (data.granted && data.message) {
            sessionStorage.setItem("auto_replies_welcome_toast", data.message);
          }
        } catch {
          /* не блокируем переход */
        }
      }
      router.push(href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative isolate mx-auto flex w-full max-w-xl justify-center px-5 pb-6 pt-7 sm:px-6">
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-[0.85rem] left-[min(14%,5rem)] top-6 w-[54%] max-w-[20rem] rounded-[2rem] bg-[radial-gradient(ellipse_at_28%_50%,rgba(185,255,75,0.55),transparent_62%)] opacity-95 blur-[32px] animate-pognali-halo-salad"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-[34%] right-[10%] top-7 rounded-[2rem] bg-[radial-gradient(ellipse_at_72%_45%,rgba(46,90,67,0.42),transparent_58%)] opacity-95 blur-[28px] animate-pognali-halo-forest"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-3 left-[18%] right-[18%] top-14 rounded-[1.85rem] bg-[radial-gradient(ellipse_at_50%_90%,rgba(110,227,247,0.28),transparent_65%)] opacity-95 blur-[22px] animate-pognali-halo-accent"
      />
      <Link
        href={href}
        onClick={handleClick}
        aria-busy={busy}
        style={uiSans}
        className="group relative z-10 inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-[1.08rem] border border-white/[0.14] bg-[#070907] px-10 py-[1.12rem] text-[1.2rem] font-semibold tracking-[-0.02em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_32px_-12px_rgba(185,255,75,0.22),0_24px_56px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(46,90,67,0.12)] outline-none ring-offset-[#F3F1EA] transition hover:border-white/[0.26] hover:bg-[#0c1410] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_40px_-10px_rgba(185,255,75,0.32),0_30px_64px_-18px_rgba(0,0,0,0.58)] focus-visible:ring-2 focus-visible:ring-[#070907]/40 sm:py-[1.34rem] sm:text-[1.32rem] md:text-[1.42rem] disabled:pointer-events-none disabled:opacity-70"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_50%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[-18%] rounded-[inherit] bg-[radial-gradient(ellipse_at_50%_-20%,rgba(185,255,75,0.14),transparent_58%)] opacity-[0.62]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[-45%] -left-[15%] w-[48%] bg-gradient-to-r from-transparent via-white/[0.26] to-transparent opacity-95 mix-blend-screen animate-shiny-black-cta"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-[-55%] -left-[20%] w-[36%] bg-gradient-to-r from-transparent via-white/[0.14] to-transparent mix-blend-overlay animate-shiny-black-cta-soft"
        />
        <span className="relative z-10 flex items-center gap-3">
          Погнали
          <ArrowRight
            className="h-[1.07em] w-[1.07em] transition group-hover:translate-x-1"
            strokeWidth={2.35}
          />
        </span>
      </Link>
    </span>
  );
}

function AutoRepliesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [marketplace, setMarketplace] = useState<MarketplaceId | null>(null);
  const [usage, setUsage] = useState<UsageId | null>(null);
  const [apiExplainerOpen, setApiExplainerOpen] = useState(false);
  const [gateReady, setGateReady] = useState(false);
  const [userMeta, setUserMeta] = useState<{
    id: string;
    email?: string;
    user_metadata?: { name?: string; full_name?: string };
  } | null>(null);

  const isWizardFlow = useMemo(() => {
    if (searchParams.get("add") === "1") return true;
    const c = searchParams.get("connect");
    return c === "wildberries" || c === "ozon" || c === "yandex";
  }, [searchParams]);

  useEffect(() => {
    let cancel = false;

    (async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancel) return;

      if (session?.user?.id) {
        setUserMeta({
          id: session.user.id,
          email: session.user.email ?? undefined,
          user_metadata: session.user.user_metadata as { name?: string; full_name?: string },
        });
      }

      if (isWizardFlow) {
        if (!cancel) setGateReady(true);
        return;
      }

      if (session?.user?.id) {
        const uid = session.user.id;
        const email = session.user.email ?? null;
        setWorkspacePrefsUserId(uid);
        setAutoRepliesSyncContext(uid, email, null);
        await bootstrapAutoRepliesFromSupabase(uid, email, null);
        if (cancel) return;
      }

      if (hasExistingAutoRepliesSetup()) {
        router.replace("/studio/auto-replies/workspace");
        return;
      }

      if (!cancel) setGateReady(true);
    })();

    return () => {
      cancel = true;
    };
  }, [isWizardFlow, router]);

  useEffect(() => {
    const c = searchParams.get("connect");
    if (c !== "wildberries" && c !== "ozon" && c !== "yandex") return;
    setMarketplace(c);
    setUsage(null);
    setStep(1);
  }, [searchParams]);

  const canStep2 = marketplace !== null;
  const canStep3 = usage !== null;

  const chosenUsage = usage ? usageOptions.find((u) => u.id === usage) : null;
  const chosenMp = marketplace
    ? marketplaces.find((m) => m.id === marketplace)
    : null;

  const reset = () => {
    setStep(1);
    setMarketplace(null);
    setUsage(null);
  };

  if (!gateReady) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#F3F1EA] text-[#4a4946]"
        style={uiSans}
      >
        Загрузка…
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden bg-[#F3F1EA] text-[#0c0c0c]"
      style={readSerif}
    >
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute left-[-18%] top-0 h-[52vh] w-[65%] rounded-full bg-[#c8e8b8]/32 blur-[110px]" />
        <div className="absolute bottom-[-12%] right-[-18%] h-[48vh] w-[62%] rounded-full bg-[#dce8df]/88 blur-[95px]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(46, 90, 67, 0.075) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      <Link
        href="/"
        aria-label="На главную KARTO"
        className="fixed left-5 top-5 z-[60] outline-none md:left-8 md:top-7"
      >
        <span className="block origin-top-left scale-[0.88] opacity-[0.96] transition-opacity hover:opacity-100 md:scale-[0.98] lg:scale-[1.02]">
          <Logo />
        </span>
      </Link>

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-6 sm:px-10 md:px-14 lg:px-20 xl:max-w-[1320px] xl:px-24 ${
          step === 2
            ? "pb-[6.85rem] pt-[4.65rem] sm:pb-[7rem] sm:pt-[5.05rem] lg:pt-[5.55rem]"
            : "pb-32 pt-[5.25rem] sm:pt-[5.85rem] lg:pt-[6.35rem]"
        }`}
      >
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.28em] text-[#070907]/72 ${
            step === 2 ? "mb-2" : "mb-4"
          }`}
          style={uiSans}
        >
          Автоответы
        </p>

        <div
          className={`flex w-full gap-2 ${
            step === 2 ? "mb-6 sm:mb-7" : "mb-14 sm:mb-16"
          }`}
          aria-hidden
        >
          {([1, 2, 3] as const).map((n) => (
            <span
              key={n}
              className={`h-[3px] flex-1 rounded-full transition-colors ${
                step >= n ? "bg-[#070907]" : "bg-[#e0ddd4]"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: step === 1 ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: step === 1 ? 12 : -12 }}
            transition={{ duration: 0.32, ease }}
            className="w-full flex-1"
          >
            {step === 1 && (
              <section className="w-full">
                <h1 className="max-w-4xl text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-[#141414]">
                  Где находится ваш магазин?
                </h1>
                <p className="mt-6 max-w-2xl text-[17px] leading-[1.65] text-[#494949] sm:text-[18px] md:text-[19px] md:leading-relaxed">
                  Нажмите на логотип площадки. На следующем шаге мы спросим, как вы
                  хотите работать — и честно скажем, где нужна будет связка через
                  API, а где нет.
                </p>
                <p
                  className="mt-5 max-w-2xl text-[15px] leading-[1.7] text-[#5f5f5f] sm:text-[16px]"
                  style={uiSans}
                >
                  Это решение можно будет изменить: добавить другой маркетплейс,
                  завести ещё магазины или поменять сценарий — ничего не
                  зафиксировано навсегда.
                </p>

                <div className="mt-16 flex w-full flex-col items-center justify-center gap-14 sm:mt-24 sm:flex-row sm:flex-wrap sm:gap-x-[clamp(2.5rem,8vw,5rem)] sm:gap-y-16 md:justify-between md:gap-x-12 lg:justify-evenly xl:gap-x-20 xl:gap-y-14">
                  {marketplaces.map((mp) => {
                    const active = marketplace === mp.id;
                    return (
                      <button
                        key={mp.id}
                        type="button"
                        onClick={() => setMarketplace(mp.id)}
                        aria-pressed={active}
                        aria-label={mp.name}
                        className="group flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2E5A43] focus-visible:ring-offset-[6px] focus-visible:ring-offset-[#F3F1EA]"
                      >
                        <Image
                          src={mp.logo}
                          alt=""
                          width={360}
                          height={100}
                          className={`w-auto object-contain transition duration-300 ${mp.imgClass} ${
                            active
                              ? "scale-[1.06] opacity-100 drop-shadow-[0_14px_32px_rgba(46,90,67,0.2)]"
                              : "opacity-[0.8] group-hover:scale-[1.03] group-hover:opacity-100"
                          }`}
                        />
                        <span
                          className={`mt-5 text-[15px] font-medium ${
                            active ? "text-[#2E5A43]" : "text-[#6a6a6a] group-hover:text-[#383838]"
                          }`}
                        >
                          {mp.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {marketplace === "ozon" ? <OzonMarketplaceSelectedNotice /> : null}
              </section>
            )}

            {step === 2 && (
              <section className="w-full">
                <h1 className="max-w-none font-semibold leading-[1.05] tracking-[-0.032em] text-[#141414] text-[clamp(1.7rem,calc(0.92rem+2.95vw),2.68rem)] xl:whitespace-nowrap">
                  Как вы хотите пользоваться сервисом?
                </h1>
                <p className="mt-3 max-w-3xl text-[16px] leading-[1.6] text-[#494949] sm:mt-[0.875rem] sm:text-[17px]">
                  От этого зависит, понадобится ли потом связь с личным кабинетом
                  маркетплейса. Ручной сценарий можно начать сразу; для
                  полуавтоматического и автоматического режимов мы подключим
                  интеграцию по API — об этом ниже по тексту каждого варианта.
                </p>

                <button
                  type="button"
                  onClick={() => setApiExplainerOpen((v) => !v)}
                  className="mt-[0.875rem] inline-flex items-center gap-2 text-[15px] font-semibold text-[#2E5A43] underline decoration-[#2E5A43]/35 underline-offset-4 transition hover:decoration-[#2E5A43]"
                  style={uiSans}
                  aria-expanded={apiExplainerOpen}
                >
                  Что такое API?
                  <ChevronDown
                    className={`h-4 w-4 transition ${apiExplainerOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                <AnimatePresence initial={false}>
                  {apiExplainerOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 max-w-2xl rounded-2xl border border-[#2E5A43]/12 bg-white/50 px-5 py-3.5 text-[14px] leading-[1.64] text-[#3f3f3f] shadow-[0_12px_40px_-28px_rgba(46,90,67,0.35)] sm:py-4 sm:text-[15px]">
                        <p>
                          <strong className="font-semibold text-[#1a1a1a]">
                            API
                          </strong>{" "}
                          — это способ, которым сервис вроде KARTO по защищённому
                          каналу получает от маркетплейса список отзывов и может
                          отправлять ответы от имени вашего магазина. Маркетплейс
                          для этого выдаёт ключ (токен). Без такой связки мы не
                          видим отзывы сами — только если вы вставите текст отзыва
                          вручную.
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="mt-6 space-y-0 border-t border-[#2E5A43]/10 sm:mt-7">
                  {usageOptions.map((opt) => {
                    const sel = usage === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setUsage(opt.id)}
                        aria-pressed={sel}
                        className={`group relative z-0 w-full border-b border-[#2E5A43]/10 py-[1.35rem] text-left transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E5A43]/40 sm:py-[1.85rem] md:py-8 ${
                          sel
                            ? "shadow-[0_20px_56px_-22px_rgba(46,90,67,0.12),0_0_90px_-4px_rgba(185,255,75,0.2)]"
                            : "hover:shadow-[0_12px_36px_-20px_rgba(46,90,67,0.06)]"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-9 md:gap-10">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span
                                className={`text-[1.34rem] font-semibold tracking-[-0.02em] sm:text-[1.52rem] md:text-[1.56rem] ${
                                  sel ? "text-[#0f291f]" : "text-[#1a1a1a]"
                                }`}
                              >
                                {opt.title}
                              </span>
                              {sel ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-[#2E5A43]/12 px-[0.7rem] py-[0.34rem] text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#2E5A43] sm:px-[0.75rem] sm:py-[0.38rem] sm:text-[11px]"
                                  style={uiSans}
                                >
                                  выбрано
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-[0.88rem] max-w-3xl text-[15.5px] leading-[1.64] text-[#555] sm:mt-[0.92rem] sm:text-[16.5px] sm:leading-[1.69] md:text-[17px]">
                              {opt.lead}
                            </p>
                            {marketplace === "ozon" && opt.api === "yes" ? (
                              <p
                                className="mt-3 max-w-3xl text-[14px] leading-[1.6] text-[#7a5c20]"
                                style={uiSans}
                              >
                                {OZON_CABINET_MODE_SUBSCRIPTION_LINE}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-[1.02rem] py-[0.48rem] text-[12.5px] font-bold uppercase tracking-[0.1em] sm:px-[1.12rem] sm:py-[0.62rem] sm:text-[13.5px] sm:tracking-wide md:mt-1 ${
                              opt.api === "no"
                                ? "bg-[#ECF7DB] text-[#1F4E3D]"
                                : "bg-[#2E5A43] text-white shadow-[0_6px_20px_-8px_rgba(46,90,67,0.35)]"
                            }`}
                            style={uiSans}
                          >
                            {opt.api === "no" ? "Без API" : "API"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 3 && chosenMp && chosenUsage && (
              <motion.section
                className="w-full pb-16"
                variants={step3List}
                initial="hidden"
                animate="visible"
              >
                <motion.h1
                  variants={step3Item}
                  className="max-w-4xl border-b border-[#070907]/10 pb-5 text-[clamp(2rem,4.6vw,3.35rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-[#0a0a0a]"
                >
                  Готово, ориентиры понятны
                </motion.h1>

                <motion.div
                  variants={step3Item}
                  className="mt-12 flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between sm:gap-12"
                >
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-7 sm:flex-row sm:items-center sm:gap-10 md:gap-12">
                    <Image
                      src={chosenMp.logo}
                      alt={chosenMp.name}
                      width={360}
                      height={100}
                      className={`w-auto shrink-0 object-contain drop-shadow-[0_14px_36px_rgba(7,9,7,0.12),0_0_48px_-8px_rgba(185,255,75,0.18)] ${chosenMp.imgClass}`}
                    />
                    <p className="min-w-0 max-w-[min(100%,26rem)] text-[clamp(1.4rem,3.05vw,1.95rem)] font-semibold leading-[1.22] tracking-[-0.022em] text-[#070907]">
                      {chosenUsage.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      requestAnimationFrame(() =>
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      );
                    }}
                    className="shrink-0 self-start text-left text-[14px] font-semibold text-[#070907] underline decoration-[#b9ff4b]/75 underline-offset-[6px] transition hover:decoration-[#9fe632] sm:mb-1 sm:self-auto"
                    style={uiSans}
                  >
                    Изменить
                  </button>
                </motion.div>

                <motion.div variants={step3Item}>
                  {chosenUsage.api === "no" ? (
                    <p className="mt-10 max-w-3xl text-[18px] leading-[1.72] text-[#3d3d3d] sm:text-[19px] md:text-[20px] md:leading-[1.65]">
                      Для этого пути интеграция с маркетплейсом{" "}
                      <strong className="font-semibold text-[#111]">
                        не требуется
                      </strong>
                      , чтобы генерировать ответы по тексту отзыва. Если позже
                      захотите подтянуть отзывы из кабинета — настроим связку
                      отдельно.
                    </p>
                  ) : (
                    <p className="mt-10 max-w-3xl text-[18px] leading-[1.72] text-[#3d3d3d] sm:text-[19px] md:text-[20px] md:leading-[1.65]">
                      Для выбранного сценария без доступа к API не обойтись: позже
                      добавим шаг подключения. Сейчас вы только зафиксировали
                      намерение; в кабинет ничего не отправляется.
                    </p>
                  )}
                </motion.div>

                <motion.p
                  variants={step3Item}
                  className="mt-11 max-w-3xl rounded-2xl border border-[#B9FF4B]/35 bg-[#ECF7DB]/45 px-5 py-4 text-[16px] leading-[1.65] text-[#1F4E3D] sm:text-[17px]"
                  style={uiSans}
                >
                  При первом прохождении мастера вам начисляется{" "}
                  <strong className="font-semibold">{AUTO_REPLY_WELCOME_CREDITS} бесплатных ответов</strong>{" "}
                  — без срока, на все магазины и площадки. Один раз для аккаунта.
                </motion.p>

                <motion.p
                  variants={step3Item}
                  className="mt-8 max-w-3xl text-[16px] leading-[1.7] text-[#555] sm:text-[17px]"
                  style={uiSans}
                >
                  Вам не обязательно останавливаться на одном магазине: дальше
                  можно будет добавить другие площадки или кабинеты и при
                  необходимости изменить формат работы.
                </motion.p>

                <motion.div variants={step3Item} className="mt-14">
                  <ShinyBlackPognaliLink
                    href="/studio/auto-replies/workspace"
                    onBeforeNavigate={() => {
                      if (marketplace && usage) {
                        const prev = readAutoRepliesWorkspacePrefs();
                        const shopId = prev?.shopId ?? "main";
                        const connectedMarketplaces = prev?.connectedMarketplaces ?? [];
                        syncMarketplaceUsageFromWizard(shopId, marketplace, usage);
                        persistAutoRepliesWorkspacePrefs({
                          marketplace,
                          usage,
                          connectedMarketplaces: connectedMarketplaces.includes(marketplace)
                            ? connectedMarketplaces
                            : [...connectedMarketplaces, marketplace],
                          shopId,
                        });
                      }
                    }}
                  />
                  <p
                    className="mt-4 max-w-xl text-[14px] text-[#696969]"
                    style={uiSans}
                  >
                    Далее откроется панель управления автоответами.
                  </p>
                </motion.div>
              </motion.section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {step < 3 ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#F3F1EA]/85 px-5 py-4 backdrop-blur-[10px] sm:px-10 md:px-16"
          style={uiSans}
        >
          <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 xl:max-w-[1320px]">
            <div className="min-w-0 flex-1">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-base font-semibold text-[#2E5A43] hover:bg-[#2E5A43]/10"
                >
                  <ChevronLeft className="h-5 w-5" />
                  Назад
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setApiExplainerOpen((v) => !v)}
                  className="inline-flex max-w-[calc(100vw-11rem)] items-center gap-2 text-left text-[15px] font-semibold text-[#2E5A43] underline decoration-[#2E5A43]/30 underline-offset-[5px] transition hover:decoration-[#2E5A43] sm:max-w-none sm:text-base"
                  aria-expanded={apiExplainerOpen}
                >
                  Что такое API?
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition ${apiExplainerOpen ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>

            {step === 1 ? (
              <button
                type="button"
                disabled={!canStep2}
                onClick={() => setStep(2)}
                className="shrink-0 rounded-full bg-[#070907] px-[2.1rem] py-[1.05rem] text-[1.05rem] font-semibold leading-none text-white shadow-[0_14px_40px_-16px_rgba(7,9,7,0.65)] transition enabled:hover:bg-[#161816] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none sm:px-[2.65rem] sm:py-[1.2rem] sm:text-[1.125rem] md:text-xl"
              >
                Далее
              </button>
            ) : (
              <button
                type="button"
                disabled={!canStep3}
                onClick={() => setStep(3)}
                className="shrink-0 rounded-full bg-[#070907] px-[2.1rem] py-[1.05rem] text-[1.05rem] font-semibold leading-none text-white shadow-[0_14px_40px_-16px_rgba(7,9,7,0.65)] transition enabled:hover:bg-[#161816] disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none sm:px-[2.65rem] sm:py-[1.2rem] sm:text-[1.125rem] md:text-xl"
              >
                Далее
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {apiExplainerOpen && step === 1 ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease }}
                className="mx-auto mt-4 max-h-[42vh] max-w-[1200px] overflow-y-auto xl:max-w-[1320px]"
              >
                <div className="rounded-2xl border border-[#2E5A43]/10 bg-white/55 px-5 py-4 text-[15px] leading-[1.68] text-[#3f3f3f] shadow-[0_8px_32px_-24px_rgba(46,90,67,0.3)] sm:text-base">
                  <p>
                    <strong className="font-semibold text-[#1a1a1a]">API</strong> — это
                    способ, которым сервис вроде KARTO по защищённому каналу
                    получает от маркетплейса список отзывов и может отправлять ответы
                    от имени магазина. Для этого маркетплейс выдаёт ключ (токен).
                    Без такой связки мы не видим отзывы сами — только если вы
                    вставите текст отзыва вручную.
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
      <WorkspaceSupportChrome workspaceArea="settings" user={userMeta} />
    </div>
  );
}

export default function AutoRepliesPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center bg-[#F3F1EA] text-[#4a4946]"
          style={uiSans}
        >
          Загрузка…
        </div>
      }
    >
      <AutoRepliesPageContent />
    </Suspense>
  );
}
