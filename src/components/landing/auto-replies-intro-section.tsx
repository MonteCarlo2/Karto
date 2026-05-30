"use client";

import Link from "next/link";
import { AutoRepliesEntryLink } from "@/components/auto-replies/auto-replies-entry-link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Clock,
  MessageSquareText,
  PenLine,
  Plug,
  Settings,
  Timer,
  Zap,
} from "lucide-react";
import { LIME, MODES, WorkspacePreview } from "@/components/landing/auto-replies-landing-shared";

const MODE_ICONS = [MessageSquareText, Plug, Zap] as const;

const BENEFITS = [
  {
    id: "personal",
    icon: PenLine,
    title: "Персонализированные",
    accent: "ответы",
    desc: "Тон, подпись и стиль — как будто пишете вы сами, а не шаблон.",
    tint: "#ECF7DB",
  },
  {
    id: "time",
    icon: Clock,
    title: "Экономия",
    accent: "времени",
    desc: "Секунды на ответ вместо вечернего «разбора» сотни отзывов.",
    tint: "#F4FFE8",
  },
  {
    id: "connect",
    icon: Timer,
    title: "Подключение",
    accent: "за минуту",
    desc: "Официальное API маркетплейса — без лишних шагов и таблиц.",
    tint: "#E8F5E9",
  },
] as const;

export function AutoRepliesIntroSection() {
  const [activeMode, setActiveMode] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveMode((m) => (m + 1) % MODES.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="auto-replies" className="relative min-h-[92vh] overflow-hidden bg-[#F5F5F0] py-16 md:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(31,78,61,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(31,78,61,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[-8%] top-[12%] h-[500px] w-[500px] rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${LIME} 0%, transparent 70%)` }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-14 xl:gap-20">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="order-2 lg:order-1 lg:pr-2 xl:pr-4"
          >
            <WorkspacePreview large />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 }}
            className="order-1 lg:order-2"
          >
            <h2
              className="text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl lg:text-[3.25rem]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <span className="text-[#1F4E3D]">Ответы на отзывы</span>
              <br />
              <span className="text-[#84CC16]">с помощью ИИ.</span>
            </h2>

            <div className="mt-8 space-y-4">
              {BENEFITS.map(({ id, icon: Icon, title, accent, desc, tint }, i) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ x: 4 }}
                  className="group flex gap-4"
                >
                  <div
                    className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl ring-1 ring-[#1F4E3D]/08 transition group-hover:scale-105"
                    style={{ background: tint }}
                  >
                    <Icon className="h-8 w-8 text-[#1F4E3D]" strokeWidth={1.8} />
                  </div>
                  <div className="pt-1">
                    <p className="text-xl font-bold leading-tight text-[#1a1a1a] md:text-2xl">
                      {title}{" "}
                      <span className="text-[#84CC16]">{accent}</span>
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#6b665e] md:text-[15px]">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-10 flex items-center gap-3"
            >
              <Settings className="h-5 w-5 shrink-0 text-[#1F4E3D]/60" strokeWidth={2} />
              <p className="text-[15px] font-medium text-[#4a4740]">
                <span className="font-bold text-[#1F4E3D]">Множество настроек</span> — тон, подписи, стоп-слова и
                шаблоны под каждую оценку.
              </p>
            </motion.div>

            <div className="mt-6 rounded-2xl border border-[#1F4E3D]/08 bg-[#FAFAF6]/70 px-4 py-4 sm:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1F4E3D]/50">
                Три режима работы
              </p>

              <div className="mt-2.5 flex rounded-xl bg-[#E8E4DC]/55 p-1">
                {MODES.map((mode, i) => {
                  const Icon = MODE_ICONS[i]!;
                  const isActive = activeMode === i;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setActiveMode(i)}
                      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-center transition sm:gap-2 sm:px-3 ${
                        isActive
                          ? "bg-white text-[#1F4E3D] shadow-sm ring-1 ring-[#1F4E3D]/10"
                          : "text-[#1F4E3D]/50 hover:text-[#1F4E3D]/75"
                      }`}
                    >
                      <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" strokeWidth={2.2} />
                      <span className={`text-[12px] font-semibold leading-tight sm:text-[13px] ${isActive ? "text-[#1F4E3D]" : ""}`}>
                        {mode.label}
                      </span>
                      {isActive ? (
                        <span className="absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#84CC16]" aria-hidden />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <motion.p
                key={activeMode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3.5 text-[15px] font-semibold leading-relaxed text-[#3d3a34] sm:text-base"
              >
                {MODES[activeMode]!.hint}
              </motion.p>
            </div>

            <div className="mt-8">
              <AutoRepliesEntryLink
                href="/studio/auto-replies"
                className="inline-flex h-14 items-center gap-2.5 rounded-xl bg-[#1F4E3D] px-8 text-base font-semibold text-white shadow-[0_8px_24px_-8px_rgba(31,78,61,0.55)] transition hover:bg-[#16382c]"
              >
                Открыть автоответы
                <ArrowRight className="h-5 w-5" />
              </AutoRepliesEntryLink>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
