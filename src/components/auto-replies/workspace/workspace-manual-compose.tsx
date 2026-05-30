"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  History,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  Star,
} from "lucide-react";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesShopSettings,
  StarKey,
} from "@/lib/auto-replies/settings-types";
import { isReviewWithoutText } from "@/lib/auto-replies/empty-review-settings";
import { findStopWordHitsInReview } from "@/lib/auto-replies/restrictions-settings";
import type { ReplyGenerationSource } from "@/lib/auto-replies/reply-history-store";
import { buildLocalAutoReply } from "@/lib/auto-replies/reply-generation";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { prepareReplyForCopy } from "@/lib/auto-replies/reply-postprocess";
import {
  canRegenerateReply,
  REPLY_REGENERATE_LIMIT,
  remainingRegenerations,
} from "@/lib/auto-replies/reply-regenerate-limit";
import {
  appendReplyHistory,
  persistComposeDraft,
  readComposeDraft,
} from "@/lib/auto-replies/reply-history-store";
import { GenerationLoader, ToolbarActionButton } from "./manual-compose-visuals";
import { KartoAiOrb } from "./karto-ai-orb";
import { WorkspaceReplyHistoryPanel } from "./workspace-reply-history-panel";
import { WsSaladOutlineButton, WsShinyBlackButton, WsSystemBlueButton } from "./workspace-shiny-buttons";
import { WsGlassPanel, glass, panel, wsComposeText, wsSans } from "./settings-ui";
import { autoRepliesAuthorizedFetch } from "@/components/auto-replies/auto-replies-entry-link";
import { AUTO_REPLY_INSUFFICIENT_BALANCE_MSG } from "@/lib/auto-replies-balance";

const ALL_STARS: StarKey[] = ["1", "2", "3", "4", "5"];

const REPLY_VIEWPORT_CLASS =
  "max-h-[min(380px,45vh)] min-h-[160px] overflow-y-auto overscroll-y-contain scroll-smooth";

type WorkspaceManualComposeProps = {
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  onGoSettings?: () => void;
  onReplyBalanceChange?: () => void | Promise<void>;
};

