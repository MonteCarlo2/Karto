"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CornerDownRight, RefreshCw, CheckCircle2 } from "lucide-react";
import type { InboxReviewItem } from "@/lib/auto-replies/inbox-demo-data";
import { formatInboxBuyerName } from "@/lib/auto-replies/marketplace-product-image";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesShopSettings,
} from "@/lib/auto-replies/settings-types";
import { finalizeReplyText, prepareReplyForMarketplaceSend } from "@/lib/auto-replies/reply-postprocess";
import { resolveInboxDisplayReplyDraft } from "@/lib/auto-replies/empty-review-settings";
import { inboxSendBlockReason } from "@/lib/auto-replies/inbox-review-scope";
import {
  canRegenerateReply,
  REPLY_REGENERATE_LIMIT,
  readRegenerateCountForItem,
  remainingRegenerations,
  writeRegenerateCountForItem,
} from "@/lib/auto-replies/reply-regenerate-limit";
import { AUTO_REPLIES_MARKETPLACE_UI } from "@/lib/auto-replies/workspace-prefs";
import { autoRepliesAuthorizedFetch } from "@/components/auto-replies/auto-replies-entry-link";
import { AUTO_REPLY_INSUFFICIENT_BALANCE_MSG } from "@/lib/auto-replies-balance";
import {
  InboxActionChip,
  InboxLabeledRow,
  InboxProductHero,
  InboxReviewPhotos,
  InboxStarRow,
} from "./workspace-inbox-visuals";
import { WsInboxSendButton } from "./workspace-shiny-buttons";
import { GenerationLoader } from "./manual-compose-visuals";
import { panel, wsComposeText, wsSans } from "./settings-ui";
import { inboxTheme } from "./inbox-theme";

type WorkspaceInboxDetailProps = {
  item: InboxReviewItem;
  shopId: string;
  usage: AutoRepliesUsageId;
  shopSettings: AutoRepliesShopSettings;
  mpSettings: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  onUpdateDraft: (id: string, draft: string) => void;
  onPublish?: (replyText: string) => Promise<void>;
  onReplyBalanceChange?: () => void | Promise<void>;
};

function marketplaceTitle(id: InboxReviewItem["marketplaceId"]) {
  return AUTO_REPLIES_MARKETPLACE_UI.find((entry) => entry.id === id)?.title ?? id;
}

