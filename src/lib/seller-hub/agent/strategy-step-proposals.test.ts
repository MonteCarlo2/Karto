import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adsStepProposal } from "./strategy-step-proposals";
import type { ProgramStepRef, PlanAction } from "./strategy";
import type { ScenarioProduct } from "./scenario-run";

const product = (over: Partial<ScenarioProduct> = {}): ScenarioProduct => ({
  nmId: "1",
  title: "Ведро",
  vendorCode: "V1",
  base: 1000,
  discount: 0,
  breakEvenPrice: 700,
  stock: 50,
  signals: null,
  ads: [{ campaignId: "111", name: "Кампания", status: 9, statusLabel: "Активна", searchRub: 300, recommendationsRub: 0, budget: 1000 }],
  ...over,
});
const ref = (action: PlanAction): ProgramStepRef => ({ index: 2, step: { step: "шаг", by: "program", day: 0, when: "сразу", action } });
const run = (action: PlanAction, p = product()) => adsStepProposal({ ref: ref(action), findingId: "f1", nmId: "1", planTitle: "План", goal: "Цель", product: p });

describe("шаги плана по рекламе → предложения «Выполнить»", () => {
  it("пауза активной кампании: готовое предложение с отметкой плана, пауза остановленной не нужна", () => {
    const made = run({ type: "ads_pause", campaignId: "111", reason: "ДРР выше маржи" });
    assert.equal(made.proposal?.action.type, "pause");
    assert.deepEqual((made.proposal!.meta as { strategy: unknown }).strategy, { findingId: "f1", stepIndex: 2, price: false });
    assert.match(run({ type: "ads_pause", campaignId: "111", reason: "r" }, product({ ads: [{ campaignId: "111", name: "К", status: 11, statusLabel: "Пауза", searchRub: 300, recommendationsRub: 0, budget: 1 }] })).skip ?? "", /уже не идёт/);
  });
  it("ставка считается программой от текущей: −10% от 300 это 270, рост не больше чем в 3 раза, не ниже 1 ₽", () => {
    const low = run({ type: "ads_bid", campaignId: "111", direction: "lower", stepPercent: 10, reason: "r" });
    assert.deepEqual(low.proposal?.action, { type: "bid", advertId: "111", nmId: "1", bidRub: 270, previousBidRub: 300 });
    const tiny = run({ type: "ads_bid", campaignId: "111", direction: "lower", stepPercent: 20, reason: "r" }, product({ ads: [{ campaignId: "111", name: "К", status: 9, statusLabel: "", searchRub: 1, recommendationsRub: 0, budget: null }] }));
    assert.equal(tiny.proposal, null); // ставка уже минимальна
    const up = run({ type: "ads_bid", campaignId: "111", direction: "raise", stepPercent: 20, reason: "r" });
    assert.equal((up.proposal!.action as { bidRub: number }).bidRub, 360);
  });
  it("кампании нет или ставка неизвестна: предложения нет, причина названа", () => {
    assert.match(run({ type: "ads_bid", campaignId: "999", direction: "raise", stepPercent: 5, reason: "r" }).skip ?? "", /кампании больше нет/);
    assert.match(run({ type: "ads_bid", campaignId: "111", direction: "raise", stepPercent: 5, reason: "r" }, product({ ads: [{ campaignId: "111", name: "К", status: 9, statusLabel: "", searchRub: null, recommendationsRub: null, budget: null }] })).skip ?? "", /неизвестна/);
  });
  it("тестовая кампания создаётся без запуска", () => {
    const made = run({ type: "ads_create_test", reason: "r" });
    assert.equal(made.proposal?.action.type, "create_campaign");
    assert.match(made.proposal!.effect, /без запуска/);
  });
});

describe("шаг плана: правка карточки", () => {
  const card = { description: "Старое описание ведра, которое мы заменяем", brand: "", category: "" };
  const edit = (field: "title" | "description", text: string): PlanAction => ({ type: "content_edit", field, text, reason: "слабое название" });
  it("предложение показывает «было → станет», прежний текст сохранён для отката", () => {
    const made = run(edit("title", "Ведро строительное оцинкованное 12 л"), product({ card }));
    assert.equal(made.proposal?.action.type, "content");
    const a = made.proposal!.action as { previousText: string; text: string };
    assert.equal(a.previousText, "Ведро");
    assert.match(made.proposal!.facts.join(" "), /Было: Ведро/);
    assert.match(made.proposal!.facts.join(" "), /Станет: Ведро строительное/);
  });
  it("текст уже такой или прежний текст неизвестен: предложения нет", () => {
    assert.match(run(edit("title", "Ведро")).skip ?? "", /уже такой/);
    assert.match(run(edit("description", "Новое описание ведра, достаточно длинное"), product({ card: { description: "", brand: "", category: "" } })).skip ?? "", /неизвестен/);
  });
});

