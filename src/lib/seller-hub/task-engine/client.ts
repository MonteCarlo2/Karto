import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { taskFactsFromSnapshot } from "./facts";
import type {
  SellerTask,
  TaskActionType,
  TaskCategory,
  TaskEvidence,
  TaskImpactType,
  TaskSeverity,
  TaskStatus,
  TaskType,
} from "./types";

let taskChain: Promise<void> = Promise.resolve();
let reconcileFromBrowser = true;

/**
 * Фоновый сбор считает задачи на сервере по свежим данным. Пока он включён, браузер их не пересчитывает:
 * его снимок может быть старше серверного, и он затёр бы свежий расчёт.
 */
export function setBrowserTaskReconcile(enabled: boolean): void {
  reconcileFromBrowser = enabled;
}

async function requestTasks(snapshot: SellerCatalogSnapshot): Promise<void> {
  const facts = taskFactsFromSnapshot(snapshot, { taxRatePercent: null });
  await autoRepliesAuthorizedFetch("/api/seller-hub/tasks/reconcile", {
    method: "POST",
    body: JSON.stringify({
      marketplaceId: snapshot.marketplaceId,
      products: facts.products,
      store: facts.store,
    }),
    timeoutMs: 60_000,
  });
}

/** Считает задачи на сервере и записывает их в существующую таблицу. */
export function reconcileSellerHubTasksRemote(snapshot: SellerCatalogSnapshot): Promise<void> {
  if (!reconcileFromBrowser) return Promise.resolve();
  const run = taskChain.then(() => requestTasks(snapshot));
  taskChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const TASK_TYPES = new Set<TaskType>([
  "TASK_STOCK_OUT",
  "TASK_LOW_STOCK",
  "TASK_EXCESS_STOCK",
  "TASK_STAGNANT_CAPITAL",
  "TASK_SALES_DROP",
  "TASK_SALES_GROWTH",
  "TASK_CONVERSION_DROP",
  "TASK_LOW_TRAFFIC",
  "TASK_NO_SALES",
  "TASK_NEGATIVE_MARGIN",
  "TASK_MARGIN_NEAR_ZERO",
  "TASK_LOW_MARGIN",
  "TASK_MARGIN_DETERIORATION",
  "TASK_COST_MISSING",
  "TASK_LOW_CONTENT_SCORE",
  "TASK_CONTENT_OPPORTUNITY",
  "TASK_LOW_PHOTO_COUNT",
  "TASK_UNANSWERED_REVIEWS",
  "TASK_UNANSWERED_QUESTIONS",
  "TASK_UNANSWERED_NEGATIVE_REVIEW",
  "TASK_FROM_EVENT",
  "TASK_UNANSWERED_QUESTION",
  "TASK_UNANSWERED_POSITIVE_REVIEWS",
  "TASK_NEGATIVE_SHARE_UP",
  "TASK_FEEDBACKS_ACCESS",
  "TASK_PROMO_LOSS",
  "TASK_PROMO_OPPORTUNITY",
  "TASK_AD_NO_ORDERS",
  "TASK_AD_DRR_OVER_MARGIN",
  "TASK_AD_CAMPAIGN_STOPPED",
  "TASK_AD_NO_STOCK",
  "TASK_AD_EFFICIENCY_DROP",
  "TASK_AD_WEAK_CARD",
  "TASK_AD_SCALE_UP",
  "TASK_LOW_BUYOUT",
  "TASK_LOW_RATING",
  "TASK_COSTS_EAT_MARGIN",
]);

const CATEGORIES = new Set<TaskCategory>(["stock", "sales", "economics", "content", "reviews"]);
const SEVERITIES = new Set<TaskSeverity>(["critical", "important", "opportunity"]);
const STATUSES = new Set<TaskStatus>(["active", "in_progress", "snoozed", "completed", "dismissed"]);
const ACTIONS = new Set<TaskActionType>([
  "OPEN_PRODUCT",
  "OPEN_STOCKS",
  "OPEN_PRICE_EDITOR",
  "OPEN_CONTENT_EDITOR",
  "OPEN_REVIEWS",
  "OPEN_REVIEW_RESPONSES",
  "OPEN_QUESTIONS",
  "OPEN_SUPPLIES",
  "OPEN_PROMOTIONS",
  "OPEN_ADS",
  "NONE",
]);
const IMPACTS = new Set<TaskImpactType>([
  "SALES_PROTECTION",
  "SALES_GROWTH",
  "PROFIT_PROTECTION",
  "PROFIT_GROWTH",
  "CAPITAL_RELEASE",
  "STOCK_RISK",
  "OPERATIONAL",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function evidenceOf(value: unknown): TaskEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const evidence: TaskEvidence = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null || typeof item === "string" || typeof item === "boolean") {
      evidence[key] = item;
      continue;
    }
    const parsed = num(item);
    if (parsed != null) evidence[key] = parsed;
  }
  return evidence;
}

