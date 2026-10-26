import type { SellerFeedbacksSnapshot } from "./types";

const MIN_GAP_MS = 60 * 60 * 1000;

/** Не чаще раза в час на клиента; при forbidden/rate_limited не долбим. */
export function feedbacksNeedsReload(
  feedbacks: SellerFeedbacksSnapshot | null | undefined,
  syncedAt: string | null | undefined,
): boolean {
  if (!feedbacks) return true;
  if (feedbacks.status === "forbidden") return false;
  if (feedbacks.status === "rate_limited") {
    const loaded = Date.parse(feedbacks.loadedAt);
    if (Number.isFinite(loaded) && Date.now() - loaded < MIN_GAP_MS) return false;
  }
  const loaded = Date.parse(feedbacks.loadedAt);
  if (Number.isFinite(loaded) && Date.now() - loaded < MIN_GAP_MS) return false;
  if (syncedAt) {
    const sync = Date.parse(syncedAt);
    if (Number.isFinite(sync) && Number.isFinite(loaded) && loaded >= sync) return false;
  }
  return true;
}
