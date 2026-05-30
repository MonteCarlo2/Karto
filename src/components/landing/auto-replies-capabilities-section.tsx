"use client";

import Image from "next/image";
import Link from "next/link";
import { AutoRepliesEntryLink } from "@/components/auto-replies/auto-replies-entry-link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Gift,
  Headphones,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import type { StarKey } from "@/lib/auto-replies/settings-types";
import {
  generateLandingDemoReply,
  GREEN,
  LIME,
  MARKETPLACES,
} from "@/components/landing/auto-replies-landing-shared";

const FEATURES = [
  {
    icon: Gift,
    title: "30 отзывов бесплатно",
    text: "Пробный период на месяц: 30 ответов без оплаты. Доступно в любом режиме — по тексту, полуавтомате или автомате. Успеете оценить качество до подключения кабинета.",
    accent: "from-[#F4FFE8] to-[#ECF7DB]",
  },
  {
    icon: BarChart3,
    title: "Аналитика",
    text: "Статистика по ответам и отзывам: история, распределение по оценкам, контроль качества формулировок и динамика по каждой площадке.",
    accent: "from-[#FAFAF6] to-[#F0EDE4]",
  },
  {
    icon: ShieldCheck,
    title: "API-интеграция*",
    text: "Работаем через официальное API Wildberries, Ozon и Яндекс Маркета: отзывы подтягиваются в KARTO, ответы уходят обратно в кабинет. Ключи хранятся только у вас.",
    accent: "from-[#EEF6FC] to-[#FAFAF6]",
    footnote: true,
  },
  {
    icon: Headphones,
    title: "Поддержка",
    text: "Возникли вопросы по автоответам, настройке или подключению? Напишите в поддержку — разберёмся вместе и поможем запустить режим под ваш магазин.",
    accent: "from-[#FAFAF6] to-[#ECF7DB]",
  },
] as const;

const DUAL_AI_QUOTE = "Один ИИ пишет. Второй ИИ проверяет. Вы спите спокойно.";

