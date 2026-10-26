/**
 * Только GET к feedbacks-api. Не импортирует модули «Автоотзывов».
 */
import type { WbFeedback, WbFeedbacksListData } from "@/lib/services/wildberries/types";

const FEEDBACKS_BASE = "https://feedbacks-api.wildberries.ru";
const PAGE_TAKE = 100;
const PAGE_GAP_MS = 400;

export type WbQuestion = {
  id?: string;
  text?: string;
  createdDate?: string;
  answer?: { text?: string; createDate?: string } | null;
  productDetails?: { nmId?: number };
};

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FeedbacksReadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(
  token: string,
  path: string,
): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${FEEDBACKS_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: normalizeToken(token) },
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { data?: T; error?: boolean; errorText?: string } | null;
  if (res.status === 429) {
    throw new FeedbacksReadError("rate_limited", 429);
  }
  if (res.status === 401 || res.status === 403) {
    throw new FeedbacksReadError("forbidden", res.status);
  }
  if (!res.ok) {
    throw new FeedbacksReadError(body?.errorText || `WB ${res.status}`, res.status);
  }
  return { status: res.status, data: (body?.data as T) ?? null };
}

export async function probeFeedbacksAccess(token: string): Promise<"ok" | "forbidden" | "error"> {
  try {
    await getJson(token, "/api/v1/feedbacks/count-unanswered");
    return "ok";
  } catch (e) {
    if (e instanceof FeedbacksReadError && (e.status === 401 || e.status === 403)) {
      return "forbidden";
    }
    return "error";
  }
}

async function fetchFeedbacksPage(
  token: string,
  isAnswered: boolean,
  skip: number,
  dateFromUnix?: number,
): Promise<WbFeedbacksListData> {
  const params = new URLSearchParams({
    isAnswered: String(isAnswered),
    take: String(PAGE_TAKE),
    skip: String(skip),
    order: "dateDesc",
  });
  if (dateFromUnix != null) params.set("dateFrom", String(dateFromUnix));
  const { data } = await getJson<WbFeedbacksListData>(token, `/api/v1/feedbacks?${params}`);
  return data ?? {};
}

async function fetchQuestionsPage(
  token: string,
  isAnswered: boolean,
  skip: number,
): Promise<{ questions?: WbQuestion[] }> {
  const params = new URLSearchParams({
    isAnswered: String(isAnswered),
    take: String(PAGE_TAKE),
    skip: String(skip),
    order: "dateDesc",
  });
  const { data } = await getJson<{ questions?: WbQuestion[] }>(token, `/api/v1/questions?${params}`);
  return data ?? {};
}

/** Все страницы отзывов (answered или нет) с dateFrom. При 429 — partial. */
export async function fetchFeedbacksWindow(
  token: string,
  isAnswered: boolean,
  dateFromUnix: number,
): Promise<{ rows: WbFeedback[]; complete: boolean; rateLimited: boolean }> {
  const byId = new Map<string, WbFeedback>();
  let skip = 0;
  let complete = false;
  let rateLimited = false;
  for (let page = 0; page < 40; page++) {
    try {
      if (page > 0) await sleep(PAGE_GAP_MS);
      const data = await fetchFeedbacksPage(token, isAnswered, skip, dateFromUnix);
      const batch = data.feedbacks ?? [];
      if (batch.length === 0) {
        complete = true;
        break;
      }
      for (const row of batch) {
        if (row?.id) byId.set(row.id, row);
      }
      skip += batch.length;
      if (batch.length < PAGE_TAKE) {
        complete = true;
        break;
      }
    } catch (e) {
      if (e instanceof FeedbacksReadError && e.status === 429) {
        rateLimited = true;
        break;
      }
      throw e;
    }
  }
  return { rows: [...byId.values()], complete, rateLimited };
}

/** Неотвеченные вопросы (все; для задач важны старше 24 ч). */
export async function fetchUnansweredQuestions(
  token: string,
): Promise<{ rows: WbQuestion[]; complete: boolean; rateLimited: boolean }> {
  const byId = new Map<string, WbQuestion>();
  let skip = 0;
  let complete = false;
  let rateLimited = false;
  for (let page = 0; page < 20; page++) {
    try {
      if (page > 0) await sleep(PAGE_GAP_MS);
      const data = await fetchQuestionsPage(token, false, skip);
      const batch = data.questions ?? [];
      if (batch.length === 0) {
        complete = true;
        break;
      }
      for (const row of batch) {
        if (row?.id) byId.set(row.id, row);
      }
      skip += batch.length;
      if (batch.length < PAGE_TAKE) {
        complete = true;
        break;
      }
    } catch (e) {
      if (e instanceof FeedbacksReadError && e.status === 429) {
        rateLimited = true;
        break;
      }
      throw e;
    }
  }
  return { rows: [...byId.values()], complete, rateLimited };
}
