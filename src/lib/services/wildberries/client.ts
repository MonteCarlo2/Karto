import type {
  WbApiEnvelope,
  WbFeedbacksListData,
  WbSellerInfo,
  WbUnansweredCountData,
  WbVerifyResult,
} from "./types";
import { describeWildberriesTokenMeta } from "./token-meta";
import { prepareReplyTextForMarketplace } from "@/lib/auto-replies/reply-postprocess";
import {
  acquireWildberriesFeedbackReadSlot,
  acquireWildberriesFeedbackWriteSlot,
  clearWildberriesFeedbackReadPenalty,
  penalizeWildberriesFeedbackReadSlot,
  penalizeWildberriesFeedbackWriteSlot,
} from "./rate-limiter";

const FEEDBACKS_BASE = "https://feedbacks-api.wildberries.ru";
const COMMON_BASE = "https://common-api.wildberries.ru";
const WB_REQUEST_TIMEOUT_MS = 15_000;
const WB_429_MAX_RETRIES = 2;

export class WildberriesApiError extends Error {
  status: number;
  wbErrorText?: string;
  retryAfterSec?: number;

  constructor(message: string, status: number, wbErrorText?: string, retryAfterSec?: number) {
    super(message);
    this.name = "WildberriesApiError";
    this.status = status;
    this.wbErrorText = wbErrorText;
    this.retryAfterSec = retryAfterSec;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

function parseWbRetryAfterSec(res: Response): number | undefined {
  const raw =
    res.headers.get("x-ratelimit-retry") ??
    res.headers.get("X-Ratelimit-Retry") ??
    res.headers.get("retry-after");
  if (!raw) return undefined;
  const sec = Number.parseInt(raw, 10);
  return Number.isFinite(sec) && sec > 0 ? Math.min(60, sec) : undefined;
}

function friendlyWbStatusMessage(status: number, wbErrorText?: string): string {
  if (status === 429) {
    return "Wildberries временно ограничил запросы. Повтор через несколько секунд.";
  }
  if (status === 401) {
    return "Токен не принят Wildberries. Проверьте, что у токена есть доступ к «Отзывы и вопросы».";
  }
  if (status === 403) {
    return "Недостаточно прав у API-токена для работы с отзывами.";
  }
  return wbErrorText || `Wildberries API вернул ${status}`;
}

async function wbRequestOnce<T>(
  token: string,
  baseUrl: string,
  path: string,
  authorization: string,
  init?: RequestInit
): Promise<T> {
  await acquireWildberriesFeedbackReadSlot(token);

  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WB_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError(
        "Wildberries не ответил вовремя. Попробуйте через минуту.",
        504
      );
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries",
      502
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let payload: WbApiEnvelope<T> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as WbApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const wbErrorText = payload?.errorText?.trim();
    const retryAfterSec = res.status === 429 ? parseWbRetryAfterSec(res) : undefined;
    if (res.status === 429) {
      penalizeWildberriesFeedbackReadSlot(token, retryAfterSec);
    }
    throw new WildberriesApiError(
      friendlyWbStatusMessage(res.status, wbErrorText),
      res.status,
      wbErrorText,
      retryAfterSec
    );
  }

  clearWildberriesFeedbackReadPenalty(token);

  if (payload?.error) {
    throw new WildberriesApiError(
      payload.errorText?.trim() || "Wildberries API вернул ошибку",
      502,
      payload.errorText
    );
  }

  if (!payload || payload.data === undefined) {
    throw new WildberriesApiError("Пустой ответ Wildberries API", 502);
  }

  return payload.data;
}

async function wbRequest<T>(
  token: string,
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const normalized = normalizeToken(token);
  const authVariants = [`Bearer ${normalized}`, normalized];
  let lastError: WildberriesApiError | null = null;

  for (let attempt = 0; attempt <= WB_429_MAX_RETRIES; attempt += 1) {
    for (const authorization of authVariants) {
      try {
        return await wbRequestOnce<T>(normalized, baseUrl, path, authorization, init);
      } catch (e) {
        if (!(e instanceof WildberriesApiError)) throw e;
        if (e.status === 401) {
          lastError = e;
          continue;
        }
        if (e.status === 429 && attempt < WB_429_MAX_RETRIES) {
          const waitSec = e.retryAfterSec && e.retryAfterSec > 0 ? e.retryAfterSec : 1;
          await sleep(waitSec * 1000);
          break;
        }
        throw e;
      }
    }
  }

  throw lastError ?? new WildberriesApiError("Токен не принят Wildberries", 401);
}

export async function verifyWildberriesToken(
  token: string,
  options?: { sellerNameHint?: string | null }
): Promise<WbVerifyResult> {
  const unanswered = await wbRequest<WbUnansweredCountData>(
    token,
    FEEDBACKS_BASE,
    "/api/v1/feedbacks/count-unanswered"
  );

  const sellerName = options?.sellerNameHint?.trim() || "Продавец Wildberries";
  const tokenMeta = describeWildberriesTokenMeta(token);

  return {
    ok: true,
    sellerName,
    unansweredCount: unanswered.countUnanswered ?? 0,
    unansweredToday: unanswered.countUnansweredToday ?? 0,
    tokenType: tokenMeta.type,
    tokenTypeLabel: tokenMeta.label,
    tokenRateLimitHint: tokenMeta.rateLimitHint,
    tokenWarning: tokenMeta.warning,
  };
}

/** Опционально: имя продавца отдельным запросом (не вызывать при verify). */
export async function fetchWildberriesSellerName(token: string): Promise<string | null> {
  try {
    const seller = await wbRequest<WbSellerInfo>(token, COMMON_BASE, "/api/v1/seller-info");
    return seller.tradeMark?.trim() || seller.name?.trim() || null;
  } catch {
    return null;
  }
}

export type FetchWildberriesFeedbacksParams = {
  token: string;
  isAnswered: boolean;
  take?: number;
  skip?: number;
  order?: "dateDesc" | "dateAsc";
};

export async function fetchWildberriesFeedbacks({
  token,
  isAnswered,
  take = 50,
  skip = 0,
  order = "dateDesc",
}: FetchWildberriesFeedbacksParams): Promise<WbFeedbacksListData> {
  const params = new URLSearchParams({
    isAnswered: String(isAnswered),
    take: String(Math.min(5000, Math.max(1, take))),
    skip: String(Math.max(0, skip)),
    order,
  });

  return wbRequest<WbFeedbacksListData>(
    token,
    FEEDBACKS_BASE,
    `/api/v1/feedbacks?${params.toString()}`
  );
}

const WB_MAX_SKIP = 5000;
const WB_MAX_PAGES = 50;

async function fetchAllWildberriesFeedbacksPaginated(
  token: string,
  isAnswered: boolean,
  takePerPage = 100,
  opts?: { startSkip?: number; maxPages?: number }
): Promise<WbFeedbacksListData & { nextSkip: number; complete: boolean }> {
  const take = Math.min(100, Math.max(1, takePerPage));
  const startSkip = Math.max(0, opts?.startSkip ?? 0);
  const pageLimit = Math.min(WB_MAX_PAGES, Math.max(1, opts?.maxPages ?? WB_MAX_PAGES));
  const byId = new Map<string, NonNullable<WbFeedbacksListData["feedbacks"]>[number]>();
  let skip = startSkip;
  let pages = 0;
  let countUnanswered: number | undefined;
  let countArchive: number | undefined;
  let complete = false;

  while (skip < WB_MAX_SKIP && pages < pageLimit) {
    try {
      const page = await fetchWildberriesFeedbacks({
        token,
        isAnswered,
        take,
        skip,
        order: "dateDesc",
      });
      if (typeof page.countUnanswered === "number") countUnanswered = page.countUnanswered;
      if (typeof page.countArchive === "number") countArchive = page.countArchive;

      const batch = page.feedbacks ?? [];
      if (batch.length === 0) {
        complete = true;
        break;
      }

      const sizeBefore = byId.size;
      for (const feedback of batch) {
        if (feedback?.id) byId.set(feedback.id, feedback);
      }
      if (byId.size === sizeBefore) {
        complete = true;
        break;
      }

      skip += batch.length;
      pages += 1;
      if (batch.length < take) {
        complete = true;
        break;
      }
    } catch (e) {
      if (e instanceof WildberriesApiError && e.status === 429 && byId.size > 0) {
        break;
      }
      throw e;
    }
  }

  if (pages >= pageLimit && !complete) {
    complete = false;
  }

  return {
    feedbacks: Array.from(byId.values()),
    countUnanswered,
    countArchive,
    nextSkip: skip,
    complete,
  };
}

export type WildberriesInboxFetchProgress = {
  unansweredSkip: number;
  answeredSkip: number;
  unansweredComplete: boolean;
  fetchComplete: boolean;
};

/**
 * Порция inbox: по одному статусу за вызов (сначала все pending, потом answered).
 */
export async function fetchWildberriesInboxSlice(
  token: string,
  opts: {
    take?: number;
    progress?: WildberriesInboxFetchProgress;
    maxPagesPerStatus?: number;
    includeAnswered?: boolean;
  } = {}
): Promise<{
  feedbacks: NonNullable<WbFeedbacksListData["feedbacks"]>;
  countUnanswered?: number;
  countArchive?: number;
  progress: WildberriesInboxFetchProgress;
}> {
  const take = Math.min(100, Math.max(20, opts.take ?? 100));
  const maxPages = opts.maxPagesPerStatus ?? WB_MAX_PAGES;
  const prev = opts.progress ?? {
    unansweredSkip: 0,
    answeredSkip: 0,
    unansweredComplete: false,
    fetchComplete: false,
  };

  const wantAnswered = opts.includeAnswered !== false;
  let countUnanswered: number | undefined;
  let countArchive: number | undefined;
  let nextProgress = { ...prev };
  const byId = new Map<string, NonNullable<WbFeedbacksListData["feedbacks"]>[number]>();

  if (!prev.unansweredComplete) {
    try {
      const unanswered = await fetchAllWildberriesFeedbacksPaginated(token, false, take, {
        startSkip: prev.unansweredSkip,
        maxPages,
      });
      for (const feedback of unanswered.feedbacks ?? []) {
        if (feedback?.id) byId.set(feedback.id, feedback);
      }
      countUnanswered = unanswered.countUnanswered;
      nextProgress.unansweredSkip = unanswered.nextSkip;
      if (unanswered.complete) {
        nextProgress.unansweredComplete = true;
      }
    } catch (e) {
      if (!(e instanceof WildberriesApiError && e.status === 429)) {
        throw e;
      }
    }
  } else {
    nextProgress.unansweredComplete = true;
  }

  if (wantAnswered && nextProgress.unansweredComplete && !prev.fetchComplete) {
    try {
      const answered = await fetchAllWildberriesFeedbacksPaginated(token, true, take, {
        startSkip: prev.answeredSkip,
        maxPages,
      });
      for (const feedback of answered.feedbacks ?? []) {
        if (feedback?.id) byId.set(feedback.id, feedback);
      }
      countArchive = answered.countArchive;
      nextProgress.answeredSkip = answered.nextSkip;
      if (answered.complete) {
        nextProgress.fetchComplete = true;
      }
    } catch (e) {
      if (!(e instanceof WildberriesApiError && e.status === 429)) {
        throw e;
      }
    }
  } else if (!wantAnswered && nextProgress.unansweredComplete) {
    nextProgress.fetchComplete = true;
  }

  return {
    feedbacks: Array.from(byId.values()),
    countUnanswered,
    countArchive,
    progress: nextProgress,
  };
}

export async function fetchWildberriesAllRecentFeedbacks(
  token: string,
  takePerStatus = 100,
  _opts?: { maxUnansweredPages?: number }
): Promise<WbFeedbacksListData> {
  const slice = await fetchWildberriesInboxSlice(token, {
    take: takePerStatus,
    maxPagesPerStatus: WB_MAX_PAGES,
  });
  return {
    feedbacks: slice.feedbacks,
    countUnanswered: slice.countUnanswered,
    countArchive: slice.countArchive,
  };
}

/** @deprecated Используйте fetchWildberriesInboxSlice */
export async function fetchWildberriesUnansweredInboxFeedbacks(
  token: string,
  takePerPage = 100,
  _maxPages?: number
): Promise<WbFeedbacksListData> {
  const page = await fetchAllWildberriesFeedbacksPaginated(token, false, takePerPage);
  return page;
}

/** Все отвеченные отзывы (полная пагинация). */
export async function fetchWildberriesAnsweredInboxFeedbacks(
  token: string,
  takePerPage = 100
): Promise<WbFeedbacksListData> {
  const page = await fetchAllWildberriesFeedbacksPaginated(token, true, takePerPage);
  return page;
}

export async function fetchWildberriesUnansweredCount(token: string): Promise<number> {
  const data = await wbRequest<WbUnansweredCountData>(
    token,
    FEEDBACKS_BASE,
    "/api/v1/feedbacks/count-unanswered"
  );
  return data.countUnanswered ?? 0;
}

export type AnswerWildberriesFeedbackParams = {
  token: string;
  feedbackId: string;
  text: string;
};

/** POST /api/v1/feedbacks/answer — ответ на отзыв (204 без тела). */
export async function answerWildberriesFeedback({
  token,
  feedbackId,
  text,
}: AnswerWildberriesFeedbackParams): Promise<void> {
  const id = feedbackId.trim();
  const reply = prepareReplyTextForMarketplace(text);
  if (!id) throw new WildberriesApiError("Не указан ID отзыва", 400);
  if (reply.length < 2 || reply.length > 5000) {
    throw new WildberriesApiError("Текст ответа должен быть от 2 до 5000 символов", 400);
  }

  const normalized = normalizeToken(token);
  const authVariants = [normalized, `Bearer ${normalized}`];
  const body = JSON.stringify({ id, text: reply });
  let lastError: WildberriesApiError | null = null;

  for (let attempt = 0; attempt <= WB_429_MAX_RETRIES; attempt += 1) {
    for (const authorization of authVariants) {
      await acquireWildberriesFeedbackWriteSlot(normalized);
      const res = await fetch(`${FEEDBACKS_BASE}/api/v1/feedbacks/answer`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
      });

      if (res.status === 204) return;

      const raw = await res.text();
      let payload: WbApiEnvelope<unknown> | null = null;
      if (raw) {
        try {
          payload = JSON.parse(raw) as WbApiEnvelope<unknown>;
        } catch {
          payload = null;
        }
      }

      if (!res.ok) {
        const wbErrorText = payload?.errorText?.trim();
        const retryAfterSec = res.status === 429 ? parseWbRetryAfterSec(res) : undefined;
        if (res.status === 429) {
          penalizeWildberriesFeedbackWriteSlot(normalized, retryAfterSec);
        }
        const err = new WildberriesApiError(
          friendlyWbStatusMessage(res.status, wbErrorText),
          res.status,
          wbErrorText,
          retryAfterSec
        );
        if (err.status === 401) {
          lastError = err;
          continue;
        }
        if (err.status === 429 && attempt < WB_429_MAX_RETRIES) {
          const waitSec = retryAfterSec && retryAfterSec > 0 ? retryAfterSec : 1;
          await sleep(waitSec * 1000);
          break;
        }
        throw err;
      }

      if (payload?.error) {
        throw new WildberriesApiError(
          payload.errorText?.trim() || "Wildberries API вернул ошибку",
          502,
          payload.errorText
        );
      }

      return;
    }
  }

  throw lastError ?? new WildberriesApiError("Не удалось отправить ответ в Wildberries", 502);
}