function LandingReplyText({ text }: { text: string }) {
  return (
    <div
      className="relative min-h-[200px] whitespace-pre-wrap rounded-[1rem] border px-5 py-4 text-[16px] leading-[1.82] sm:text-[17px]"
      style={{
        borderColor: "rgba(46,90,67,0.12)",
        background: "linear-gradient(165deg, rgba(238,246,232,0.92) 0%, rgba(255,255,255,0.88) 100%)",
        color: "#1a1a1a",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 left-0 top-4 w-[3px] rounded-full bg-[#2E5A43]"
      />
      <span className="relative block pl-2">{text}</span>
    </div>
  );
}

function FeaturesPanel() {
  return (
    <div className="relative mt-10 w-full md:mt-12">
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-[#1F4E3D]/08 px-4 pb-14 sm:px-8 sm:pb-16"
        style={{
          background:
            "linear-gradient(135deg, rgba(236,247,219,0.28) 0%, rgba(245,245,240,0.95) 50%, rgba(238,246,252,0.35) 100%)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="border-b border-[#1F4E3D]/08 px-1 py-7 sm:py-8 md:py-9"
        >
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ECF7DB] text-[#1F4E3D] ring-1 ring-[#84CC16]/30 sm:h-14 sm:w-14">
                <Bot className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <h3
                  className="text-2xl font-bold leading-tight text-[#1F4E3D] sm:text-3xl md:text-[2rem]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Два ИИ на{" "}
                  <span className="text-[#84CC16]">каждый ответ</span>
                </h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-[#5f5a52] sm:text-[15px] md:text-base">
                  Первая модель пишет ответ с учётом оценки и настроек. Вторая проверяет тон и формулировки — и
                  только потом ответ попадает к вам.
                </p>
              </div>
            </div>

            <blockquote
              className="rounded-xl bg-[#ECF7DB]/55 px-5 py-4 ring-1 ring-[#84CC16]/20 sm:px-6 sm:py-[1.125rem]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <p className="text-[17px] font-semibold leading-snug text-[#1F4E3D] sm:text-lg md:text-xl md:leading-tight">
                «{DUAL_AI_QUOTE}»
              </p>
            </blockquote>
          </div>
        </motion.div>

        <div className="px-1 pt-7 sm:pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1F4E3D]/45">
            И другие возможности
          </p>

          <div className="relative mt-5 grid gap-5 md:grid-cols-2 md:gap-6">
            {FEATURES.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  whileHover={{ y: -2 }}
                  className={`relative flex flex-col rounded-[1.25rem] border border-[#1F4E3D]/08 bg-gradient-to-br ${feat.accent} p-5 sm:p-6`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1F4E3D]/08 text-[#2E5A43]">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <h3
                      className="text-lg font-bold text-[#1F4E3D] sm:text-xl"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {feat.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-[#5f5a52] sm:text-[15px]">{feat.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-4 z-10 max-w-[min(100vw-2rem,34rem)] sm:bottom-4 sm:left-6">
          <p className="pointer-events-auto text-left text-[11px] leading-snug text-[#5f5a52] sm:text-[12px]">
            <span className="font-semibold text-[#1F4E3D]">*</span> Для отправки ответов на{" "}
            <span className="font-semibold text-[#1F4E3D]">Ozon</span> через API нужна подписка{" "}
            <span className="font-bold text-[#2E5A43]">«Управление отзывами»</span> или{" "}
            <span className="font-bold text-[#2E5A43]">«Premium Pro»</span>. Без неё — режим по тексту или
            копирование ответа вручную.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlatformBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="shrink-0 rounded-2xl border border-[#1F4E3D]/08 bg-[#FAFAF6]/80 px-5 py-4 sm:px-6 sm:py-5 lg:ml-auto"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#1F4E3D]/50 sm:text-[11px]">
        Три площадки — одно окно
      </p>
      <div className="mt-3.5 flex items-center gap-4 sm:gap-5">
        {MARKETPLACES.map((mp, i) => (
          <motion.div
            key={mp.id}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -2 }}
            className="overflow-hidden rounded-[22%] ring-1 ring-[#1F4E3D]/10"
          >
            <Image
              src={mp.logo}
              alt={mp.name}
              width={72}
              height={72}
              className="h-12 w-12 sm:h-14 sm:w-14"
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function TryItWidget() {
  const [rating, setRating] = useState<StarKey>("5");
  const [review, setReview] = useState("");
  const [phase, setPhase] = useState<"idle" | "generating" | "checking" | "done">("idle");
  const [reply, setReply] = useState("");
  const [used, setUsed] = useState(false);

  const handleGenerate = async () => {
    if (used || phase !== "idle") return;
    const text = review.trim() || "Отличное качество, доставили быстро!";
    setPhase("generating");
    setReply("");
    await new Promise((r) => setTimeout(r, 900));
    setPhase("checking");
    await new Promise((r) => setTimeout(r, 700));
    setReply(generateLandingDemoReply(text, rating));
    setUsed(true);
    setPhase("done");
  };

  return (
    <div className="relative mx-auto max-w-5xl">
      <motion.h3
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center text-5xl font-bold tracking-tight text-[#1F4E3D] md:text-6xl lg:text-7xl"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Попробуйте{" "}
        <span className="bg-gradient-to-r from-[#84CC16] to-[#2E5A43] bg-clip-text text-transparent">сами</span>
      </motion.h3>
      <p className="mx-auto mt-4 max-w-xl text-center text-base text-[#6b665e] md:text-lg">
        Один пробный ответ на главной. В сервисе —{" "}
        <span className="font-semibold text-[#2E5A43]">30 отзывов бесплатно</span> в любом режиме.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="rounded-[1.75rem] border border-[#1F4E3D]/08 bg-[#FAFAF6]/90 p-6 sm:p-7">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#1F4E3D]/60">Оценка</p>
          <div className="mt-3 flex gap-2">
            {(["1", "2", "3", "4", "5"] as StarKey[]).map((star) => (
              <motion.button
                key={star}
                type="button"
                onClick={() => !used && setRating(star)}
                disabled={used}
                whileHover={used ? undefined : { scale: 1.12 }}
                whileTap={used ? undefined : { scale: 0.95 }}
                className="rounded-xl p-1.5 disabled:opacity-50"
                aria-label={`${star} звёзд`}
              >
                <Star
                  className={`h-9 w-9 transition ${
                    Number(star) <= Number(rating) ? "fill-[#F5B800] text-[#F5B800]" : "text-[#d4d0c8]"
                  }`}
                  strokeWidth={1.5}
                />
              </motion.button>
            ))}
          </div>

          <label className="mt-6 block text-sm font-bold uppercase tracking-[0.12em] text-[#1F4E3D]/60" htmlFor="landing-review-demo">
            Текст отзыва
          </label>
          <textarea
            id="landing-review-demo"
            value={review}
            onChange={(e) => !used && setReview(e.target.value.slice(0, 500))}
            disabled={used}
            placeholder="Например: Отличное качество, доставили быстро, но упаковка немного помята…"
            rows={5}
            className="mt-3 w-full resize-none rounded-2xl border border-[#1F4E3D]/10 bg-white px-4 py-4 text-[15px] leading-relaxed text-[#1a1a1a] outline-none transition focus:border-[#84CC16]/50 focus:ring-2 focus:ring-[#84CC16]/25 disabled:opacity-60"
          />
          <p className="mt-1 text-right text-xs text-[#8a847c]">{review.length}/500</p>

          <motion.button
            type="button"
            onClick={handleGenerate}
            disabled={used || phase === "generating" || phase === "checking"}
            whileHover={{ scale: !used && phase === "idle" ? 1.02 : 1 }}
            whileTap={{ scale: 0.98 }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1F4E3D] py-4 text-base font-semibold text-white shadow-[0_16px_40px_-16px_rgba(31,78,61,0.5)] transition hover:bg-[#16382c] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#1F4E3D]"
          >
            <Sparkles className={`h-5 w-5 ${phase === "generating" || phase === "checking" ? "animate-pulse" : ""}`} />
            {phase === "generating"
              ? "ИИ формирует ответ…"
              : phase === "checking"
                ? "Вторая модель проверяет…"
                : "Сгенерировать ответ"}
          </motion.button>
        </div>

        <div className="flex min-h-[280px] flex-col justify-center rounded-[1.75rem] border border-[#1F4E3D]/08 bg-[#FAFAF6]/60 p-6 sm:p-7">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-[#1F4E3D]/60">
            Сгенерированный ответ
          </p>

          <AnimatePresence mode="wait">
            {phase === "done" && reply ? (
              <motion.div key="reply" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <LandingReplyText text={reply} />
              </motion.div>
            ) : phase === "generating" || phase === "checking" ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              >
                <Sparkles className="h-8 w-8 animate-pulse text-[#84CC16]" />
                <p className="text-[15px] font-medium text-[#2E5A43]">
                  {phase === "generating" ? "KARTO формирует ответ…" : "Проверка формулировок…"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-1 items-center justify-center rounded-[1rem] border border-dashed border-[#1F4E3D]/15 px-4 py-12 text-center"
              >
                <p className="max-w-xs text-[14px] leading-relaxed text-[#8a847c]">
                  Здесь появится готовый ответ — так же, как в ручном режиме рабочего пространства.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function AutoRepliesCapabilitiesSection() {
  return (
    <section className="relative min-h-[92vh] overflow-hidden bg-[#F5F5F0] py-16 md:py-20 lg:py-28">
      <div
        className="pointer-events-none absolute bottom-[5%] right-[-10%] h-[420px] w-[420px] rounded-full opacity-20 blur-3xl"
        style={{ background: `radial-gradient(circle, ${GREEN} 0%, transparent 70%)` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[-8%] top-[20%] h-[360px] w-[360px] rounded-full opacity-15 blur-3xl"
        style={{ background: `radial-gradient(circle, ${LIME} 0%, transparent 70%)` }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12"
        >
          <div className="max-w-3xl">
            <h2
              className="text-4xl font-bold leading-tight tracking-tight text-[#1F4E3D] md:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Возможности{" "}
              <span className="text-[#84CC16]">автоответов</span>
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#6b665e] md:text-lg">
              Всё, что нужно селлеру для ежедневной работы с отзывами — от пробного периода до API и аналитики.
            </p>
          </div>
          <PlatformBadge />
        </motion.div>

        <FeaturesPanel />

        <div className="mt-20 border-t border-[#1F4E3D]/08 pt-16 md:pt-20">
          <TryItWidget />
        </div>

        <div className="mt-14 flex justify-center">
          <AutoRepliesEntryLink
            href="/studio/auto-replies"
            className="inline-flex items-center gap-2 rounded-xl bg-[#1F4E3D] px-8 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_-8px_rgba(31,78,61,0.55)] transition hover:bg-[#16382c]"
          >
            Перейти в автоответы
            <ArrowRight className="h-5 w-5" />
          </AutoRepliesEntryLink>
        </div>
      </div>
    </section>
  );
}
