"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ExternalLink, X } from "lucide-react";
import type { MarketplaceApiGuide } from "@/lib/auto-replies/marketplace-api-guide";
import { glass, panel, wsSans } from "./settings-ui";

function ApiGuideStepCard({
  step,
  index,
  large,
}: {
  step: MarketplaceApiGuide["steps"][number];
  index: number;
  large?: boolean;
}) {
  const stepNo = String(index + 1).padStart(2, "0");

  return (
    <article
      className={`rounded-[1.1rem] border ${large ? "p-5 sm:p-6" : "p-4 sm:p-5"}`}
      style={{
        borderColor: glass.borderSoft,
        backgroundColor: "rgba(255,255,255,0.72)",
        boxShadow: "0 12px 32px -22px rgba(46,90,67,0.2)",
      }}
    >
      <div className="flex gap-4">
        <span
          className={`flex shrink-0 items-center justify-center rounded-[0.9rem] font-bold tabular-nums ${
            large ? "h-11 w-11 text-[14px]" : "h-10 w-10 text-[13px]"
          }`}
          style={{
            ...wsSans,
            color: panel.greenDark,
            backgroundColor: "rgba(185,255,75,0.28)",
            boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.12)",
          }}
        >
          {stepNo}
        </span>
        <div className="min-w-0 flex-1">
          <h4
            className={`font-semibold tracking-[-0.02em] ${large ? "text-[17px] sm:text-[18px]" : "text-[15px] sm:text-[16px]"}`}
            style={{ ...wsSans, color: panel.text }}
          >
            {step.title}
          </h4>
          <p
            className={`mt-2 leading-[1.65] ${large ? "text-[14px] sm:text-[15px]" : "text-[13px] sm:text-[14px]"}`}
            style={{ ...wsSans, color: panel.textMuted }}
          >
            {step.description}
          </p>
          {step.bullets?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {step.bullets.map((item) => (
                <li
                  key={item}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium sm:text-[13px]"
                  style={{
                    ...wsSans,
                    color: panel.greenDark,
                    backgroundColor: "rgba(238,246,232,0.95)",
                    boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.1)",
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {step.imageSrc ? (
        <div
          className={`overflow-hidden rounded-[1rem] border ${large ? "mt-5" : "mt-4"}`}
          style={{
            borderColor: "rgba(46,90,67,0.14)",
            backgroundColor: "#fff",
            boxShadow: "0 16px 40px -24px rgba(46,90,67,0.22)",
          }}
        >
          <Image
            src={step.imageSrc}
            alt={step.imageAlt ?? step.title}
            width={2100}
            height={1350}
            className="h-auto w-full"
            sizes={large ? "(max-width: 1024px) 100vw, 960px" : "(max-width: 768px) 100vw, 720px"}
            priority={index === 0}
          />
        </div>
      ) : null}
    </article>
  );
}

type WorkspaceApiGuideModalProps = {
  open: boolean;
  onClose: () => void;
  marketplaceLabel: string;
  guide: MarketplaceApiGuide;
};

export function WorkspaceApiGuideModal({
  open,
  onClose,
  marketplaceLabel,
  guide,
}: WorkspaceApiGuideModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть инструкцию"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] cursor-default border-0 bg-[#0A0A0A]/55 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-guide-title"
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-3 top-[4vh] z-[91] mx-auto flex max-h-[92vh] w-[min(980px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.35rem] border shadow-[0_28px_90px_-24px_rgba(10,10,10,0.5)] sm:inset-x-6"
            style={{ borderColor: panel.borderStrong, backgroundColor: panel.canvas }}
          >
            <div
              className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 sm:py-5"
              style={{
                borderColor: glass.borderSoft,
                background:
                  "linear-gradient(120deg, rgba(46,90,67,0.07) 0%, rgba(255,255,255,0.55) 50%, rgba(185,255,75,0.12) 100%)",
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 shrink-0" style={{ color: panel.green }} strokeWidth={2} />
                  <h2
                    id="api-guide-title"
                    className="text-[18px] font-bold tracking-[-0.03em] sm:text-[20px]"
                    style={{ ...wsSans, color: panel.text }}
                  >
                    Как получить API-ключ
                  </h2>
                </div>
                <p className="mt-1 text-[13px] sm:text-[14px]" style={{ ...wsSans, color: panel.textMuted }}>
                  {marketplaceLabel} · пошаговая инструкция со скриншотами
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition hover:bg-black/[0.04]"
                style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.72)" }}
              >
                <X className="h-5 w-5" style={{ color: panel.textSubtle }} strokeWidth={2.2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              <div className="space-y-5 sm:space-y-6">
                {guide.steps.map((step, index) => (
                  <ApiGuideStepCard key={step.title} step={step} index={index} large />
                ))}
              </div>

              <div
                className="mt-6 rounded-[1.05rem] border px-4 py-4 sm:px-5 sm:py-5"
                style={{
                  borderColor: "rgba(46,90,67,0.12)",
                  backgroundColor: "rgba(255,255,255,0.55)",
                }}
              >
                <p className="text-[14px] font-semibold sm:text-[15px]" style={{ ...wsSans, color: panel.text }}>
                  Официальная документация
                </p>
                <p className="mt-1 text-[13px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
                  Если нужны подробности по методам API — откройте справку на сайте маркетплейса.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {guide.officialDocs.map((doc) => (
                    <a
                      key={doc.url}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition hover:brightness-[1.03] sm:text-[13px]"
                      style={{
                        ...wsSans,
                        color: panel.greenDark,
                        backgroundColor: "rgba(238,246,232,0.95)",
                        boxShadow: "inset 0 0 0 1px rgba(46,90,67,0.12)",
                      }}
                    >
                      {doc.label}
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6"
              style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.45)" }}
            >
              <p className="text-[12px] leading-[1.6] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
                Скопируйте ключ и вставьте его в поле на странице подключения.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold transition hover:brightness-[1.03]"
                style={{ ...wsSans, backgroundColor: panel.green, color: "#fff" }}
              >
                Понятно
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
