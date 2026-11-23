import assert from "node:assert/strict";
import { it } from "node:test";
import { buildJournal, inPeriod, journalStats, matchesQuery } from "./journal-view";
import type { ActionLogRow } from "./client-api";
import type { OrderRun } from "./orders/types";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const action = (over: Partial<ActionLogRow>): ActionLogRow => ({ id: "1", agent: "ads", action: "ad_deposit", target_id: 77, nm_id: null, request: { sum: 2000, rule: "order:o1" }, result: "ok", message: null, initiator: "agent", created_at: "2026-11-19T09:00:00Z", ...over });
const run = (over: Partial<OrderRun>): OrderRun => ({ id: "r1", orderId: "o1", orderTitle: "Мало заказов", at: "2026-11-19T08:00:00Z", status: "reminder", summary: "Заказов мало", read: true, ...over });
const src = (over: Partial<Parameters<typeof buildJournal>[0]> = {}) => ({ actions: [], runs: [], local: [], titles: new Map([["555555", "Ведро 10 л"]]), campaigns: new Map([["77", "Кампания «Ведро»"]]), orderTitles: new Map([["o1", "Пополнять рекламу"]]), ...over });

it("действие в кабинете получает названия кампании и поручения, а сумма идёт в подсчёт", () => {
  const [item] = buildJournal(src({ actions: [action({})] }));
  assert.equal(item!.title, "Пополнение бюджета кампании");
  assert.match(item!.detail, /Кампания «Ведро»/);
  assert.equal(item!.who, "Поручение");
  assert.equal(item!.orderId, "o1");
  assert.equal(journalStats([item!]).depositRub, 2000);
});

it("ошибка WB показывается словами, а не техническим текстом", () => {
  const [item] = buildJournal(src({ actions: [action({ result: "error", message: "fetch failed" })] }));
  assert.equal(item!.tone, "danger");
  assert.match(item!.detail, /связь оборвалась/);
  assert.equal(journalStats([item!]).depositRub, 0);
  assert.equal(journalStats([item!]).errors, 1);
});

it("выполненные запуски поручений не дублируют действия; напоминания и ошибки остаются", () => {
  const items = buildJournal(src({ runs: [run({ id: "a", status: "done" }), run({ id: "b", status: "reminder" }), run({ id: "c", status: "failed" }), run({ id: "d", status: "skipped" })] }));
  assert.deepEqual(items.map((i) => i.id).sort(), ["r-b", "r-c"]);
});

it("номер товара в тексте запуска заменяется названием", () => {
  const [item] = buildJournal(src({ runs: [run({ summary: "Пора менять цену: 555555: 933 → 886 ₽" })] }));
  assert.match(item!.detail, /Ведро 10 л: 933/);
});

it("записи идут от новых к старым, период и поиск работают", () => {
  const items = buildJournal(src({ actions: [action({ id: "old", created_at: "2026-10-01T09:00:00Z" }), action({ id: "new" })] }));
  assert.equal(items[0]!.id, "a-new");
  assert.equal(items.filter((i) => inPeriod(i, "7", NOW)).length, 1);
  assert.equal(items.filter((i) => inPeriod(i, "all", NOW)).length, 2);
  assert.equal(matchesQuery(items[0]!, "кампания «ведро»"), true);
  assert.equal(matchesQuery(items[0]!, "цена"), false);
});

it("изменение цены считается только когда оно прошло", () => {
  const items = buildJournal(src({ actions: [action({ id: "p1", agent: "prices", action: "price_update", nm_id: 555555, target_id: null, request: { from: 1000, to: 950 } }), action({ id: "p2", agent: "prices", action: "price_update", result: "error", message: "нет" })] }));
  assert.equal(journalStats(items).priceChanges, 1);
  assert.match(items.find((i) => i.id === "a-p1")!.detail, /Ведро 10 л/);
});

it("ряд «заказов по дням» уходит в подробности, а в заголовке остаётся смысл", () => {
  const [item] = buildJournal(src({ runs: [run({ summary: "Заказов меньше 20 в сутки уже 3 дн. подряд. Заказов по дням: 16.11: 3, 17.11: 5, 18.11: 1." })] }));
  assert.equal(item!.detail, "Заказов меньше 20 в сутки уже 3 дн. подряд.");
  assert.equal(item!.facts.find((f) => f.label === "Заказов по дням")?.value, "16.11 — 3 · 17.11 — 5 · 18.11 — 1");
});

it("принятый план даёт записи: принят, шаги отмечены, итог", () => {
  const plan = { id: "p1", title: "Поднять маржу", nmId: "555555", strategy: { goal: "Маржа 20%", steps: [{ step: "Проверить себестоимость", by: "human", day: 0, when: "Сразу", action: null }], checks: [], success: [], guards: [], reviewAfterDays: 9, failNote: "", fallback: "" } as never, state: { status: "worked", acceptedAt: "2026-11-10T08:00:00Z", resolvedAt: "2026-11-18T08:00:00Z", humanSteps: { "0": { status: "done", at: "2026-11-10T09:00:00Z" } } } as never };
  const items = buildJournal(src({ plans: [plan] }));
  assert.deepEqual(items.map((i) => i.title), ["План сработал", "Шаг плана: сделано", "План принят"]);
  assert.equal(items.find((i) => i.title === "План принят")!.facts.some((f) => f.value === "Маржа 20%"), true);
  assert.equal(buildJournal(src({ plans: [{ id: "p2", title: "Без состояния" }] })).length, 0);
});
