import { EVENT_GROUP, type SellerEventKind, type SellerProductEvent } from "./types";

/**
 * События из журнала действий агентов. Умные события по истории (просадки, тенденции, конверсии, «замолчавшие» товары) — в smart-events.ts.
 */

export type AgentActionRow = { id: string; agent: string; action: string; result: string; message: string | null; initiator: string; nm_id: number | string | null; created_at: string };

const AGENT_LABEL: Record<string, string> = { ads: "реклама", prices: "цены", comms: "ответы", stocks: "остатки" };

const make = (kind: SellerEventKind, severity: SellerProductEvent["severity"], title: string, detail: string, createdAt: string, key: string): SellerProductEvent => ({
  id: `${kind}:store:${key}`,
  createdAt,
  kind,
  group: EVENT_GROUP[kind],
  severity,
  title,
  detail,
  productTitle: null,
  vendorCode: null,
  nmId: null,
  itemId: null,
});

/** Журнал действий → события. Пропущенные («skipped») записи не показываем: ничего не произошло. */
export function agentActionEvents(rows: AgentActionRow[]): SellerProductEvent[] {
  const out: SellerProductEvent[] = [];
  for (const r of rows) {
    if (r.result === "skipped") continue;
    const who = r.initiator === "agent" ? `Агент (${AGENT_LABEL[r.agent] ?? r.agent})` : "Действие вручную";
    const verb = r.result === "error" ? "не выполнено" : r.result === "suggested" ? "предложение" : "выполнено";
    const ev = make("agent_action", r.result === "error" ? "important" : "info", `${who}: ${verb}`, (r.message || r.action || "").slice(0, 300), r.created_at, r.id);
    out.push({ ...ev, nmId: r.nm_id == null ? null : String(r.nm_id) });
  }
  return out;
}
