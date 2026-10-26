import type { SellerTask, TaskActionType, TaskCategory, TaskImpactType, TaskSeverity } from "./types";

/**
 * Задача из уведомления «Событий»: человек сам решил, что с этим надо разобраться. Содержимое берётся из события как есть
 * (название, подробности, товар), ничего не придумывается. Такая задача не вычисляется движком и поэтому не закрывается пересчётом.
 */

export type EventRowForTask = {
  event_key: string;
  kind: string;
  event_group: string;
  severity: string;
  title: string;
  detail: string;
  product_title: string | null;
  vendor_code: string | null;
  nm_id: string | null;
  item_id: string | null;
};

const SEVERITY: Record<string, TaskSeverity> = { critical: "critical", important: "important", info: "opportunity" };
const SCORE: Record<TaskSeverity, number> = { critical: 80, important: 60, opportunity: 40 };

const CATEGORY: Record<string, TaskCategory> = { stock: "stock", sales: "sales", price: "economics", money: "economics", content: "content", reviews: "reviews" };

const IMPACT: Record<string, TaskImpactType> = {
  stock: "STOCK_RISK",
  sales: "SALES_PROTECTION",
  price: "PROFIT_PROTECTION",
  money: "PROFIT_PROTECTION",
  content: "SALES_GROWTH",
  reviews: "SALES_PROTECTION",
};

function actionFor(event: EventRowForTask): TaskActionType {
  if (event.event_group === "stock") return "OPEN_STOCKS";
  if (event.event_group === "reviews") return "OPEN_REVIEWS";
  if (event.kind.startsWith("supply_")) return "OPEN_SUPPLIES";
  if (event.event_group === "price" && event.item_id) return "OPEN_PRICE_EDITOR";
  if (event.item_id) return "OPEN_PRODUCT";
  return "NONE";
}

export function taskFromEvent(event: EventRowForTask, storeId: string, now: string, id: string): SellerTask {
  const severity = SEVERITY[event.severity] ?? "opportunity";
  return {
    id,
    storeId,
    nmId: event.nm_id,
    itemId: event.item_id,
    productTitle: event.product_title,
    vendorCode: event.vendor_code,
    type: "TASK_FROM_EVENT",
    category: CATEGORY[event.event_group] ?? "sales",
    severity,
    status: "active",
    title: event.title,
    description: event.detail.slice(0, 600),
    reason: "Создана вами из уведомления в разделе «События».",
    evidence: { event_kind: event.kind, event_group: event.event_group },
    recommendation: "",
    actionType: actionFor(event),
    businessImpactType: IMPACT[event.event_group] ?? "OPERATIONAL",
    score: SCORE[severity],
    sourceEventId: event.event_key,
    createdAt: now,
    updatedAt: now,
    snoozeUntil: null,
    resolvedAt: null,
    resolution: null,
  };
}
