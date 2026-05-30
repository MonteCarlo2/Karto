export type ReviewScopeMode = "all" | "new_only" | "limited";

export type AutoRepliesReviewScopeSettings = {
  mode: ReviewScopeMode;
  /** Лимит ответов при mode === "limited". */
  limit: number;
  /** С какой даты считать отзывы «новыми» при mode === "new_only" (YYYY-MM-DD). */
  newSince: string;
  /** Сколько ответов уже израсходовано из лимита. */
  limitConsumed: number;
};

export const REVIEW_LIMIT_PRESETS = [10, 15, 20, 100, 1000] as const;

export function defaultReviewScopeSettings(): AutoRepliesReviewScopeSettings {
  return {
    mode: "new_only",
    limit: 20,
    newSince: new Date().toISOString().slice(0, 10),
    limitConsumed: 0,
  };
}

export function normalizeReviewScopeSettings(
  raw: Partial<AutoRepliesReviewScopeSettings> | undefined
): AutoRepliesReviewScopeSettings {
  const defaults = defaultReviewScopeSettings();
  const mode =
    raw?.mode === "all" || raw?.mode === "new_only" || raw?.mode === "limited"
      ? raw.mode
      : defaults.mode;

  const limitRaw = typeof raw?.limit === "number" ? raw.limit : defaults.limit;
  const limit = Math.min(10_000, Math.max(1, Math.round(limitRaw)));

  const newSince =
    typeof raw?.newSince === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.newSince)
      ? raw.newSince
      : defaults.newSince;

  const limitConsumed =
    typeof raw?.limitConsumed === "number" && raw.limitConsumed >= 0
      ? Math.min(limit, Math.round(raw.limitConsumed))
      : 0;

  return { mode, limit, newSince, limitConsumed };
}

/** Демо до подключения реального API-счётчика отзывов. */
export function mockUnansweredReviewCount(
  connectionOk: boolean,
  liveCount?: number | null
): number | null {
  if (!connectionOk) return null;
  if (typeof liveCount === "number") return liveCount;
  return 47;
}

export function reviewScopeModeLabel(mode: ReviewScopeMode): string {
  switch (mode) {
    case "all":
      return "Все неотвеченные";
    case "new_only":
      return "Только новые";
    case "limited":
      return "По лимиту";
  }
}
