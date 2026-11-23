"use client";

import { CheckCircle2 } from "lucide-react";
import {
  inboxFeedTabLabels,
  type InboxFeedTab,
  type InboxReviewItem,
} from "@/lib/auto-replies/inbox-demo-data";
import {
  type InboxFeedFilters,
  isInboxFeedFilterActive,
} from "@/lib/auto-replies/inbox-feed-filters";
import { formatInboxBuyerName } from "@/lib/auto-replies/marketplace-product-image";
import type { AutoRepliesReviewScopeSettings } from "@/lib/auto-replies/review-scope-settings";
import { inboxSendBlockReason } from "@/lib/auto-replies/inbox-review-scope";
import { AUTO_REPLIES_MARKETPLACE_UI } from "@/lib/auto-replies/workspace-prefs";
import { InboxProductThumb, InboxStarRow } from "./workspace-inbox-visuals";
import { InboxFeedToolbar } from "./inbox-feed-toolbar";
import { panel, wsSans } from "./settings-ui";
import { inboxTheme } from "./inbox-theme";

const FEED_THUMB_SIZE = 76;

const feedListUi = {
  activeBg: "rgba(10, 10, 10, 0.05)",
  activeBar: "#1A1A1A",
  sentBadgeBg: "rgba(185, 255, 75, 0.34)",
  meta: panel.textSubtle,
} as const;

function marketplaceFeedLabel(id: InboxReviewItem["marketplaceId"]) {
  return AUTO_REPLIES_MARKETPLACE_UI.find((entry) => entry.id === id)?.title ?? "Marketplace";
}

function InboxFeedListItem({
  item,
  active,
  tab,
  onSelect,
  reviewScope,
}: {
  item: InboxReviewItem;
  active: boolean;
  tab: InboxFeedTab;
  onSelect: () => void;
  reviewScope: AutoRepliesReviewScopeSettings;
}) {
  const buyer = formatInboxBuyerName(item);
  const mp = marketplaceFeedLabel(item.marketplaceId);
  const isSent = item.status === "sent";
  const sendBlockReason = inboxSendBlockReason(item, reviewScope);
  const isSending =
    item.feed === "auto" &&
    item.status === "pending" &&
    item.canSend !== false &&
    !item.autoSendError;
  const isSendBlocked =
    item.feed === "auto" &&
    item.status === "pending" &&
    (item.canSend === false || Boolean(item.autoSendError));
  const sentBadgeLabel = isSending
    ? "Отправляется…"
    : isSendBlocked
      ? sendBlockReason?.includes("Обновите ленту")
        ? "Устарел"
        : "Не в очереди"
      : tab === "auto" || item.autoSent
        ? "Отправлено автоматически"
        : "Подтверждено";

  return (
    <li className="border-b" style={{ borderColor: inboxTheme.listDivider }}>
      <button
        type="button"
        onClick={onSelect}
        className="relative w-full rounded-xl px-2 py-3 text-left transition-colors sm:px-2.5 sm:py-3.5"
        style={{
          backgroundColor: active ? feedListUi.activeBg : "transparent",
        }}
      >
        {active ? (
          <span
            aria-hidden
            className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-sm"
            style={{ backgroundColor: feedListUi.activeBar }}
          />
        ) : null}

        <span
          className="absolute right-2.5 top-3 z-[1] max-w-[46%] text-right text-[11px] font-medium leading-[1.3] tracking-[-0.01em] sm:right-3 sm:top-3.5 sm:max-w-[11rem] sm:text-[12px]"
          style={{ ...wsSans, color: panel.textMuted }}
        >
          {item.listDateLabel}
        </span>

        <div className="flex gap-3.5 pl-1 pr-[5.5rem] sm:pr-24">
          <InboxProductThumb
            nmId={item.nmId}
            marketplaceId={item.marketplaceId}
            imageUrl={item.productImageUrl}
            alt={item.productName}
            size={FEED_THUMB_SIZE}
            rounded="0.65rem"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-none" style={{ ...wsSans, color: feedListUi.meta }}>
              <span className="font-medium" style={{ color: panel.textMuted }}>
                {mp}
              </span>
              <span className="opacity-70"> · </span>
              <span>{item.timeLabel}</span>
            </p>

            <p
              className="mt-2 line-clamp-2 text-[15px] font-semibold leading-[1.32] tracking-[-0.02em] sm:text-[16px]"
              style={{ ...wsSans, color: panel.text }}
            >
              {item.productName}
            </p>

            <p className="mt-1 line-clamp-1 text-[12px]" style={{ ...wsSans, color: panel.textMuted }}>
              {buyer}
            </p>

            {isSent || isSending ? (
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{
                  ...wsSans,
                  borderColor: "rgba(46,90,67,0.2)",
                  backgroundColor: feedListUi.sentBadgeBg,
                  color: panel.greenDark,
                }}
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.2} />
                {sentBadgeLabel}
              </span>
            ) : null}

            <div className="mt-2">
              <InboxStarRow value={Number(item.starRating)} size="sm" />
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