describe("характеристики карточки для ИИ", () => {
  it("значения заполненных характеристик читаются из ответа WB: пустые пропускаются, значения обрезаются", async () => {
    const { filledCharacteristicValues } = await import("@/lib/services/wildberries/content-client");
    const rows = [
      { name: "Материал", value: ["сталь оцинкованная"] },
      { name: "Цвет", value: [] },
      { name: "Объем", value: 12 },
      { name: "Длинное", value: ["x".repeat(500)] },
    ];
    const out = filledCharacteristicValues(rows)!;
    assert.deepEqual(out.slice(0, 2), [{ name: "Материал", value: "сталь оцинкованная" }, { name: "Объем", value: "12" }]);
    assert.equal(out.find((r) => r.name === "Длинное")!.value.length, 120);
    assert.equal(out.some((r) => r.name === "Цвет"), false);
  });
});

describe("шаг плана: выход из акции", () => {
  const withPromo = product({ promos: [{ promoId: "777", name: "Осенняя распродажа", endAt: null, cohort: "loss", marginPromoPercent: -4, planPrice: 900 }] });
  it("предложение показывает маржу в акции и честно говорит, что вернуть можно только вручную", () => {
    const made = run({ type: "promo_exit", promoId: "777", reason: "маржа в акции отрицательная" }, withPromo);
    assert.deepEqual(made.proposal?.action, { type: "promo_exit", promoId: "777", promoName: "Осенняя распродажа", nmId: "1" });
    assert.match(made.proposal!.facts.join(" "), /Маржа в акции: -4%/);
    assert.match(made.proposal!.effect, /вручную/);
  });
  it("товар уже не в акции: предложения нет", () => {
    assert.match(run({ type: "promo_exit", promoId: "777", reason: "r" }).skip ?? "", /уже не участвует/);
  });
});

describe("шаги плана: Клуб, вход в акцию, реклама", () => {
  const priced = (over: Partial<ScenarioProduct> = {}) => product({ base: 1250, discount: 20, breakEvenPrice: 700, clubDiscount: 5, ...over });
  it("скидка Клуба: считается от текущей; рост не пускает цену для Клуба ниже безубыточной", () => {
    const up = run({ type: "club_discount", direction: "raise", stepPercent: 2, reason: "r" }, priced());
    assert.deepEqual(up.proposal?.action, { type: "club_discount", nmId: "1", clubPercent: 7, previousPercent: 5 });
    assert.equal((up.proposal!.meta as { strategy: { price: boolean } }).strategy.price, true);
    const tight = run({ type: "club_discount", direction: "raise", stepPercent: 3, reason: "r" }, priced({ breakEvenPrice: 990 }));
    assert.match(tight.skip ?? "", /ниже безубыточной/);
    assert.match(run({ type: "club_discount", direction: "raise", stepPercent: 1, reason: "r" }, priced({ breakEvenPrice: null })).skip ?? "", /безубыточная цена неизвестна/);
    assert.deepEqual(run({ type: "club_discount", direction: "lower", stepPercent: 3, reason: "r" }, priced()).proposal?.action, { type: "club_discount", nmId: "1", clubPercent: 2, previousPercent: 5 });
  });
  it("вход в акцию: условия перепроверяются по свежим данным (маржа, убыток, цена акции)", () => {
    const open = { promoId: "55", name: "Акция", endAt: "2026-11-10T00:00:00Z", cohort: "boost" as const, marginPromoPercent: 12, planPrice: 900, planDiscount: 28 };
    const made = run({ type: "promo_join", promoId: "55", reason: "r" }, priced({ promoOpen: [open] }));
    assert.equal(made.proposal?.action.type, "promo_join");
    assert.match(made.proposal!.facts.join(" "), /Маржа в акции: 12%/);
    assert.match(run({ type: "promo_join", promoId: "55", reason: "r" }, priced({ promoOpen: [{ ...open, marginPromoPercent: 3 }] })).skip ?? "", /ниже 5%/);
    assert.match(run({ type: "promo_join", promoId: "55", reason: "r" }, priced({ promoOpen: [{ ...open, cohort: "loss" }] })).skip ?? "", /убыток/);
    assert.match(run({ type: "promo_join", promoId: "55", reason: "r" }, priced({ promoOpen: [{ ...open, marginPromoPercent: null }] })).skip ?? "", /маржа в акции неизвестна/);
    assert.match(run({ type: "promo_join", promoId: "55", reason: "r" }).skip ?? "", /больше не открыта/);
  });
  it("реклама: убрать товар, добавить в другую кампанию, пополнить", () => {
    assert.equal(run({ type: "ads_remove_nm", campaignId: "111", reason: "r" }).proposal?.action.type, "remove_nm");
    const add = run({ type: "ads_add_nm", campaignId: "222", reason: "r" }, product({ adsOther: [{ campaignId: "222", name: "Другая", status: 9, statusLabel: "Активна" }] }));
    assert.deepEqual(add.proposal?.action, { type: "add_nm", campaignId: "222", nmId: "1" });
    assert.match(run({ type: "ads_add_nm", campaignId: "222", reason: "r" }).skip ?? "", /уже в этой кампании/);
    assert.deepEqual(run({ type: "ads_deposit", campaignId: "111", sumRub: 1000, reason: "r" }).proposal?.action, { type: "deposit", campaignId: "111", sumRub: 1000 });
  });
  it("выход из акции честно называет сброс скидки и рост цены", () => {
    const made = run({ type: "promo_exit", promoId: "777", reason: "r" }, product({ base: 1250, discount: 20, promos: [{ promoId: "777", name: "Распродажа", endAt: null, cohort: "loss", marginPromoPercent: -4, planPrice: 900 }] }));
    assert.match(made.proposal!.effect, /скидку продавца до 0%/);
    assert.match(made.proposal!.effect, /1000 ₽ примерно до 1250 ₽/);
    assert.equal(made.proposal!.risk, "high");
  });
});

