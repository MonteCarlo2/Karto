import type { SellerSearchText, SellerSearchTexts } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

/** Только чтение: поисковые запросы по товару и позиции в поиске WB. */

const ANALYTICS_BASE = "https://seller-analytics-api.wildberries.ru";
const REQUEST_TIMEOUT_MS = 45_000;

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new WildberriesApiError("API-токен не указан", 400);
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

type Metric = { current?: number; dynamics?: number } | undefined;
type SearchTextItem = {
  text?: string;
  nmId?: number;
  frequency?: Metric;
  avgPosition?: Metric;
  openCard?: Metric;
  addToCart?: Metric;
  openToCart?: Metric;
  orders?: Metric;
  cartToOrder?: Metric;
  visibility?: Metric;
};

const cur = (metric: Metric): number | null => (typeof metric?.current === "number" ? metric.current : null);

/** Топ поисковых запросов по одному товару за период и предыдущий период для сравнения (до 30 запросов). */
export async function fetchWbSearchTexts(
  token: string,
  nmId: number,
  period: { dateFrom: string; dateTo: string },
  pastPeriod: { dateFrom: string; dateTo: string }
): Promise<SellerSearchTexts> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ANALYTICS_BASE}/api/v2/search-report/product/search-texts`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
      },
      body: JSON.stringify({
        currentPeriod: { start: period.dateFrom, end: period.dateTo },
        pastPeriod: { start: pastPeriod.dateFrom, end: pastPeriod.dateTo },
        nmIds: [nmId],
        topOrderBy: "orders",
        includeSubstitutedSKUs: false,
        includeSearchTexts: true,
        orderBy: { field: "orders", mode: "desc" },
        limit: 30,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = "";
      try {
        const body = JSON.parse(text) as { detail?: string; title?: string; message?: string };
        detail = [body.title, body.detail, body.message].filter(Boolean).join(": ").slice(0, 200);
      } catch {
        detail = "";
      }
      throw new WildberriesApiError(
        res.status === 429
          ? "WB ограничил запросы (поисковые запросы). Повторите через минуту."
          : res.status === 402
            ? "Для сбора этих данных нужна подписка Джем."
            : /jam/i.test(detail)
              ? "Для сбора этих данных (отчёт WB «Поисковые запросы») нужна подписка Джем. Подключите её в кабинете WB: здесь появятся запросы покупателей, ваши позиции и подсказки, каких слов не хватает карточке."
              : res.status === 401 || res.status === 403
                ? `Нет доступа к отчёту о поисковых запросах${detail ? ` (${detail})` : ""}: проверьте категории токена и подписку WB`
                : `Wildberries вернул ${res.status} (поисковые запросы)`,
        res.status
      );
    }
    let payload: { data?: { items?: SearchTextItem[] } } | null = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const rows: SellerSearchText[] = (payload?.data?.items ?? []).flatMap((item) =>
      item.text
        ? [
            {
              text: item.text,
              nmId: String(item.nmId ?? nmId),
              frequency: cur(item.frequency),
              avgPosition: cur(item.avgPosition),
              avgPositionDynamics: typeof item.avgPosition?.dynamics === "number" ? item.avgPosition.dynamics : null,
              openCard: cur(item.openCard),
              addToCart: cur(item.addToCart),
              openToCart: cur(item.openToCart),
              orders: cur(item.orders),
              cartToOrder: cur(item.cartToOrder),
              visibility: cur(item.visibility),
            },
          ]
        : []
    );
    return { loadedAt: new Date().toISOString(), nmId: String(nmId), dateFrom: period.dateFrom, dateTo: period.dateTo, rows };
  } catch (e) {
    if (e instanceof WildberriesApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WildberriesApiError("Wildberries не ответил вовремя", 504);
    }
    throw new WildberriesApiError(e instanceof Error ? e.message : "Не удалось связаться с Wildberries", 502);
  } finally {
    clearTimeout(timeout);
  }
}
