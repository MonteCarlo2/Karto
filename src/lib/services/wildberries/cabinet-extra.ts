import type { SellerCommsSnapshot, SellerFinanceSnapshot } from "@/lib/seller-hub/types";
import { WildberriesApiError } from "./client";

const FEEDBACKS_BASE = "https://feedbacks-api.wildberries.ru";
const FINANCE_BASE = "https://finance-api.wildberries.ru";

function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

async function readJson(token: string, url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: normalizeToken(token) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchCabinetExtras(token: string): Promise<{
  comms?: SellerCommsSnapshot;
  finance?: SellerFinanceSnapshot;
  warnings: string[];
}> {
  const warnings: string[] = [];
  let comms: SellerCommsSnapshot | undefined;
  let finance: SellerFinanceSnapshot | undefined;

  try {
    const [feedbacks, questions] = await Promise.all([
      readJson(token, `${FEEDBACKS_BASE}/api/v1/feedbacks/count-unanswered`),
      readJson(token, `${FEEDBACKS_BASE}/api/v1/questions/count-unanswered`),
    ]);
    if (feedbacks.status >= 200 && feedbacks.status < 300) {
      const data = asRecord(asRecord(feedbacks.body)?.data) ?? asRecord(feedbacks.body);
      const qData =
        questions.status >= 200 && questions.status < 300
          ? asRecord(asRecord(questions.body)?.data) ?? asRecord(questions.body)
          : null;
      comms = {
        unansweredFeedbacks: num(data?.countUnanswered) ?? 0,
        unansweredQuestions: num(qData?.countUnanswered) ?? 0,
      };
    } else if (feedbacks.status === 401 || feedbacks.status === 403) {
      warnings.push("Отзывы не загрузились: в токене нет категории «Вопросы и отзывы».");
    }
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : "Счётчики отзывов не загрузились.");
  }

  try {
    const balanceRes = await readJson(token, `${FINANCE_BASE}/api/v1/account/balance`);
    if (balanceRes.status >= 200 && balanceRes.status < 300) {
      const root = asRecord(balanceRes.body);
      const data = asRecord(root?.data) ?? root;
      const docsRes = await readJson(token, `${FINANCE_BASE}/api/v1/documents/list?locale=ru&limit=20`);
      const docsRoot = asRecord(docsRes.body);
      const rawDocs = Array.isArray(docsRoot?.data)
        ? docsRoot.data
        : Array.isArray(asRecord(docsRoot?.data)?.documents)
          ? (asRecord(docsRoot?.data)?.documents as unknown[])
          : [];
      finance = {
        available: true,
        balance: num(data?.current) ?? num(data?.balance) ?? num(data?.amount),
        forWithdraw: num(data?.for_withdraw) ?? num(data?.forWithdraw),
        currency: typeof data?.currency === "string" ? data.currency : "RUB",
        documents: (Array.isArray(rawDocs) ? rawDocs : []).slice(0, 20).map((row, index) => {
          const doc = asRecord(row) ?? {};
          return {
            id: String(doc.serviceName ?? doc.id ?? index),
            title: String(doc.name ?? doc.title ?? doc.category ?? "Документ"),
            createdAt: typeof doc.creationTime === "string" ? doc.creationTime : undefined,
            category: typeof doc.category === "string" ? doc.category : undefined,
          };
        }),
      };
    } else if (balanceRes.status === 401 || balanceRes.status === 403) {
      finance = {
        available: false,
        documents: [],
        note: "Баланс недоступен: в токене нет категории «Финансы».",
      };
      warnings.push(finance.note!);
    } else {
      throw new WildberriesApiError(`Финансы вернули ${balanceRes.status}`, balanceRes.status);
    }
  } catch (e) {
    finance = {
      available: false,
      documents: [],
      note: e instanceof Error ? e.message : "Финансы не загрузились.",
    };
    warnings.push(finance.note!);
  }

  return { comms, finance, warnings };
}
