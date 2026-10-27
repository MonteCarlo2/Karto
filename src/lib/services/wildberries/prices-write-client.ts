import { interpretPriceUploadStatus, type PriceUploadHistoryOutcome } from "@/lib/seller-hub/price-write";
import { WildberriesApiError } from "./client";

const PRICES_BASE = "https://discounts-prices-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function wbFetch(
  token: string,
  url: string,
  init?: { method?: "GET" | "POST" | "PUT" | "PATCH"; body?: unknown; timeoutMs?: number }
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(
      e instanceof Error ? e.message : "Не удалось связаться с Wildberries",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export type PriceUpdate = {
  nmId: number;
  price?: number;
  discount?: number;
};

function parseWbPricesError(text: string, status: number): string {
  const body = parseJson<{
    title?: string;
    detail?: string;
    message?: string;
    error?: boolean;
    errorText?: string;
    data?: { errorText?: string };
  }>(text);

  const raw =
    body?.errorText?.trim() ||
    body?.data?.errorText?.trim() ||
    body?.detail?.trim() ||
    body?.message?.trim() ||
    "";

  const title = body?.title?.trim() ?? "";
  if (raw && !/^unprocessable entity$/i.test(raw)) return raw;
  if (status === 422) {
    return "Wildberries отклонил изменение цены или скидки — проверьте значения в кабинете";
  }
  if (title && !/^unprocessable entity$/i.test(title)) return title;
  return `Ошибка Wildberries (${status})`;
}

function buildUploadPayload(
  updates: PriceUpdate[]
): Array<{ nmID: number; price?: number; discount?: number }> {
  return updates.map((u) => {
    const entry: { nmID: number; price?: number; discount?: number } = { nmID: u.nmId };
    if (u.price != null && u.price > 0) entry.price = Math.round(u.price);
    if (u.discount != null && u.discount >= 0) entry.discount = Math.round(u.discount);
    return entry;
  });
}

/**
 * Upload price/discount updates for multiple nmIDs.
 * POST https://discounts-prices-api.wildberries.ru/api/v2/upload/task
 */
export async function updateWbPrices(
  token: string,
  updates: PriceUpdate[]
): Promise<{ ok: boolean; uploadId?: number; error?: string; status?: number }> {
  if (updates.length === 0) return { ok: true };

  const payload = { data: buildUploadPayload(updates) };
  for (const row of payload.data) {
    if (row.price == null && row.discount == null) {
      return { ok: false, error: "WB требует price или discount для каждого товара" };
    }
  }

  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/upload/task`, {
    method: "POST",
    body: payload,
  });

  if (!res.ok) {
    return { ok: false, status: res.status, error: parseWbPricesError(res.text, res.status) };
  }

  const body = parseJson<{ data?: { uploadID?: number; id?: number }; error?: boolean; errorText?: string }>(
    res.text
  );
  if (body?.error) {
    return { ok: false, status: 400, error: body.errorText ?? "Wildberries отклонил загрузку цен" };
  }

  const uploadId = body?.data?.uploadID ?? body?.data?.id;
  return { ok: true, uploadId };
}

/**
 * Установить скидку WB Клуба (целые проценты). POST https://discounts-prices-api.wildberries.ru/api/v2/upload/task/club-discount
 * Обработку задачи ждёт тот же `waitForWbPriceUpload`: история задач общая для всех загрузок цен и скидок.
 */
export async function updateWbClubDiscount(
  token: string,
  updates: Array<{ nmId: number; clubDiscount: number }>
): Promise<{ ok: boolean; uploadId?: number; error?: string; status?: number }> {
  if (updates.length === 0) return { ok: true };
  for (const u of updates) {
    if (!Number.isInteger(u.nmId) || u.nmId <= 0) return { ok: false, error: "Неверный артикул WB" };
    if (!Number.isFinite(u.clubDiscount) || u.clubDiscount < 0 || u.clubDiscount > 100) return { ok: false, error: "Скидка Клуба должна быть от 0 до 100%" };
  }
  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/upload/task/club-discount`, {
    method: "POST",
    body: { data: updates.map((u) => ({ nmID: u.nmId, clubDiscount: Math.round(u.clubDiscount) })) },
  });
  if (!res.ok) return { ok: false, status: res.status, error: parseWbPricesError(res.text, res.status) };
  const body = parseJson<{ data?: { uploadID?: number; id?: number }; error?: boolean; errorText?: string }>(res.text);
  if (body?.error) return { ok: false, status: 400, error: body.errorText ?? "Wildberries отклонил скидку Клуба" };
  return { ok: true, uploadId: body?.data?.uploadID ?? body?.data?.id };
}

/**
 * Восстановить скидку: сначала только discount (как в кабинете WB), затем price+discount.
 */
