import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { eventReadingsFromSnapshot } from "@/lib/seller-hub/event-engine";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

let eventHistoryChain: Promise<void> = Promise.resolve();
let readOnlyEvents = false;

/** Пока фоновый сбор включён, браузер только читает события, посчитанные сервером, и сам ничего не пишет. */
export function setBrowserEventsReadOnly(enabled: boolean): void {
  readOnlyEvents = enabled;
}

async function requestSellerHubEvents(
  snapshot: SellerCatalogSnapshot,
): Promise<{ ok: true; events: SellerProductEvent[] } | { ok: false }> {
  const readings = readOnlyEvents ? null : eventReadingsFromSnapshot(snapshot);
  const res = await autoRepliesAuthorizedFetch("/api/seller-hub/events/reconcile", {
    method: "POST",
    body: JSON.stringify(
      readings
        ? { marketplaceId: snapshot.marketplaceId, products: readings.products, store: readings.store }
        : { marketplaceId: snapshot.marketplaceId, readOnly: true },
    ),
    timeoutMs: 60_000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    events?: SellerProductEvent[];
  };
  if (!res.ok || !data.ok || !Array.isArray(data.events)) return { ok: false };
  return { ok: true, events: data.events };
}

/** Серверная история. Запросы идут по одному, чтобы старый снимок не затёр новый. */
export function reconcileSellerHubEventsRemote(
  snapshot: SellerCatalogSnapshot,
): Promise<{ ok: true; events: SellerProductEvent[] } | { ok: false }> {
  const run = eventHistoryChain.then(() => requestSellerHubEvents(snapshot));
  eventHistoryChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