export function WorkspaceManualCompose({
  shopId,
  marketplaceId,
  usage,
  shopSettings,
  mpSettings,
  brandName,
  onGoSettings,
  onReplyBalanceChange,
}: WorkspaceManualComposeProps) {
  const [reviewText, setReviewText] = useState("");
  const [starRating, setStarRating] = useState<StarKey>("5");
  const [reply, setReply] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [revisionHint, setRevisionHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<ReplyGenerationSource | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [regenerateCount, setRegenerateCount] = useState(0);
  const reviewRef = useRef<HTMLTextAreaElement>(null);
  const hydrated = useRef(false);

  const regenerationsLeft = remainingRegenerations(regenerateCount);
  const regenerateBlocked = !canRegenerateReply(regenerateCount);

  const isEmptyReview = isReviewWithoutText(reviewText);
  const stopHits =
    shopSettings.advanced.stopWordsEnabled
      ? findStopWordHitsInReview(reviewText, shopSettings.advanced.stopWords)
      : [];

  useEffect(() => {
    const draft = readComposeDraft(shopId, marketplaceId);
    if (draft) {
      setReviewText(draft.reviewText);
      setStarRating(draft.starRating);
      setReply(draft.replyText);
      setEditDraft(draft.replyText);
      setRevisionHint(draft.revisionHint);
    }
    hydrated.current = true;
  }, [shopId, marketplaceId]);

  useEffect(() => {
    if (!hydrated.current) return;
    persistComposeDraft(shopId, marketplaceId, {
      reviewText,
      starRating,
      replyText: reply,
      revisionHint,
      updatedAt: new Date().toISOString(),
    });
  }, [shopId, marketplaceId, reviewText, starRating, reply, revisionHint]);

  const copyText = useCallback(async (text: string) => {
    const ok = await copyToClipboard(prepareReplyForCopy(text, shopSettings));
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [shopSettings]);

  const saveToHistory = useCallback(
    (replyText: string, generationSource: ReplyGenerationSource) => {
      appendReplyHistory({
        shopId,
        marketplaceId,
        usageMode: usage,
        usageModeLabel: "Ручной режим",
        starRating,
        reviewText: reviewText.trim(),
        replyText,
        generationSource,
      });
    },
    [shopId, marketplaceId, usage, starRating, reviewText]
  );

  const runGenerate = useCallback(
    async (options?: { regenerate?: boolean }) => {
      setError(null);

      const isRegenerate = options?.regenerate ?? false;
      if (isRegenerate && !canRegenerateReply(regenerateCount)) {
        setError(`Лимит перегенераций (${REPLY_REGENERATE_LIMIT}) исчерпан для этого отзыва.`);
        return;
      }

      setLoading(true);
      setEditMode(false);

      const hintText = revisionHint.trim();
      const previousReply = reply.trim();

      const payload = {
        reviewText: reviewText.trim(),
        starRating,
        shop: shopSettings,
        mp: mpSettings,
        brandName,
        revisionHint: isRegenerate && hintText ? hintText : null,
        previousReply: isRegenerate && previousReply ? previousReply : null,
      };

      try {
        const res = await autoRepliesAuthorizedFetch("/api/auto-replies/generate-reply", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as {
          reply?: string;
          source?: ReplyGenerationSource;
          error?: string;
          code?: string;
        };

        if (res.status === 402 || data.code === "insufficient_balance") {
          throw new Error(data.error || AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);
        }

        if (!res.ok || !data.reply) {
          throw new Error(data.error || "Не удалось сгенерировать ответ");
        }

        setReply(data.reply);
        setEditDraft(data.reply);
        const generationSource = data.source ?? "openrouter-dual";
        setSource(generationSource);
        saveToHistory(data.reply, generationSource);
        if (isRegenerate) setRegenerateCount((n) => n + 1);
        else void onReplyBalanceChange?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("балансе закончились") || msg.includes("Недостаточно ответов") || msg.includes("тариф")) {
          setError(msg || AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);
          return;
        }
        const fallback = buildLocalAutoReply(payload);
        setReply(fallback);
        setEditDraft(fallback);
        setSource("local");
        saveToHistory(fallback, "local");
        if (isRegenerate) setRegenerateCount((n) => n + 1);
        if (e instanceof Error && e.message) {
          setError("Сервис временно недоступен — показан локальный черновик.");
        }
      } finally {
        setLoading(false);
      }
    },
    [reviewText, starRating, shopSettings, mpSettings, brandName, revisionHint, reply, saveToHistory, regenerateCount, onReplyBalanceChange]
  );

  const handleGenerate = () => {
    if (stopHits.length > 0) {
      const ok = window.confirm(
        `В отзыве есть стоп-слово (${stopHits.join(", ")}). Всё равно сгенерировать ответ?`
      );
      if (!ok) return;
    }
    void runGenerate();
  };

  const startNewReview = () => {
    setReviewText("");
    setReply("");
    setEditDraft("");
    setRevisionHint("");
    setEditMode(false);
    setError(null);
    setRegenerateCount(0);
    reviewRef.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!loading) handleGenerate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div className="w-full max-w-[1140px] space-y-6 pb-8">
        <WsGlassPanel className="overflow-hidden shadow-[0_22px_60px_-38px_rgba(46,90,67,0.35)]">
          <div
            className="relative border-b px-5 py-5 sm:px-7 sm:py-6"
            style={{
              borderColor: glass.borderSoft,
              background:
                "linear-gradient(135deg, rgba(185,255,75,0.12) 0%, rgba(243,241,234,0.92) 52%, rgba(255,255,255,0.65) 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(185,255,75,0.18),transparent_68%)] blur-2xl"
            />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <KartoAiOrb size={50} className="mt-0.5 hidden sm:block" />
                <div className="min-w-0">
                  <h2
                    className="text-[22px] font-bold tracking-[-0.035em] sm:text-[24px]"
                    style={{ ...wsSans, color: panel.text }}
                  >
                    Ручной режим
                  </h2>
                  <p
                    className="mt-2 max-w-[36rem] text-[14px] leading-[1.65] sm:text-[15px]"
                    style={{ ...wsSans, color: panel.textMuted }}
                  >
                    Вставьте текст отзыва — мы учтём стиль, подписи, обучение и все ваши правила.
                    {isEmptyReview ? " Без текста сработает шаблон для пустого отзыва." : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0">
                <ToolbarActionButton
                  onClick={() => setHistoryOpen(true)}
                  icon={<History className="h-4 w-4" strokeWidth={2.1} />}
                  label="История"
                  variant="history"
                />
                {onGoSettings ? (
                  <ToolbarActionButton
                    onClick={onGoSettings}
                    icon={<ArrowRight className="h-4 w-4" strokeWidth={2.1} />}
                    label="Сменить режим"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </WsGlassPanel>

        <div className="grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-6">
          <ComposePanel
            step="01"
            tone="input"
            icon={<MessageSquareText className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />}
            title="Отзыв покупателя"
            hint="Скопируйте текст из кабинета маркетплейса"
          >
            <StarPicker value={starRating} onChange={setStarRating} />
            <div className="relative">
              <textarea
                ref={reviewRef}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Вставьте текст отзыва любого объёма…"
                rows={5}
                className="min-h-[148px] w-full resize-y rounded-[1rem] border px-4 py-3.5 text-[16px] leading-[1.8] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.12)] sm:min-h-[160px] sm:text-[17px]"
                style={{
                  ...wsComposeText,
                  borderColor: glass.borderSoft,
                  backgroundColor: "rgba(255,255,255,0.92)",
                  color: panel.text,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
                }}
              />
              {isEmptyReview ? (
                <span
                  className="absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{ ...wsSans, backgroundColor: panel.accentSoft, color: panel.greenDark }}
                >
                  Только звёзды
                </span>
              ) : null}
            </div>

            {stopHits.length > 0 ? (
              <p
                className="rounded-[0.85rem] border px-3 py-2 text-[12px]"
                style={{ ...wsSans, borderColor: panel.warnSoft, backgroundColor: panel.warnSoft, color: panel.warn }}
              >
                Стоп-слово в отзыве: {stopHits.join(", ")}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <WsShinyBlackButton
                onClick={handleGenerate}
                disabled={loading}
                loading={loading}
                size="lg"
                className="sm:flex-[1.62] sm:min-w-0"
              >
                {loading ? "Генерируем…" : "Сгенерировать ответ"}
              </WsShinyBlackButton>
              <WsSaladOutlineButton
                onClick={startNewReview}
                icon={<Plus className="h-4 w-4" strokeWidth={2.2} />}
                className="sm:flex-[0.72] sm:min-w-0"
                style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.72)", color: panel.text }}
              >
                Новый отзыв
              </WsSaladOutlineButton>
            </div>
            <p className="text-center text-[11px] sm:text-left" style={{ ...wsSans, color: panel.textSubtle }}>
              Ctrl + Enter — быстрая генерация
            </p>
          </ComposePanel>

          <ComposePanel
            step="02"
            tone="output"
            icon={<Reply className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />}
            title="Сгенерированный ответ"
            hint="Скопируйте и вставьте в кабинет маркетплейса"
            active={loading}
          >
            <AnimatePresence mode="wait">
              {loading ? (
                <GenerationLoader key="loading" />
              ) : reply ? (
                <motion.div key="reply" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  {editMode ? (
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={10}
                      className={`${REPLY_VIEWPORT_CLASS} w-full resize-y rounded-[1rem] border px-4 py-3.5 text-[16px] leading-[1.82] outline-none focus:ring-2 focus:ring-[rgba(46,90,67,0.12)] sm:text-[17px]`}
                      style={{
                        ...wsComposeText,
                        borderColor: glass.borderSoft,
                        backgroundColor: "rgba(255,255,255,0.92)",
                        color: panel.text,
                      }}
                    />
                  ) : (
                    <div
                      className={`relative ${REPLY_VIEWPORT_CLASS} whitespace-pre-wrap rounded-[1rem] border px-5 py-4 text-[16px] leading-[1.82] sm:text-[17px]`}
                      style={{
                        ...wsComposeText,
                        borderColor: "rgba(46,90,67,0.12)",
                        background:
                          "linear-gradient(165deg, rgba(238,246,232,0.92) 0%, rgba(255,255,255,0.88) 100%)",
                        color: panel.text,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-4 bottom-4 w-[3px] rounded-full"
                        style={{ backgroundColor: panel.green }}
                      />
                      <span className="relative block pl-2">{reply}</span>
                    </div>
                  )}

                  <div className="mt-4 shrink-0">
                    <WsSystemBlueButton
                      onClick={() => void copyText(editMode ? editDraft : reply)}
                      size="md"
                      icon={
                        copied ? (
                          <Check className="h-[1.05em] w-[1.05em]" strokeWidth={2.3} />
                        ) : (
                          <Copy className="h-[1.05em] w-[1.05em]" strokeWidth={2.2} />
                        )
                      }
                    >
                      {copied ? "Скопировано" : "Копировать ответ"}
                    </WsSystemBlueButton>
                  </div>

                  <div className="mt-3 shrink-0 flex flex-wrap gap-2">
                    {editMode ? (
                      <>
                        <ActionChip
                          onClick={() => {
                            setReply(editDraft);
                            setEditMode(false);
                            saveToHistory(editDraft, source ?? "local");
                          }}
                        >
                          Сохранить
                        </ActionChip>
                        <ActionChip
                          onClick={() => {
                            setEditDraft(reply);
                            setEditMode(false);
                          }}
                        >
                          Отмена
                        </ActionChip>
                      </>
                    ) : (
                      <>
                        <ActionChip onClick={() => setEditMode(true)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Редактировать
                        </ActionChip>
                        <ActionChip
                          onClick={() => void runGenerate({ regenerate: true })}
                          disabled={loading || regenerateBlocked}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {regenerateBlocked
                            ? "Лимит перегенераций"
                            : `Перегенерировать · ${regenerationsLeft}/${REPLY_REGENERATE_LIMIT}`}
                        </ActionChip>
                      </>
                    )}
                  </div>

                  {!editMode ? (
                    <input
                      type="text"
                      value={revisionHint}
                      onChange={(e) => setRevisionHint(e.target.value)}
                      placeholder="Уточнение для перегенерации (необязательно)"
                      className="mt-3 w-full shrink-0 rounded-[0.9rem] border px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[rgba(46,90,67,0.1)]"
                      style={{
                        ...wsSans,
                        borderColor: glass.borderSoft,
                        backgroundColor: panel.inputBg,
                        color: panel.text,
                      }}
                    />
                  ) : null}

                  {source === "local" ? (
                    <p className="mt-2 text-[11px]" style={{ ...wsSans, color: panel.textSubtle }}>
                      Локальный черновик (без OpenRouter)
                    </p>
                  ) : null}
                </motion.div>
              ) : (
                <EmptyReplyBlock key="empty" />
              )}
            </AnimatePresence>
            {error ? (
              <p className="mt-3 text-[12px]" style={{ ...wsSans, color: panel.warn }}>
                {error}
              </p>
            ) : null}
          </ComposePanel>
        </div>
      </div>

      <WorkspaceReplyHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        shopId={shopId}
        marketplaceId={marketplaceId}
        shopSettings={shopSettings}
        onCopy={(text) => void copyText(text)}
        layout="fullpage"
        highlightManual
      />
    </>
  );
}

function ComposePanel({
  step,
  tone,
  icon,
  title,
  hint,
  active,
  children,
}: {
  step: string;
  tone: "input" | "output";
  icon: ReactNode;
  title: string;
  hint: string;
  active?: boolean;
  children: ReactNode;
}) {
  const isOutput = tone === "output";
  const headerBg = isOutput
    ? "linear-gradient(135deg, rgba(238,246,232,0.92) 0%, rgba(185,255,75,0.1) 55%, rgba(243,241,234,0.55) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,247,240,0.78) 100%)";
  const bodyBg = isOutput ? "rgba(238,246,232,0.28)" : "rgba(255,255,255,0.42)";
  const panelBorder = isOutput ? "rgba(46,90,67,0.14)" : glass.border;

  const shell = (
    <WsGlassPanel
      className="overflow-hidden shadow-[0_24px_64px_-42px_rgba(10,10,10,0.28)]"
      borderColor={panelBorder}
    >
      <div
        className="relative border-b px-5 py-4 sm:px-6 sm:py-5"
        style={{ borderColor: glass.borderSoft, background: headerBg }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-2 text-[3.5rem] font-black leading-none tracking-[-0.06em] sm:text-[4rem]"
          style={{
            ...wsSans,
            color: isOutput ? "rgba(46,90,67,0.055)" : "rgba(10,10,10,0.04)",
          }}
        >
          {step}
        </span>
        <div className="relative flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] border"
            style={{
              borderColor: isOutput ? "rgba(46,90,67,0.16)" : glass.borderSoft,
              backgroundColor: "rgba(255,255,255,0.88)",
              color: panel.greenDark,
              boxShadow: isOutput
                ? "0 8px 24px -16px rgba(46,90,67,0.4)"
                : "0 8px 24px -16px rgba(10,10,10,0.12)",
            }}
          >
            {icon}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[17px] font-bold tracking-[-0.03em] sm:text-[18px]" style={{ ...wsSans, color: panel.text }}>
              {title}
            </p>
            <p className="mt-0.5 text-[13px] leading-[1.55]" style={{ ...wsSans, color: panel.textMuted }}>
              {hint}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 sm:space-y-5 sm:px-6 sm:py-6" style={{ backgroundColor: bodyBg }}>
        {children}
      </div>
    </WsGlassPanel>
  );

  if (active && isOutput) {
    return (
      <motion.div
        className="rounded-[1.2rem]"
        animate={{ boxShadow: ["0 0 0 1px rgba(46,90,67,0.12)", "0 0 0 2px rgba(185,255,75,0.28)", "0 0 0 1px rgba(46,90,67,0.12)"] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {shell}
      </motion.div>
    );
  }

  return shell;
}

function EmptyReplyBlock() {
  return (
    <div
      className="relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-[1rem] border border-dashed px-6 py-10 text-center"
      style={{
        borderColor: "rgba(46,90,67,0.14)",
        background:
          "linear-gradient(165deg, rgba(238,246,232,0.55) 0%, rgba(255,255,255,0.78) 100%)",
      }}
    >
      <span
        className="relative flex h-12 w-12 items-center justify-center rounded-[0.95rem] border"
        style={{
          borderColor: glass.borderSoft,
          backgroundColor: "rgba(255,255,255,0.8)",
          color: panel.greenDark,
        }}
      >
        <Reply className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="relative mt-4 text-[15px] font-semibold" style={{ ...wsSans, color: panel.text }}>
        Здесь появится ответ
      </p>
      <p className="relative mt-2 max-w-[18rem] text-[13px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
        Вставьте отзыв слева и нажмите «Сгенерировать ответ»
      </p>
    </div>
  );
}

function StarPicker({ value, onChange }: { value: StarKey; onChange: (star: StarKey) => void }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ ...wsSans, color: panel.textSubtle }}>
        Оценка покупателя
      </p>
      <div className="flex gap-1">
        {ALL_STARS.map((star) => {
          const n = Number(star);
          const filled = Number(value) >= n;
          return (
            <button
              key={star}
              type="button"
              aria-label={`${star} звёзд`}
              aria-pressed={value === star}
              onClick={() => onChange(star)}
              className="rounded-lg p-1 transition hover:scale-105 hover:bg-black/[0.03]"
            >
              <Star
                className="h-7 w-7 sm:h-8 sm:w-8"
                fill={filled ? "#F4B942" : "transparent"}
                color={filled ? "#E5A319" : "rgba(10,10,10,0.16)"}
                strokeWidth={1.5}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionChip({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[0.9rem] border px-3.5 py-2 text-[13px] font-semibold transition hover:bg-black/[0.02] disabled:opacity-45"
      style={{
        ...wsSans,
        borderColor: glass.borderSoft,
        backgroundColor: "rgba(255,255,255,0.78)",
        color: panel.text,
      }}
    >
      {children}
    </button>
  );
}
