import { wildberriesTokenKey } from "./server-cache";

/** Лимиты категории «Отзывы и вопросы» (Personal/Service): 3 req/s, интервал 333 ms, burst 6. */
const FEEDBACKS_BURST = 6;
const FEEDBACKS_INTERVAL_MS = 333;

type SlotKind = "read" | "write";

type TokenBucket = {
  tokens: number;
  lastAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, TokenBucket>();
const chains = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bucketKey(token: string, kind: SlotKind): string {
  return `${wildberriesTokenKey(token)}:${kind}`;
}

function bucketFor(key: string): TokenBucket {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: TokenBucket = { tokens: FEEDBACKS_BURST, lastAt: 0, blockedUntil: 0 };
  buckets.set(key, created);
  return created;
}

async function acquireSlot(token: string, kind: SlotKind): Promise<void> {
  const chainKey = bucketKey(token, kind);
  const prev = chains.get(chainKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  chains.set(
    chainKey,
    prev.then(() => gate)
  );
  await prev;

  try {
    const bucket = bucketFor(chainKey);
    const now = Date.now();

    if (bucket.blockedUntil > now) {
      await sleep(bucket.blockedUntil - now);
    }

    if (bucket.lastAt > 0) {
      const refillMs = now - bucket.lastAt;
      bucket.tokens = Math.min(FEEDBACKS_BURST, bucket.tokens + refillMs / FEEDBACKS_INTERVAL_MS);
    }

    if (bucket.tokens < 1) {
      const waitMs = Math.ceil((1 - bucket.tokens) * FEEDBACKS_INTERVAL_MS);
      await sleep(waitMs);
      bucket.tokens = 0;
    } else {
      bucket.tokens -= 1;
    }

    bucket.lastAt = Date.now();
  } finally {
    release();
  }
}

function penalizeSlot(token: string, kind: SlotKind, retryAfterSec?: number) {
  const bucket = bucketFor(bucketKey(token, kind));
  const sec =
    retryAfterSec && retryAfterSec > 0 ? Math.min(120, retryAfterSec) : FEEDBACKS_INTERVAL_MS / 1000;
  bucket.blockedUntil = Date.now() + sec * 1000;
  bucket.tokens = 0;
}

function clearPenalty(token: string, kind: SlotKind) {
  const bucket = buckets.get(bucketKey(token, kind));
  if (!bucket) return;
  bucket.blockedUntil = 0;
}

/** Чтение отзывов: GET list / count — отдельный bucket, не блокирует отправку ответа. */
export async function acquireWildberriesFeedbackReadSlot(token: string): Promise<void> {
  return acquireSlot(token, "read");
}

/** Отправка ответа: POST answer — отдельный bucket. */
export async function acquireWildberriesFeedbackWriteSlot(token: string): Promise<void> {
  return acquireSlot(token, "write");
}

/** @deprecated Используйте read/write слоты по типу операции. */
export async function acquireWildberriesFeedbackSlot(token: string): Promise<void> {
  return acquireWildberriesFeedbackReadSlot(token);
}

export function penalizeWildberriesFeedbackReadSlot(token: string, retryAfterSec?: number) {
  penalizeSlot(token, "read", retryAfterSec);
}

export function penalizeWildberriesFeedbackWriteSlot(token: string, retryAfterSec?: number) {
  penalizeSlot(token, "write", retryAfterSec);
}

/** @deprecated */
export function penalizeWildberriesFeedbackSlot(token: string, retryAfterSec?: number) {
  penalizeWildberriesFeedbackReadSlot(token, retryAfterSec);
}

export function clearWildberriesFeedbackReadPenalty(token: string) {
  clearPenalty(token, "read");
}

export function clearWildberriesFeedbackWritePenalty(token: string) {
  clearPenalty(token, "write");
}

/** @deprecated */
export function clearWildberriesFeedbackPenalty(token: string) {
  clearWildberriesFeedbackReadPenalty(token);
}