describe("шаги плана: минус-фразы и места показа", () => {
  const withQueries = (action: PlanAction, queries?: import("./ads-queries").AdQuery[]) => adsStepProposal({ ref: ref(action), findingId: "f1", nmId: "1", planTitle: "План", goal: "Цель", product: product(), adQueries: queries });
  const q = (query: string, orders = 0) => ({ campaignId: "111", query, views: 100, clicks: 5, orders, addToCart: 0 });
  it("минус-фразы: только запросы, которые и сейчас без заказов; показывает трафик по каждому", () => {
    const made = withQueries({ type: "ads_minus_phrases", campaignId: "111", queries: ["ведро пластиковое", "лопата"], reason: "r" }, [q("ведро пластиковое")]);
    assert.deepEqual(made.proposal?.action, { type: "minus_phrases", advertId: "111", nmId: "1", queries: ["ведро пластиковое"] });
    assert.match(made.proposal!.facts.join(" "), /100 показов, 5 кликов, заказов 0/);
    assert.match(withQueries({ type: "ads_minus_phrases", campaignId: "111", queries: ["лопата"], reason: "r" }, [q("другое")]).skip ?? "", /появились заказы или трафик пропал/);
    assert.match(withQueries({ type: "ads_minus_phrases", campaignId: "111", queries: ["лопата"], reason: "r" }).skip ?? "", /не прочитаны/);
  });
  it("места показа: предложение хранит прежние значения для отката; ничего не изменится — предложения нет", () => {
    const p = product({ ads: [{ campaignId: "111", name: "К", status: 9, statusLabel: "Активна", searchRub: 300, recommendationsRub: 0, budget: 1, placements: { search: true, recommendations: true } }] });
    const made = adsStepProposal({ ref: ref({ type: "ads_placements", campaignId: "111", search: true, recommendations: false, reason: "r" }), findingId: "f1", nmId: "1", planTitle: "П", goal: "Ц", product: p });
    assert.deepEqual(made.proposal?.action, { type: "placements", advertId: "111", search: true, recommendations: false, previousSearch: true, previousRecommendations: true });
    const same = adsStepProposal({ ref: ref({ type: "ads_placements", campaignId: "111", search: true, recommendations: true, reason: "r" }), findingId: "f1", nmId: "1", planTitle: "П", goal: "Ц", product: p });
    assert.match(same.skip ?? "", /уже такие/);
  });
});

describe("шаг плана: характеристики карточки", () => {
  const withCharcs = product({
    card: { description: "", brand: "", category: "", characteristics: [{ id: 10, name: "Материал", value: "железо" }], categoryCharcs: [{ id: 10, name: "Материал", required: true, type: 1, unit: null, maxCount: 1 }, { id: 11, name: "Объем", required: false, type: 4, unit: "л", maxCount: 1 }] },
  });
  it("показывает «было → станет», пустую характеристику называет «не заполнено», прежние значения сохраняет для отката", () => {
    const made = run({ type: "characteristics_edit", changes: [{ charcId: 10, value: "сталь" }, { charcId: 11, value: 12 }], reason: "r" }, withCharcs);
    const a = made.proposal!.action as { type: string; changes: Array<{ charcId: number; previous: string | null; numeric: boolean }> };
    assert.equal(a.type, "characteristics");
    assert.deepEqual(a.changes.map((c) => [c.charcId, c.previous, c.numeric]), [[10, "железо", false], [11, null, true]]);
    assert.match(made.proposal!.facts.join(" "), /Объем: не заполнено → 12/);
  });
  it("значения уже такие или характеристики нет у категории: предложения нет", () => {
    assert.match(run({ type: "characteristics_edit", changes: [{ charcId: 10, value: "Железо" }], reason: "r" }, withCharcs).skip ?? "", /уже такие/);
    assert.match(run({ type: "characteristics_edit", changes: [{ charcId: 99, value: "x" }], reason: "r" }, withCharcs).skip ?? "", /уже такие/);
  });
});