export function WorkspaceInboxDetail({
  item,
  shopId,
  usage: _usage,
  shopSettings,
  mpSettings,
  brandName,
  onUpdateDraft,
  onPublish,
  onReplyBalanceChange,
}: WorkspaceInboxDetailProps) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(item.replyDraft);
  const [revisionHint, setRevisionHint] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [regenerateCount, setRegenerateCount] = useState(() => readRegenerateCountForItem(item.id));
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const maxReplyLength =
    item.marketplaceId === "ozon" ? 2000 : item.marketplaceId === "yandex" ? 4096 : 5000;

  const displayDraft = useMemo(
    () => resolveInboxDisplayReplyDraft(item, shopSettings),
    [item, shopSettings]
  );

  useEffect(() => {
    setDraft(displayDraft);
    setEditMode(false);
    setRevisionHint("");
    setRegenerating(false);
    setRegenerateError(null);
    setRegenerateCount(readRegenerateCountForItem(item.id));
    setPublishing(false);
    setPublishError(null);
  }, [item.id, displayDraft]);

  const isReadOnly = item.status === "sent" || item.feed === "auto";
  const isAutoJournalEntry = item.status === "sent" && item.autoSent === true;
  const sendBlockReason = inboxSendBlockReason(item, mpSettings.reviewScope);
  const isAutoSending =
    item.feed === "auto" && item.status === "pending" && item.canSend !== false && !item.autoSendError;
  const isAutoSendBlocked =
    item.feed === "auto" && item.status === "pending" && (item.canSend === false || Boolean(item.autoSendError));
  const isConfirmed = item.status === "sent";
  const canEditDraft = !isReadOnly && item.feed === "semi";
  const canSend = item.status === "pending" && item.canSend !== false && item.feed === "semi";
  const sendSoon = item.status === "pending" && item.canSend === false && item.feed === "semi";
  const canPublish = canSend && Boolean(onPublish) && draft.trim().length >= 2;
  const buyerName = formatInboxBuyerName(item);

  const syncDraft = useCallback(
    (next: string) => {
      setDraft(next);
      onUpdateDraft(item.id, next);
    },
    [item.id, onUpdateDraft]
  );

  const syncDraftToTelegram = useCallback(
    async (next: string, source: "web_edit" | "web_regen") => {
      if (item.status !== "pending" || item.feed !== "semi" || next.trim().length < 2) return;
      try {
        await autoRepliesAuthorizedFetch("/api/telegram/sync-review", {
          method: "POST",
          body: JSON.stringify({
            shopId,
            marketplaceId: item.marketplaceId,
            reviewId: item.id,
            replyDraft: next.trim(),
            source,
          }),
          timeoutMs: 20_000,
        });
      } catch {
        /* карточки в TG может не быть — не мешаем работе на сайте */
      }
    },
    [item.feed, item.id, item.marketplaceId, item.status, shopId]
  );

  const regenerationsLeft = remainingRegenerations(regenerateCount);
  const regenerateBlocked = !canRegenerateReply(regenerateCount);
  const hasDraft = draft.trim().length >= 2 || item.replyDraft.trim().length >= 2;

  const runRegenerate = useCallback(async () => {
    const hint = revisionHint.trim();
    const previous = draft.trim() || item.replyDraft.trim();
    const isFirstGenerate = previous.length < 2;

    if (!isFirstGenerate && !canRegenerateReply(regenerateCount)) {
      setRegenerateError(`Лимит перегенераций (${REPLY_REGENERATE_LIMIT}) исчерпан для этого отзыва.`);
      return;
    }

    setRegenerating(true);
    setEditMode(false);
    setRegenerateError(null);

    const usedBefore = regenerateCount;
    const usedNext = isFirstGenerate ? usedBefore : usedBefore + 1;
    if (!isFirstGenerate) {
      setRegenerateCount(usedNext);
      writeRegenerateCountForItem(item.id, usedNext);
    }

    const payload = {
      reviewText: item.reviewText,
      starRating: item.starRating,
      shop: shopSettings,
      mp: mpSettings,
      brandName,
      buyerName: item.buyerName ?? buyerName,
      productName: item.productName,
      hasReviewPhotos: (item.reviewPhotoUrls?.length ?? 0) > 0,
      revisionHint: isFirstGenerate ? null : hint || null,
      previousReply: isFirstGenerate ? null : previous,
    };

    try {
      const res = await autoRepliesAuthorizedFetch("/api/auto-replies/generate-reply", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { reply?: string; error?: string; code?: string };
      if (res.status === 402 || data.code === "insufficient_balance") {
        if (!isFirstGenerate) {
          setRegenerateCount(usedBefore);
          writeRegenerateCountForItem(item.id, usedBefore);
        }
        setRegenerateError(data.error || AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);
        return;
      }
      if (!res.ok || !data.reply) {
        throw new Error(data.error || (isFirstGenerate ? "Не удалось сгенерировать ответ" : "Не удалось перегенерировать ответ"));
      }
      syncDraft(data.reply);
      void syncDraftToTelegram(data.reply, "web_regen");
      void onReplyBalanceChange?.();
      if (hint) setRevisionHint("");
    } catch (e) {
      if (!isFirstGenerate) {
        setRegenerateCount(usedBefore);
        writeRegenerateCountForItem(item.id, usedBefore);
      }
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("балансе закончились") || msg.includes("Недостаточно ответов") || msg.includes("тариф")) {
        setRegenerateError(msg || AUTO_REPLY_INSUFFICIENT_BALANCE_MSG);
        return;
      }
      setRegenerateError(
        e instanceof Error
          ? e.message
          : isFirstGenerate
            ? "Не удалось сгенерировать ответ"
            : "Не удалось перегенерировать ответ"
      );
    } finally {
      setRegenerating(false);
    }
  }, [
    brandName,
    buyerName,
    draft,
    item.id,
    item.reviewPhotoUrls,
    item.reviewText,
    item.starRating,
    mpSettings,
    revisionHint,
    regenerateCount,
    shopSettings,
    syncDraft,
    syncDraftToTelegram,
    onReplyBalanceChange,
  ]);

  const handlePublish = useCallback(async () => {
    if (!onPublish || publishing) return;

    const text = prepareReplyForMarketplaceSend(draft, shopSettings);
    if (text.length < 2) {
      setPublishError("Текст ответа слишком короткий — минимум 2 символа");
      return;
    }
    if (text.length > maxReplyLength) {
      setPublishError(`Текст ответа не должен превышать ${maxReplyLength} символов`);
      return;
    }

    setPublishing(true);
    setPublishError(null);
    syncDraft(text);

    try {
      await onPublish(text);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Не удалось опубликовать ответ");
    } finally {
      setPublishing(false);
    }
  }, [draft, item.marketplaceId, maxReplyLength, onPublish, publishing, shopSettings, syncDraft]);

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{ backgroundColor: inboxTheme.canvas }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
        <InboxProductHero
          productName={item.productName}
          productArticle={item.productArticle}
          shopName={brandName?.trim() || item.shopName}
          marketplaceLabel={marketplaceTitle(item.marketplaceId)}
          imageUrl={item.productImageUrl}
          nmId={item.nmId}
          marketplaceId={item.marketplaceId}
        />

        <section className="mt-6">
          <div className="mb-3.5 flex items-baseline justify-between gap-3">
            <h3
              className="text-[17px] font-semibold tracking-[-0.02em] sm:text-[18px]"
              style={{ ...wsSans, color: panel.text }}
            >
              Отзыв на товар
            </h3>
            <span
              className="shrink-0 text-[13px] tabular-nums sm:text-[14px]"
              style={{ ...wsSans, color: panel.textSubtle }}
            >
              {item.dateLabel}
            </span>
          </div>
          <div className="space-y-3 sm:space-y-3.5">
            <InboxLabeledRow label="Имя:" variant="detail">
              {buyerName}
            </InboxLabeledRow>
            <InboxLabeledRow label="Оценка:" variant="detail">
              <InboxStarRow value={Number(item.starRating)} size="lg" />
            </InboxLabeledRow>
            <InboxLabeledRow label="Отзыв:" variant="detail">
              <span className="text-[15px] leading-[1.6] sm:text-[16px]" style={{ ...wsComposeText }}>
                {item.reviewText}
              </span>
              <InboxReviewPhotos urls={item.reviewPhotoUrls} />
            </InboxLabeledRow>
          </div>
        </section>

        <section className="mt-5">
          <div
            className="rounded-xl px-4 py-4 sm:px-5"
            style={{
              backgroundColor: isConfirmed ? "rgba(255,255,255,0.72)" : inboxTheme.aiBlockBg,
              border: isConfirmed
                ? "1.5px solid rgba(46, 90, 67, 0.28)"
                : `1px solid ${inboxTheme.aiBlockBorder}`,
              boxShadow: isConfirmed
                ? "inset 0 0 0 1px rgba(185,255,75,0.22), 0 8px 24px -18px rgba(46,90,67,0.2)"
                : `inset 0 1px 0 ${inboxTheme.aiBlockRing}`,
            }}
          >
            {isConfirmed ? (
              <div
                className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{
                  ...wsSans,
                  borderColor: "rgba(46,90,67,0.22)",
                  backgroundColor: "rgba(185,255,75,0.34)",
                  color: panel.greenDark,
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                {isAutoJournalEntry ? "Ответ отправлен автоматически" : "Ответ отправлен"}
              </div>
            ) : isAutoSendBlocked ? (
              <div
                className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{
                  ...wsSans,
                  borderColor: "rgba(180,80,40,0.22)",
                  backgroundColor: "rgba(255,200,120,0.22)",
                  color: "#8a4a1a",
                }}
              >
                {sendBlockReason ?? "Отправка недоступна"}
              </div>
            ) : isAutoSending ? (
              <div
                className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{
                  ...wsSans,
                  borderColor: "rgba(46,90,67,0.18)",
                  backgroundColor: "rgba(185,255,75,0.18)",
                  color: panel.greenDark,
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" strokeWidth={2.2} />
                Отправляется автоматически
              </div>
            ) : null}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CornerDownRight
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={2.1}
                  style={{ color: inboxTheme.action }}
                />
                <h3 className="text-[15px] font-semibold" style={{ ...wsSans, color: panel.text }}>
                  Ответ на отзыв
                </h3>
              </div>
              {canEditDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    if (editMode) {
                      syncDraft(draft);
                      void syncDraftToTelegram(draft, "web_edit");
                      setEditMode(false);
                    } else {
                      setEditMode(true);
                    }
                  }}
                  className="text-[12px] font-semibold transition hover:underline"
                  style={{ ...wsSans, color: inboxTheme.action }}
                >
                  {editMode ? "Готово" : "Редактировать"}
                </button>
              ) : null}
            </div>

            {regenerating ? (
              <GenerationLoader />
            ) : editMode && canEditDraft ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                className="min-h-[96px] w-full resize-y rounded-lg border bg-white px-3.5 py-3 text-[15px] leading-[1.6] outline-none focus:ring-2 focus:ring-[rgba(46,90,67,0.18)] sm:text-[16px]"
                style={{ ...wsComposeText, borderColor: "rgba(46,90,67,0.22)", color: panel.text }}
              />
            ) : (
              <p
                className="whitespace-pre-wrap text-[15px] leading-[1.6] sm:text-[16px]"
                style={{ ...wsComposeText, color: panel.text }}
              >
                {draft}
              </p>
            )}

            {canEditDraft && !regenerating ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InboxActionChip
                    onClick={() => void runRegenerate()}
                    disabled={regenerating || (hasDraft && regenerateBlocked)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {!hasDraft
                      ? "Сгенерировать ответ"
                      : regenerateBlocked
                        ? "Лимит перегенераций"
                        : `Перегенерировать · осталось ${regenerationsLeft}`}
                  </InboxActionChip>
                </div>
                {hasDraft ? (
                  <input
                    type="text"
                    value={revisionHint}
                    onChange={(e) => {
                      setRevisionHint(e.target.value);
                      if (regenerateError) setRegenerateError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!regenerateBlocked) void runRegenerate();
                      }
                    }}
                    placeholder="Уточнение для перегенерации — Enter для запуска"
                    className="mt-2 w-full rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[rgba(46,90,67,0.14)]"
                    style={{ ...wsSans, color: panel.text }}
                  />
                ) : null}
                {regenerateError ? (
                  <p className="mt-2 text-[12px] font-medium text-[#9b2c2c]">{regenerateError}</p>
                ) : null}
              </>
            ) : null}

            {isReadOnly && item.sentAtLabel ? (
              <p className="mt-2 text-[12px] font-medium" style={{ ...wsSans, color: panel.greenDark }}>
                {item.sentAtLabel}
              </p>
            ) : null}
          </div>
        </section>

        {sendSoon ? (
          <p className="mt-7 text-[13px] font-medium" style={{ ...wsSans, color: panel.textMuted }}>
            {item.marketplaceId === "ozon"
              ? "Ozon не позволяет ответить на отзыв без текста, фото или видео"
              : "Отправка в кабинет маркетплейса скоро будет доступна"}
          </p>
        ) : null}
      </div>

      {canPublish ? (
        <div
          className="flex shrink-0 justify-end px-6 py-4 sm:px-8 sm:py-5"
          style={{ backgroundColor: inboxTheme.canvas }}
        >
          <div className="flex flex-col items-end gap-1.5">
            <WsInboxSendButton
              loading={publishing}
              disabled={publishing || regenerating}
              onClick={() => void handlePublish()}
            />
            {publishError ? (
              <p className="max-w-[16rem] text-right text-[11px] font-medium leading-snug text-[#9b2c2c]">
                {publishError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
