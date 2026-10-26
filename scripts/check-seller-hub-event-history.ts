import { emptyEventsState, type ProductReading, type StoreReading } from "../src/lib/seller-hub/event-engine/compare";
import { parseEventReconcileInput, reconcileAgainstPrevious } from "../src/lib/seller-hub/event-history";

function reading(patch: Partial<ProductReading> = {}): ProductReading {
  return {
    nmId: "100",
    itemId: "item",
    title: "Товар",
    vendorCode: "ART",
    price: 890,
    discount: 10,
    promoPrice: 800,
    stock: 5,
    salesQty: 10,
    priorSalesQty: 20,
    contentScore: 70,
    photoCount: 5,
    coverDays: 20,
    ...patch,
  };
}

const store: StoreReading = {
  syncAt: "2026-10-08T07:00:00.000Z",
  unansweredFeedbacks: 1,
  unansweredQuestions: 0,
};

function kinds(events: { kind: string }[]): string {
  return events.map((event) => event.kind).join(", ") || "(none)";
}

let state = emptyEventsState();
state = reconcileAgainstPrevious({
  now: "t1",
  previous: state,
  products: [reading({ stock: 0 })],
  store,
});
if (state.events.length !== 0) {
  throw new Error(`first snapshot created events: ${kinds(state.events)}`);
}
if (!state.store.captured || state.products["100"]?.stock !== 0) {
  throw new Error("first snapshot did not keep the baseline");
}
if (state.products["100"]?.salesWindow !== "10:20") {
  throw new Error("first snapshot did not remember the sales window");
}

const same = reconcileAgainstPrevious({
  now: "t2",
  previous: state,
  products: [reading({ stock: 0 })],
  store,
});
if (same.events.length !== 0) {
  throw new Error(`unchanged resync created events: ${kinds(same.events)}`);
}

let live = reconcileAgainstPrevious({
  now: "t3",
  previous: emptyEventsState(),
  products: [reading({ stock: 5, price: 890, promoPrice: 800 })],
  store,
});
live = reconcileAgainstPrevious({
  now: "t4",
  previous: live,
  products: [reading({ stock: 0, price: 820, promoPrice: 740 })],
  store: { ...store, syncAt: "2026-10-08T08:00:00.000Z" },
});
const stockOut = live.events.filter((event) => event.kind === "stock_out");
const priceChanged = live.events.filter((event) => event.kind === "price_changed");
if (stockOut.length !== 1 || priceChanged.length !== 1) {
  throw new Error(`expected one stock_out and one price_changed, got ${kinds(live.events)}`);
}

const again = reconcileAgainstPrevious({
  now: "t5",
  previous: live,
  products: [reading({ stock: 0, price: 820, promoPrice: 740 })],
  store: { ...store, syncAt: "2026-10-08T08:00:00.000Z" },
});
if (again.events.length !== live.events.length) {
  throw new Error(`resync changed event count ${live.events.length} -> ${again.events.length}`);
}
if (again.events.filter((event) => event.kind === "stock_out").length !== 1) {
  throw new Error("stock_out duplicated");
}

const parsed = parseEventReconcileInput({
  userId: "someone-else",
  marketplaceId: "wildberries",
  products: [reading()],
  store,
});
if (!parsed || parsed.marketplaceId !== "wildberries" || parsed.products.length !== 1) {
  throw new Error("parser rejected a valid body");
}
if (JSON.stringify(parsed).includes("someone-else")) {
  throw new Error("parser kept a client user id");
}
if (parseEventReconcileInput({ marketplaceId: "ebay", products: [], store }) !== null) {
  throw new Error("parser accepted an unknown marketplace");
}

console.log("ok", kinds(again.events));
