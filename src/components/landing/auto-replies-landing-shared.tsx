"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Sparkles, Star } from "lucide-react";
import type { AutoRepliesShopSettings, StarKey } from "@/lib/auto-replies/settings-types";
import { buildMockAutoReply } from "@/lib/auto-replies/mock-reply";
import { defaultTemplateSettings } from "@/lib/auto-replies/signature-settings";
import { defaultAdvancedSettings } from "@/lib/auto-replies/restrictions-settings";

export const LIME = "#84CC16";
export const GREEN = "#1F4E3D";

export const MARKETPLACES = [
  { id: "wildberries", name: "Wildberries", logo: "/logos/marketplace-wildberries-app.png" },
  { id: "ozon", name: "Ozon", logo: "/logos/marketplace-ozon-app.png" },
  { id: "yandex", name: "Яндекс Маркет", logo: "/logos/marketplace-yandex-market-app.png" },
] as const;

export const MODES = [
  {
    id: "manual",
    label: "По тексту",
    hint: "Вставили отзыв — получили ответ. Без API, для быстрых проверок.",
  },
  {
    id: "semi",
    label: "Полуавтомат",
    hint: "Отзывы из кабинета по API. Отправка только после вашего подтверждения.",
  },
  {
    id: "auto",
    label: "Автомат",
    hint: "Новые отзывы обрабатываются сами — там, где площадка это разрешает.",
  },
] as const;

const DEMO_REVIEWS = [
  {
    mp: 0,
    stars: 5,
    product: "Плед «СимСтрой»",
    text: "Очень мягкий, пришёл быстро. Рекомендую!",
    reply:
      "Спасибо за тёплые слова! Рады, что плед оправдал ожидания — приятных вечеров вам 🌿",
  },
  {
    mp: 1,
    stars: 3,
    product: "Набор для дома",
    text: "Качество норм, но упаковка помялась.",
    reply:
      "Благодарим за отзыв. Нам жаль про упаковку — уже усилили защиту при отправке. Если нужна помощь — напишите в чат заказа.",
  },
  {
    mp: 2,
    stars: 4,
    product: "Светильник LED",
    text: "Свет яркий, монтаж простой.",
    reply:
      "Спасибо, что выбрали нас! Рады, что монтаж прошёл легко — пусть свет радует каждый день.",
  },
];

const LANDING_DEMO_SHOP: AutoRepliesShopSettings = {
  style: {
    preset: "warm",
    addressForm: "vy",
    useBuyerName: false,
    mentionProduct: true,
    emojis: true,
    length: "normal",
    thankForPhotos: true,
    deliveryContext: "marketplace",
    emptyReviewEnabled: true,
    emptyReviewCustomText: "",
    tonePositive: "warm",
    toneNeutral: "neutral",
    toneNegative: "warm",
  },
  templates: defaultTemplateSettings(),
  training: { aboutShop: "", rulesAndFaq: "", documents: [], referenceImages: [] },
  advanced: defaultAdvancedSettings(),
};