function taskOf(value: unknown): SellerTask | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const type = text(row.type);
  const category = text(row.category);
  const severity = text(row.severity);
  const status = text(row.status);
  const actionType = text(row.actionType);
  const businessImpactType = text(row.businessImpactType);
  const storeId = text(row.storeId);
  const title = text(row.title);
  const createdAt = text(row.createdAt);
  const updatedAt = text(row.updatedAt);
  if (!id || !storeId || !title || !createdAt || !updatedAt) return null;
  if (!type || !TASK_TYPES.has(type as TaskType)) return null;
  if (!category || !CATEGORIES.has(category as TaskCategory)) return null;
  if (!severity || !SEVERITIES.has(severity as TaskSeverity)) return null;
  if (!status || !STATUSES.has(status as TaskStatus)) return null;
  if (!actionType || !ACTIONS.has(actionType as TaskActionType)) return null;
  if (!businessImpactType || !IMPACTS.has(businessImpactType as TaskImpactType)) return null;
  const score = num(row.score);
  return {
    id,
    storeId,
    nmId: text(row.nmId),
    itemId: text(row.itemId),
    productTitle: text(row.productTitle),
    vendorCode: text(row.vendorCode),
    type: type as TaskType,
    category: category as TaskCategory,
    severity: severity as TaskSeverity,
    status: status as TaskStatus,
    title,
    description: typeof row.description === "string" ? row.description : "",
    reason: typeof row.reason === "string" ? row.reason : "",
    evidence: evidenceOf(row.evidence),
    recommendation: typeof row.recommendation === "string" ? row.recommendation : "",
    actionType: actionType as TaskActionType,
    businessImpactType: businessImpactType as TaskImpactType,
    score: score ?? 0,
    sourceEventId: text(row.sourceEventId),
    createdAt,
    updatedAt,
    snoozeUntil: text(row.snoozeUntil),
    resolvedAt: text(row.resolvedAt),
    resolution: text(row.resolution),
  };
}

/** Сначала обновляет расчёт, затем читает сохранённые задачи. Правила в браузере не считает. */
export async function loadSellerHubTasks(snapshot: SellerCatalogSnapshot): Promise<SellerTask[]> {
  try {
    await reconcileSellerHubTasksRemote(snapshot);
  } catch {
    // Список ниже всё равно читает то, что уже сохранено.
  }
  const response = await autoRepliesAuthorizedFetch(
    `/api/seller-hub/tasks?marketplaceId=${encodeURIComponent(snapshot.marketplaceId)}`,
    { method: "GET", timeoutMs: 60_000 },
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("tasks");
  }
  if (!response.ok || !body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    throw new Error("tasks");
  }
  const rows = (body as { tasks?: unknown }).tasks;
  if (!Array.isArray(rows)) throw new Error("tasks");
  return rows.map(taskOf).filter((task): task is SellerTask => task != null);
}

/** Пишет «Выполнено» или «Отложить». userId в запрос не кладётся. */
export async function updateSellerHubTaskStatus(input: {
  marketplaceId: string;
  taskId: string;
  status: "completed" | "snoozed";
  snoozeUntil?: string;
}): Promise<SellerTask> {
  const response = await autoRepliesAuthorizedFetch(`/api/seller-hub/tasks/${encodeURIComponent(input.taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      marketplaceId: input.marketplaceId,
      status: input.status,
      snoozeUntil: input.status === "snoozed" ? input.snoozeUntil : undefined,
    }),
    timeoutMs: 30_000,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const serverError =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : null;
  let errorText = serverError ?? "Не удалось сохранить статус";
  if (!serverError && response.status === 401) errorText = "Не авторизован";
  if (!serverError && response.status === 404) errorText = "Задача не найдена";
  if (!response.ok || !body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    throw new Error(errorText);
  }
  const task = taskOf((body as { task?: unknown }).task);
  if (!task) throw new Error("Не удалось сохранить статус");
  return task;
}
