"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, Copy, History, Star, X } from "lucide-react";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import {
  formatHistoryWhen,
  listReplyHistory,
  type ReplyHistoryEntry,
} from "@/lib/auto-replies/reply-history-store";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { prepareReplyForCopy } from "@/lib/auto-replies/reply-postprocess";
import type { AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import { WsSystemBlueButton } from "./workspace-shiny-buttons";
import { glass, panel, wsComposeText, wsSans } from "./settings-ui";

type WorkspaceReplyHistoryPanelProps = {
  open: boolean;
  onClose: () => void;
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  shopSettings?: AutoRepliesShopSettings;
  onCopy: (text: string) => void;
  layout?: "drawer" | "fullpage";
  highlightManual?: boolean;
};

export function WorkspaceReplyHistoryPanel({
  open,
  onClose,
  shopId,
  marketplaceId,
  shopSettings,
  onCopy,
  layout = "drawer",
  highlightManual = false,
}: WorkspaceReplyHistoryPanelProps) {
  const [entries, setEntries] = useState<ReplyHistoryEntry[]>([]);
  const isFullPage = layout === "fullpage";

  useEffect(() => {
    if (!open) return;
    setEntries(listReplyHistory(shopId, marketplaceId));
  }, [open, shopId, marketplaceId]);

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
            aria-label="Закрыть историю"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={
              isFullPage
                ? "fixed inset-0 z-[98] cursor-default border-0 bg-[#F3F1EA]"
                : "fixed inset-0 z-[88] cursor-default border-0 bg-[#0A0A0A]/50 backdrop-blur-[2px]"
            }
          />

          {isFullPage ? (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reply-history-title"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="fixed inset-0 z-[99] flex flex-col overflow-hidden"
              style={{ backgroundColor: panel.canvas }}
            >
              <div
                className="relative shrink-0 border-b px-6 py-6 sm:px-10 sm:py-7"
                style={{
                  borderColor: glass.borderSoft,
                  background:
                    "linear-gradient(135deg, rgba(185,255,75,0.1) 0%, rgba(243,241,234,0.92) 100%)",
                }}
              >
                <div className="relative mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <History className="h-5 w-5" style={{ color: panel.greenDark }} strokeWidth={2} />
                      <h2
                        id="reply-history-title"
                        className="text-[1.5rem] font-bold tracking-[-0.03em] sm:text-[1.65rem]"
                        style={{ ...wsSans, color: panel.text }}
                      >
                        История ответов
                      </h2>
                    </div>
                      <p className="mt-2 max-w-[32rem] text-[14px] leading-[1.65] sm:text-[15px]" style={{ ...wsSans, color: panel.textMuted }}>
                        {highlightManual
                          ? "Все ответы, которые вы сгенерировали в ручном режиме — ничего не теряется при переключении вкладок."
                          : "Все сгенерированные ответы сохраняются здесь — режим не теряется при переключении."}
                      </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Закрыть"
                    onClick={onClose}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] border transition hover:bg-black/[0.04]"
                    style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.65)" }}
                  >
                    <X className="h-5 w-5" strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
                <div className="mx-auto w-full max-w-4xl">
                  <HistoryList
                    entries={entries}
                    onCopy={onCopy}
                    highlightManual={highlightManual}
                    shopSettings={shopSettings}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="reply-history-title"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="fixed inset-y-0 right-0 z-[89] flex w-[min(520px,calc(100vw-1rem))] flex-col border-l shadow-[0_0_80px_-20px_rgba(10,10,10,0.45)]"
              style={{ borderColor: glass.border, backgroundColor: panel.canvas }}
            >
              <div
                className="flex items-start justify-between gap-3 border-b px-5 py-4"
                style={{
                  borderColor: glass.borderSoft,
                  background:
                    "linear-gradient(135deg, rgba(46,90,67,0.07) 0%, rgba(185,255,75,0.12) 100%)",
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-5 w-5" style={{ color: panel.green }} strokeWidth={2} />
                    <h2
                      id="reply-history-title"
                      className="text-[18px] font-bold tracking-[-0.03em]"
                      style={{ ...wsSans, color: panel.text }}
                    >
                      История ответов
                    </h2>
                  </div>
                  <p className="mt-1 text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
                    Все сгенерированные ответы сохраняются здесь.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-black/[0.04]"
                  style={{ borderColor: glass.borderSoft }}
                >
                  <X className="h-4 w-4" strokeWidth={2.2} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <HistoryList entries={entries} onCopy={onCopy} compact shopSettings={shopSettings} />
              </div>
            </motion.aside>
          )}
        </>
      ) : null}
    </AnimatePresence>
  );
}

