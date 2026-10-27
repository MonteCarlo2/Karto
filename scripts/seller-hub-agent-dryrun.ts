/**
 * «Что бы сделал агент»: прогон сценариев цен по реальным данным кабинета из нашей базы. В WB ничего не пишет и в базу ничего не пишет.
 *
 *   npx tsx --env-file=.env.local scripts/seller-hub-agent-dryrun.ts <userId> [playbook]
 *
 * playbook: grow_no_price_war | raise_margin | clear_overstock | hold_conversion_on_negative (по умолчанию все четыре).
 */
import { checkPriceChange, buyerPrice } from "@/lib/seller-hub/agent/guardrails";
import { EMPTY_PLAYBOOK_STATE, evaluatePlaybook, PLAYBOOKS, type PlaybookId } from "@/lib/seller-hub/agent/playbooks";
import { loadFeedbackRatings, loadOrdersByNm, playbookSignals } from "@/lib/seller-hub/agent/signals";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { createServerClient } from "@/lib/supabase/server";

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error("Укажите userId первым аргументом");
  const only = process.argv[3] as PlaybookId | undefined;
  const ids = (only ? [only] : (Object.keys(PLAYBOOKS) as PlaybookId[])).filter((id) => id in PLAYBOOKS);
  const db = createServerClient();
  const built = await composeSnapshot(new SyncStore(db), db, { userId, marketplaceId: "wildberries" });
  if (!built) throw new Error("Нет снимка кабинета");
  const nowMs = Date.now();
  const todayKey = moscowDateKey(nowMs);
  const since = new Date(nowMs - 40 * 86_400_000).toISOString().slice(0, 10);
  const [ordersByNm, ratings] = await Promise.all([loadOrdersByNm(db, userId, since), loadFeedbackRatings(db, userId)]);
  const facts = taskFactsFromSnapshot(built.snapshot, { taxRatePercent: null }).products;
  const itemByNm = new Map(built.snapshot.items.map((item) => [String(item.externalId), item]));
  const feedbacksRead = built.snapshot.feedbacks != null && (built.snapshot.feedbacks.status === "ok" || built.snapshot.feedbacks.status === "partial");

  console.log(`Дата ${todayKey}, товаров ${facts.length}, истории заказов по ${ordersByNm.size} товарам, отзывы ${feedbacksRead ? "прочитаны" : "НЕ прочитаны"}\n`);
  for (const id of ids) {
    const tally = { hold: 0, up: 0, down: 0, blocked: 0, noData: 0 };
    const lines: string[] = [];
    for (const fact of facts) {
      const item = itemByNm.get(fact.nmId);
      const inputs = {
        nmId: fact.nmId,
        discountedPrice: item?.discountedPrice ?? null,
        stock: fact.stockFbo != null || fact.stockFbs != null ? (fact.stockFbo ?? 0) + (fact.stockFbs ?? 0) : null,
        coverDays: fact.coverDays,
        deadStock: fact.funnelStatus === "ok" && fact.orders === 0 && fact.priorOrders === 0,
        cartPercent: fact.addToCartPercent,
        openCount: fact.openCount,
        ordersByDate: ordersByNm.get(fact.nmId) ?? new Map<string, number>(),
        feedbacks: feedbacksRead ? (ratings.get(fact.nmId) ?? []) : null,
      };
      const signals = playbookSignals(inputs, todayKey, nowMs);
      if (!signals || !item || item.price == null) {
        tally.noData += 1;
        continue;
      }
      const decision = evaluatePlaybook(id, signals, EMPTY_PLAYBOOK_STATE, nowMs);
      if (decision.stepPercent === 0) {
        tally.hold += 1;
        continue;
      }
      const targetBuyer = signals.buyerPrice * (1 + decision.stepPercent / 100);
      const discount = item.discountPercent ?? 0;
      const guard = checkPriceChange({
        currentBase: item.price,
        currentDiscount: discount,
        proposedBase: Math.ceil(targetBuyer / (1 - discount / 100)),
        proposedDiscount: discount,
        breakEvenBuyerPrice: fact.breakEvenPrice,
        stock: inputs.stock,
        lastChangeAt: null,
        nowMs,
      });
      const why = decision.reasons.map((r) => r.text).join(" | ");
      if (!guard.ok) {
        tally.blocked += 1;
        lines.push(`  ✖ ${fact.vendorCode} ${fact.title.slice(0, 32)}: ${decision.stepPercent > 0 ? "+" : ""}${decision.stepPercent}% не пройдёт: ${guard.issues.map((i) => i.text).join("; ")}\n      ${why}`);
        continue;
      }
      if (decision.stepPercent > 0) tally.up += 1;
      else tally.down += 1;
      lines.push(`  ✔ ${fact.vendorCode} ${fact.title.slice(0, 32)}: ${decision.stepPercent > 0 ? "+" : ""}${decision.stepPercent}% → цена ${Math.round(buyerPrice(item.price, discount))} → ${guard.final!.buyerPrice} ₽ (база ${item.price} → ${guard.final!.base})${guard.issues.length ? ` [${guard.issues.map((i) => i.text).join("; ")}]` : ""}\n      ${why}`);
    }
    console.log(`=== ${PLAYBOOKS[id].title}\n  без изменений: ${tally.hold}, повысить: ${tally.up}, снизить: ${tally.down}, не пройдёт проверки: ${tally.blocked}, нет данных: ${tally.noData}`);
    for (const line of lines.slice(0, 25)) console.log(line);
    console.log();
  }
}

void main().catch((e) => {
  console.error("ОШИБКА", e instanceof Error ? e.message : e);
  process.exit(1);
});
