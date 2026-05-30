import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesReviewScopeSettings } from "./review-scope-settings";

export function isReviewDateWithinScope(
  publishedAt: string | undefined,
  scope: AutoRepliesReviewScopeSettings
): boolean {
  if (scope.mode === "all" || scope.mode === "limited") return true;
  const iso = publishedAt?.trim();
  if (!iso) return true;
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
  return day >= scope.newSince;
}

export function reviewScopeRemainingQuota(scope: AutoRepliesReviewScopeSettings): number {
  if (scope.mode !== "limited") return Number.POSITIVE_INFINITY;
  return Math.max(0, scope.limit - scope.limitConsumed);
}

/** Сортировка ленты: новые отзывы сверху. */
export function sortInboxItemsByReviewDate(items: InboxReviewItem[]): InboxReviewItem[] {
  return [...items].sort((a, b) => {
    const ta = a.reviewPublishedAt ? Date.parse(a.reviewPublishedAt) : 0;
    const tb = b.reviewPublishedAt ? Date.parse(b.reviewPublishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

/**
 * Оставляет в ленте все отправленные отзывы и только pending в рамках «Объёма ответов».
 * Режим «Все» — без фильтра pending; «Новые» — с выбранной даты; «Лимит» — N новых сверху.
 */
export function filterInboxItemsByReviewScope(
  items: InboxReviewItem[],
  scope: AutoRepliesReviewScopeSettings
): InboxReviewItem[] {
  if (scope.mode === "all") return items;

  const pendingEligible = sortInboxItemsByReviewDate(
    items.filter(
      (item) =>
        item.status === "pending" && isReviewDateWithinScope(item.reviewPublishedAt, scope)
    )
  );

  const allowedPendingIds =
    scope.mode === "limited"
      ? new Set(
          pendingEligible.slice(0, reviewScopeRemainingQuota(scope)).map((item) => item.id)
        )
      : new Set(pendingEligible.map((item) => item.id));

  return items.filter((item) => item.status === "sent" || allowedPendingIds.has(item.id));
}

/**
 * Помечает pending-отзывы вне объёма ответов как недоступные для отправки.
 * В режиме «По лимиту» первые N eligible отзывов (новые сверху) получают canSend.
 */
export function applyReviewScopeEligibility(
  items: InboxReviewItem[],
  scope: AutoRepliesReviewScopeSettings
): InboxReviewItem[] {
  const allowedIds =
    scope.mode === "limited"
      ? new Set(
          sortInboxItemsByReviewDate(
            items.filter(
              (item) =>
                item.status === "pending" &&
                isReviewDateWithinScope(item.reviewPublishedAt, scope)
            )
          )
            .slice(0, reviewScopeRemainingQuota(scope))
            .map((item) => item.id)
        )
      : null;

  return items.map((item) => {
    if (item.status !== "pending") return item;

    if (!isReviewDateWithinScope(item.reviewPublishedAt, scope)) {
      return { ...item, canSend: false };
    }

    if (scope.mode === "limited") {
      return { ...item, canSend: allowedIds!.has(item.id) };
    }

    return { ...item, canSend: true };
  });
}

/** Пояснение, почему отзыв нельзя отправить (не путать с балансом тарифа). */
export function inboxSendBlockReason(
  item: InboxReviewItem,
  scope: AutoRepliesReviewScopeSettings
): string | null {
  if (item.status !== "pending" || item.canSend !== false) return null;
  if (item.autoSendError) return item.autoSendError;

  if (scope.mode === "new_only" && !isReviewDateWithinScope(item.reviewPublishedAt, scope)) {
    return `Отзыв старше ${scope.newSince} — смените «Объём ответов» или выберите «Все»`;
  }

  if (scope.mode === "limited") {
    const remaining = reviewScopeRemainingQuota(scope);
    if (remaining <= 0) {
      return `Лимит «Объём ответов» (${scope.limit}) исчерпан — увеличьте лимит или выберите «Все»`;
    }
    return "Отзыв вне текущего лимита «Объём ответов»";
  }

  return "Обновите ленту — статус отзыва устарел";
}

export function consumeReviewScopeLimit(
  scope: AutoRepliesReviewScopeSettings,
  count = 1
): AutoRepliesReviewScopeSettings {
  if (scope.mode !== "limited" || count <= 0) return scope;
  return {
    ...scope,
    limitConsumed: Math.min(scope.limit, scope.limitConsumed + count),
  };
}

export function maxAutoSendsForReviewScope(
  scope: AutoRepliesReviewScopeSettings,
  defaultMax = 3
): number {
  if (scope.mode !== "limited") return defaultMax;
  return Math.min(defaultMax, reviewScopeRemainingQuota(scope));
}