export function Stars({
  count,
  size = "sm",
}: {
  count: number;
  size?: "sm" | "md" | "lg";
}) {
  const cls = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${cls} ${i < count ? "fill-[#F5B800] text-[#F5B800]" : "text-[#d4d0c8]"}`}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

export function generateLandingDemoReply(reviewText: string, starRating: StarKey): string {
  return buildMockAutoReply({
    reviewText,
    starRating,
    shop: LANDING_DEMO_SHOP,
    brandName: "KARTO",
  });
}

export function WorkspacePreview({ large = false }: { large?: boolean }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"review" | "typing" | "checking" | "reply">("review");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("typing"), 1200);
    const t2 = setTimeout(() => setPhase("checking"), 2200);
    const t3 = setTimeout(() => setPhase("reply"), 3400);
    const t4 = setTimeout(() => {
      setPhase("review");
      setIndex((i) => (i + 1) % DEMO_REVIEWS.length);
    }, 7200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [index]);

  const demo = DEMO_REVIEWS[index]!;
  const mp = MARKETPLACES[demo.mp]!;

  return (
    <div className={`relative mx-auto w-full ${large ? "max-w-[720px] lg:max-w-none" : "max-w-[520px]"}`}>
      <div
        className="pointer-events-none absolute -inset-10 rounded-[3rem] opacity-60 blur-3xl"
        style={{ background: `radial-gradient(circle at 50% 40%, ${LIME}33 0%, transparent 70%)` }}
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`relative overflow-hidden ring-1 ring-[#1F4E3D]/12 ${
          large ? "rounded-[2rem] lg:rounded-[2.25rem]" : "rounded-[1.75rem]"
        }`}
        style={{
          background: "linear-gradient(165deg, #FAFAF6 0%, #F0EDE4 48%, #E8E4DC 100%)",
          boxShadow: "0 48px 110px -42px rgba(31,78,61,0.38)",
        }}
      >
        <div
          className={`flex items-center gap-3 border-b border-[#1F4E3D]/10 ${
            large ? "px-6 py-4" : "px-5 py-3.5"
          }`}
        >
          <div className="flex gap-1.5" aria-hidden>
            <span className={`rounded-full bg-[#ff5f57]/90 ${large ? "h-3 w-3" : "h-2.5 w-2.5"}`} />
            <span className={`rounded-full bg-[#febc2e]/90 ${large ? "h-3 w-3" : "h-2.5 w-2.5"}`} />
            <span className={`rounded-full bg-[#28c840]/90 ${large ? "h-3 w-3" : "h-2.5 w-2.5"}`} />
          </div>
          <span
            className={`font-semibold uppercase tracking-[0.18em] text-[#1F4E3D]/55 ${
              large ? "text-xs" : "text-[11px]"
            }`}
          >
            KARTO · Автоответы
          </span>
        </div>

        <div
          className={`grid gap-0 ${
            large ? "min-h-[560px] grid-cols-[108px_1fr] lg:min-h-[620px]" : "min-h-[420px] grid-cols-[88px_1fr]"
          }`}
        >
          <div className="border-r border-[#1F4E3D]/10 bg-[#E8E4DC]/80 px-2 py-5">
            <p
              className={`mb-4 text-center font-semibold uppercase tracking-[0.14em] text-[#6b665e] ${
                large ? "text-[10px]" : "text-[9px]"
              }`}
            >
              Площадки
            </p>
            <div className={`flex flex-col items-center ${large ? "gap-4" : "gap-3"}`}>
              {MARKETPLACES.map((m, i) => (
                <motion.div
                  key={m.id}
                  animate={{
                    scale: demo.mp === i ? 1.08 : 0.9,
                    opacity: demo.mp === i ? 1 : 0.42,
                  }}
                  transition={{ duration: 0.35 }}
                  className={`relative overflow-hidden rounded-[22%] ring-2 ${
                    demo.mp === i ? "ring-[#1F4E3D]/70" : "ring-transparent"
                  }`}
                >
                  <Image
                    src={m.logo}
                    alt={m.name}
                    width={64}
                    height={64}
                    className={large ? "h-14 w-14" : "h-11 w-11"}
                  />
                </motion.div>
              ))}
            </div>
            <div className={`mt-8 space-y-2 px-1 ${large ? "" : "mt-6 space-y-1.5"}`}>
              {["Ответы", "Настройки", "Анализ"].map((label, i) => (
                <div
                  key={label}
                  className={`rounded-lg text-center font-semibold ${
                    large ? "px-2.5 py-2 text-[11px]" : "px-2 py-1.5 text-[10px]"
                  } ${i === 0 ? "bg-[#B9FF4B]/35 text-[#1F4E3D]" : "text-[#7a746c]"}`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className={`flex flex-col ${large ? "px-6 py-5 sm:px-7" : "px-4 py-4 sm:px-5"}`}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mp.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-2.5"
                >
                  <Image
                    src={mp.logo}
                    alt=""
                    width={40}
                    height={40}
                    className={large ? "h-9 w-9 rounded-[22%]" : "h-7 w-7 rounded-[22%]"}
                  />
                  <span className={`font-semibold text-[#1a1a1a] ${large ? "text-[15px]" : "text-[13px]"}`}>
                    {mp.name}
                  </span>
                </motion.div>
              </AnimatePresence>
              <span
                className={`rounded-full bg-[#2E5A43]/12 font-semibold text-[#2E5A43] ${
                  large ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"
                }`}
              >
                Полуавтомат
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${index}-review`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`rounded-xl border border-[#1F4E3D]/10 bg-white/75 ${
                  large ? "px-4 py-4" : "px-3.5 py-3"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate font-semibold text-[#1a1a1a] ${large ? "text-[14px]" : "text-[12px]"}`}>
                    {demo.product}
                  </p>
                  <Stars count={demo.stars} size={large ? "md" : "sm"} />
                </div>
                <p className={`mt-2 leading-relaxed text-[#4a4740] ${large ? "text-[15px]" : "text-[13px]"}`}>
                  {demo.text}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-auto pt-5">
              {phase === "typing" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center gap-2 font-medium text-[#2E5A43] ${large ? "text-[13px]" : "text-[12px]"}`}
                >
                  <Sparkles className={`animate-pulse text-[#84CC16] ${large ? "h-5 w-5" : "h-4 w-4"}`} />
                  ИИ-модель формирует ответ…
                </motion.div>
              ) : phase === "checking" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center gap-2 font-medium text-[#2E5A43] ${large ? "text-[13px]" : "text-[12px]"}`}
                >
                  <CheckCircle2 className={`text-[#84CC16] ${large ? "h-5 w-5" : "h-4 w-4"}`} />
                  Вторая модель проверяет тон и формулировки…
                </motion.div>
              ) : phase === "reply" ? (
                <motion.div
                  key={`${index}-reply`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border border-[#84CC16]/25 bg-[#F4FFE8]/90 ${
                    large ? "px-4 py-4" : "px-3.5 py-3"
                  }`}
                >
                  <p
                    className={`font-semibold uppercase tracking-[0.12em] text-[#2E5A43] ${
                      large ? "text-[11px]" : "text-[10px]"
                    }`}
                  >
                    Ответ KARTO · проверен
                  </p>
                  <p className={`mt-2 leading-relaxed text-[#1a1a1a] ${large ? "text-[15px]" : "text-[13px]"}`}>
                    {demo.reply}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <span
                      className={`rounded-lg bg-[#1F4E3D] font-semibold text-white ${
                        large ? "px-4 py-2 text-[12px]" : "px-3 py-1.5 text-[11px]"
                      }`}
                    >
                      Отправить
                    </span>
                    <span
                      className={`rounded-lg border border-[#1F4E3D]/20 font-semibold text-[#1F4E3D] ${
                        large ? "px-4 py-2 text-[12px]" : "px-3 py-1.5 text-[11px]"
                      }`}
                    >
                      Изменить
                    </span>
                  </div>
                </motion.div>
              ) : (
                <p className={`text-[#8a847c] ${large ? "text-[13px]" : "text-[12px]"}`}>Новый отзыв в очереди…</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
