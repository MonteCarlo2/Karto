export const REPLY_REGENERATE_LIMIT = 5;

const STORAGE_PREFIX = "karto-regen-count:";

export function remainingRegenerations(used: number): number {
  return Math.max(0, REPLY_REGENERATE_LIMIT - used);
}

export function canRegenerateReply(used: number): boolean {
  return used < REPLY_REGENERATE_LIMIT;
}

export function readRegenerateCountForItem(itemId: string): number {
  if (typeof window === "undefined" || !itemId) return 0;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${itemId}`);
    const n = Number.parseInt(raw ?? "0", 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, REPLY_REGENERATE_LIMIT);
  } catch {
    return 0;
  }
}

export function writeRegenerateCountForItem(itemId: string, used: number): void {
  if (typeof window === "undefined" || !itemId) return;
  try {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${itemId}`,
      String(Math.max(0, Math.min(used, REPLY_REGENERATE_LIMIT)))
    );
  } catch {
    /* noop */
  }
}