export async function applyWbDiscountRestore(
  token: string,
  updates: Array<{ nmId: number; discount: number; price?: number }>
): Promise<{ ok: boolean; uploadId?: number; error?: string }> {
  if (updates.length === 0) {
    return { ok: false, error: "Нет данных для восстановления скидки" };
  }

  const discountOnly = updates.map((u) => ({ nmId: u.nmId, discount: u.discount }));
  let lastError: string | undefined;

  const discountResult = await updateWbPrices(token, discountOnly);
  if (discountResult.ok) {
    if (discountResult.uploadId != null) {
      const waited = await waitForWbPriceUpload(token, discountResult.uploadId);
      if (waited.ok) return { ok: true, uploadId: discountResult.uploadId };
      if (waited.outcome !== "rejected") {
        return { ok: false, error: waited.error, uploadId: discountResult.uploadId };
      }
      lastError = waited.error;
    } else {
      return { ok: false, error: "WB не вернул номер загрузки. Применилась ли скидка, неизвестно." };
    }
  } else {
    lastError = discountResult.error;
  }

  const withPrice = updates
    .filter((u) => u.price != null && u.price > 0)
    .map((u) => ({ nmId: u.nmId, price: u.price!, discount: u.discount }));
  if (withPrice.length === 0) {
    return { ok: false, error: lastError ?? "Не удалось восстановить скидку" };
  }

  const combined = await updateWbPrices(token, withPrice);
  if (!combined.ok) {
    return { ok: false, error: combined.error ?? lastError ?? "Не удалось восстановить скидку" };
  }

  if (combined.uploadId == null) {
    return { ok: false, error: "WB не вернул номер загрузки. Применилась ли скидка, неизвестно." };
  }
  const waited = await waitForWbPriceUpload(token, combined.uploadId);
  if (!waited.ok) return { ok: false, error: waited.error, uploadId: combined.uploadId };
  return { ok: true, uploadId: combined.uploadId };
}

type UploadTaskState = {
  uploadID?: number;
  status?: number;
  successGoodsNumber?: number;
  overAllGoodsNumber?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readUploadTask(
  token: string,
  uploadId: number,
  kind: "buffer" | "history"
): Promise<UploadTaskState | null> {
  const path = kind === "buffer" ? "buffer/tasks" : "history/tasks";
  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/${path}?uploadID=${uploadId}`, { timeoutMs: 8_000 });
  if (!res.ok) return null;
  const body = parseJson<{ data?: UploadTaskState }>(res.text);
  return body?.data ?? null;
}

async function readUploadGoodsErrors(token: string, uploadId: number): Promise<string[]> {
  const res = await wbFetch(token, `${PRICES_BASE}/api/v2/history/goods/task?uploadID=${uploadId}&limit=20&offset=0`, {
    timeoutMs: 8_000,
  });
  if (!res.ok) return [];

  const body = parseJson<{
    data?: {
      historyGoods?: Array<{ nmID?: number; errorText?: string; error?: string }>;
    };
  }>(res.text);

  const errors: string[] = [];
  for (const row of body?.data?.historyGoods ?? []) {
    const msg = row.errorText?.trim() || row.error?.trim();
    if (msg) errors.push(row.nmID ? `nmID ${row.nmID}: ${msg}` : msg);
  }
  return errors;
}

export type PriceUploadWait = {
  ok: boolean;
  outcome: PriceUploadHistoryOutcome | "unknown";
  status?: number;
  error?: string;
  successCount?: number;
  uploadId: number;
};

/**
 * Повторно читает уже созданную загрузку и не отправляет цену снова.
 * Статусы истории WB: 3 без ошибок, 4 отмена, 5 часть с ошибками, 6 ошибки во всех.
 * В буфере 1 — ещё в обработке.
 */
export async function waitForWbPriceUpload(
  token: string,
  uploadId: number,
  opts?: { maxAttempts?: number; delayMs?: number; deadlineMs?: number }
): Promise<PriceUploadWait> {
  const maxAttempts = opts?.maxAttempts ?? 24;
  const delayMs = opts?.delayMs ?? 500;
  const deadline = Date.now() + (opts?.deadlineMs ?? 15_000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (Date.now() >= deadline) break;
    if (attempt > 0) await sleep(delayMs);

    let buffer: UploadTaskState | null = null;
    let history: UploadTaskState | null = null;
    try {
      buffer = await readUploadTask(token, uploadId, "buffer");
      if (buffer?.status === 1) continue;
      history = await readUploadTask(token, uploadId, "history");
    } catch {
      continue;
    }
    if (!history?.status) continue;

    const status = history.status;
    const successCount = history.successGoodsNumber ?? 0;
    let errors: string[] = [];
    if (status === 5 || status === 6) {
      try {
        errors = await readUploadGoodsErrors(token, uploadId);
      } catch {
        errors = [];
      }
    }
    const interpreted = interpretPriceUploadStatus({ status, successCount, errors });
    if (!interpreted) continue;
    return { ...interpreted, status, successCount, uploadId };
  }

  return {
    ok: false,
    outcome: "unknown",
    uploadId,
    error: `Загрузка ${uploadId} ещё не обработана. Результат неизвестен, повторно цену не отправляю.`,
  };
}