function HistoryList({
  entries,
  onCopy,
  compact,
  highlightManual,
  shopSettings,
}: {
  entries: ReplyHistoryEntry[];
  onCopy: (text: string) => void;
  compact?: boolean;
  highlightManual?: boolean;
  shopSettings?: AutoRepliesShopSettings;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (entry: ReplyHistoryEntry) => {
    const text = prepareReplyForCopy(entry.replyText, shopSettings);
    const ok = await copyToClipboard(text);
    if (!ok) return;
    onCopy(text);
    setCopiedId(entry.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === entry.id ? null : current));
    }, 1800);
  };
  if (entries.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border px-6 py-16 text-center"
        style={{
          borderColor: glass.borderSoft,
          backgroundColor: "rgba(255,255,255,0.55)",
        }}
      >
        <p className="text-[16px] font-semibold" style={{ ...wsSans, color: panel.text }}>
          Пока пусто
        </p>
        <p className="mt-2 max-w-[20rem] text-[14px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
          Сгенерируйте первый ответ — он появится здесь автоматически.
        </p>
      </div>
    );
  }

  return (
    <ul className={compact ? "space-y-3" : "space-y-4"}>
      {entries.map((entry, index) => (
        <motion.li
          key={entry.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index * 0.04, 0.24) }}
          className="overflow-hidden rounded-[1.15rem] border"
          style={{
            borderColor: glass.borderSoft,
            backgroundColor: "rgba(255,255,255,0.62)",
            boxShadow: "0 16px 40px -28px rgba(10,10,10,0.35)",
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5"
            style={{
              borderColor: glass.borderSoft,
              background:
                entry.usageMode === "manual" && highlightManual
                  ? "linear-gradient(90deg, rgba(185,255,75,0.18), rgba(255,255,255,0.35))"
                  : "rgba(243,241,234,0.55)",
            }}
          >
            <span
              className="inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px] font-semibold"
              style={{
                ...wsSans,
                backgroundColor: panel.accentSoft,
                color: panel.greenDark,
              }}
            >
              {entry.usageMode === "manual" ? "Ручной режим" : entry.usageModeLabel}
            </span>
            <span className="flex items-center gap-2 text-[12px]" style={{ ...wsSans, color: panel.textSubtle }}>
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={1.5} />
              {entry.starRating}★
              <span aria-hidden>·</span>
              {formatHistoryWhen(entry.createdAt)}
            </span>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ ...wsSans, color: panel.textSubtle }}>
                Отзыв
              </p>
              <p className="mt-1.5 text-[14px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
                {entry.reviewText.trim() || "(без текста — только оценка)"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ ...wsSans, color: panel.textSubtle }}>
                Ответ
              </p>
              <p
                className="mt-1.5 whitespace-pre-wrap text-[16px] leading-[1.82] sm:text-[17px]"
                style={{ ...wsComposeText, color: panel.text }}
              >
                {entry.replyText}
              </p>
            </div>
            <WsSystemBlueButton
              onClick={() => void handleCopy(entry)}
              icon={
                copiedId === entry.id ? (
                  <Check className="h-[1.05em] w-[1.05em]" strokeWidth={2.3} />
                ) : (
                  <Copy className="h-[1.05em] w-[1.05em]" strokeWidth={2.2} />
                )
              }
            >
              {copiedId === entry.id ? "Скопировано" : "Копировать ответ"}
            </WsSystemBlueButton>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