type WorkspaceInboxFeedProps = {
  tab: InboxFeedTab;
  onTabChange: (tab: InboxFeedTab) => void;
  items: InboxReviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  semiPendingCount: number;
  semiSentCount?: number;
  autoSentCount?: number;
  autoPendingCount?: number;
  shopTitle: string;
  filters: InboxFeedFilters;
  onFiltersChange: (next: InboxFeedFilters) => void;
  onFiltersReset: () => void;
  loading?: boolean;
  totalItemCount?: number;
  liveMode?: boolean;
  alertMessage?: string | null;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  reviewScope: AutoRepliesReviewScopeSettings;
};

export function WorkspaceInboxFeed({
  tab,
  onTabChange,
  items,
  selectedId,
  onSelect,
  semiPendingCount,
  semiSentCount = 0,
  autoSentCount = 0,
  autoPendingCount = 0,
  shopTitle,
  filters,
  onFiltersChange,
  onFiltersReset,
  loading = false,
  totalItemCount = 0,
  liveMode = false,
  alertMessage = null,
  onRefresh,
  refreshDisabled = false,
  reviewScope,
}: WorkspaceInboxFeedProps) {
  const tabLabels = inboxFeedTabLabels(semiPendingCount);
  const filtersActive = isInboxFeedFilterActive(filters);

  const statusLine =
    tab === "semi" ? (
      semiPendingCount > 0
        ? `Требуют ответа · ${semiPendingCount}`
        : semiSentCount > 0
          ? `Все подтверждены · отправлено вами · ${semiSentCount}`
          : "Все отзывы подтверждены"
    ) : autoPendingCount > 0 ? (
      `Отправляем автоответы · ${autoPendingCount}`
    ) : autoSentCount > 0 ? (
      `Автоматически отправлено · ${autoSentCount}`
    ) : (
      "Здесь появятся ответы, отправленные без подтверждения"
    );

  return (
    <aside
      className="flex h-full w-full shrink-0 flex-col overflow-hidden lg:w-[min(500px,36vw)] xl:w-[520px]"
      style={{ backgroundColor: inboxTheme.canvas }}
    >
      <InboxFeedToolbar
        shopTitle={shopTitle}
        tab={tab}
        tabOptions={[
          { value: "semi", label: tabLabels.semi },
          { value: "auto", label: tabLabels.auto },
        ]}
        onTabChange={onTabChange}
        filters={filters}
        onFiltersChange={onFiltersChange}
        filtersActive={filtersActive}
        onFiltersReset={onFiltersReset}
        statusLine={statusLine}
        onRefresh={onRefresh}
        refreshDisabled={refreshDisabled || loading}
      />

      {alertMessage ? (
        <div
          className="mx-3 mb-2 rounded-[0.85rem] border px-3.5 py-3 text-[12px] leading-[1.6] sm:mx-4 sm:text-[13px]"
          style={{
            ...wsSans,
            borderColor: "rgba(180,130,40,0.25)",
            backgroundColor: "rgba(255,248,230,0.85)",
            color: "#5a420f",
          }}
        >
          {alertMessage}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 sm:px-2">
        {loading && totalItemCount === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center px-2 text-center">
            <p className="text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
              Загружаем отзывы…
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center px-2 text-center">
            <p className="text-[13px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
              {filtersActive
                ? "Нет отзывов по выбранным фильтрам"
                : tab === "semi"
                  ? liveMode
                    ? "Нет отзывов на подтверждение"
                    : "Новых отзывов на подтверждение пока нет"
                  : liveMode
                    ? "Авто-журнал пуст"
                    : "Здесь будет история автоответов"}
            </p>
          </div>
        ) : (
          <ul>
            {items.map((item) => (
              <InboxFeedListItem
                key={item.id}
                item={item}
                active={item.id === selectedId}
                tab={tab}
                reviewScope={reviewScope}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
