import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { ACTION_SPECS, actionSpec, canRevert, irreversibleWarning, revertAction } from "./actions";

const price: AgentAction = { type: "price", nmId: "1", targetRub: 950, baseRub: 1188, discount: 20, currentRub: 1000, currentBaseRub: 1250 };

describe("реестр действий агента", () => {
  it("правка характеристик откатывается, только если все прежние значения известны", () => {
    const edit: AgentAction = { type: "characteristics", nmId: "1", changes: [{ charcId: 5, name: "Материал", value: "сталь", numeric: false, previous: "железо" }, { charcId: 6, name: "Объем", value: 12, numeric: true, previous: "10" }] };
    const back = revertAction(edit) as Extract<AgentAction, { type: "characteristics" }>;
    assert.deepEqual(back.changes.map((c) => [c.charcId, c.value, c.previous]), [[5, "железо", "сталь"], [6, 10, "12"]]);
    assert.equal(revertAction({ ...edit, changes: [{ ...edit.changes[0]!, previous: null }] }), null);
  });
  it("скидка Клуба откатывается прежним процентом, вход в акцию через API не откатывается", () => {
    const club: AgentAction = { type: "club_discount", nmId: "1", clubPercent: 7, previousPercent: 5 };
    assert.deepEqual(revertAction(club), { type: "club_discount", nmId: "1", clubPercent: 5, previousPercent: 7 });
    assert.equal(revertAction({ ...club, previousPercent: null }), null);
    const join: AgentAction = { type: "promo_join", promoId: "9", promoName: "Акция", nmId: "1", planPrice: 900, planDiscount: 30, basePrice: 1250, discountedPrice: 1000, discountPercent: 20 };
    assert.equal(revertAction(join), null);
    assert.equal(actionSpec(join).risk, "high");
  });
  it("правка карточки: откат возвращает прежний текст, а без прежнего текста вернуть нельзя", () => {
    const edit: AgentAction = { type: "content", nmId: "1", field: "title", text: "Новое название ведра 12 л", previousText: "Ведро" };
    assert.deepEqual(revertAction(edit), { type: "content", nmId: "1", field: "title", text: "Ведро", previousText: "Новое название ведра 12 л" });
    assert.equal(revertAction({ ...edit, previousText: "  " }), null);
    assert.equal(actionSpec(edit).autoEligible, false);
    assert.equal(actionSpec(edit).needsFreshnessCheck, true);
  });

  it("у каждого вида действия есть описание", () => {
    const types: AgentAction["type"][] = ["deposit", "pause", "resume", "remove_nm", "add_nm", "bid", "create_campaign", "price", "content", "promo_exit", "promo_join", "club_discount", "minus_phrases", "placements", "daily_limit", "characteristics"];
    for (const type of types) assert.ok(ACTION_SPECS[type].label.length > 0, type);
    assert.equal(Object.keys(ACTION_SPECS).length, types.length);
  });

  it("цена — высокий риск и никогда не автоматическое действие", () => {
    assert.equal(actionSpec(price).risk, "high");
    assert.equal(actionSpec(price).autoEligible, false);
    assert.equal(actionSpec(price).needsFreshnessCheck, true);
  });

  it("откат цены возвращает прежнюю базовую цену и скидку, и откат отката даёт исходное действие", () => {
    const back = revertAction(price);
    assert.deepEqual(back, { type: "price", nmId: "1", targetRub: 1000, baseRub: 1250, discount: 20, currentRub: 950, currentBaseRub: 1188 });
    const again = revertAction(back!);
    assert.equal(again && again.type === "price" ? again.baseRub : null, 1188);
  });

  it("откат цены невозможен без прежней базовой цены, человеку об этом говорят заранее", () => {
    const unknown: AgentAction = { ...price, currentBaseRub: null } as AgentAction;
    assert.equal(revertAction(unknown), null);
    assert.equal(canRevert(unknown), false);
    assert.match(irreversibleWarning(unknown) ?? "", /Не хватает данных/);
  });

  it("пауза и запуск обратны друг другу", () => {
    assert.deepEqual(revertAction({ type: "pause", campaignId: "5" }), { type: "resume", campaignId: "5" });
    assert.deepEqual(revertAction({ type: "resume", campaignId: "5" }), { type: "pause", campaignId: "5" });
  });

  it("товар убрали из кампании — откат возвращает его, и наоборот", () => {
    assert.deepEqual(revertAction({ type: "remove_nm", campaignId: "5", nmId: "9" }), { type: "add_nm", campaignId: "5", nmId: "9" });
    assert.deepEqual(revertAction({ type: "add_nm", campaignId: "5", nmId: "9" }), { type: "remove_nm", campaignId: "5", nmId: "9" });
    assert.equal(actionSpec({ type: "remove_nm", campaignId: "5", nmId: "9" }).reversibility, "partial");
  });

  it("откат ставки возвращает прежнюю ставку; без прежней откат невозможен", () => {
    const bid: AgentAction = { type: "bid", advertId: "5", nmId: "9", bidRub: 120, previousBidRub: 100 };
    assert.deepEqual(revertAction(bid), { type: "bid", advertId: "5", nmId: "9", bidRub: 100, previousBidRub: 120 });
    assert.equal(revertAction({ type: "bid", advertId: "5", nmId: "9", bidRub: 120 }), null);
  });

  it("пополнение бюджета вернуть нельзя, и человек предупреждается заранее", () => {
    const deposit: AgentAction = { type: "deposit", campaignId: "5", sumRub: 1000 };
    assert.equal(revertAction(deposit), null);
    assert.match(irreversibleWarning(deposit) ?? "", /Вернуть это действие нельзя/);
  });

  it("безопасная автоматика допустима только для паузы, удаления товара из кампании, минус-фраз и пополнения в лимитах", () => {
    const auto = (Object.keys(ACTION_SPECS) as AgentAction["type"][]).filter((t) => ACTION_SPECS[t].autoEligible).sort();
    assert.deepEqual(auto, ["deposit", "minus_phrases", "pause", "remove_nm"]);
  });
});

describe("дневной лимит кампании", () => {
  it("откатывается к прежнему состоянию, если оно известно", () => {
    const a: AgentAction = { type: "daily_limit", campaignId: "1", enabled: true, limitRub: 2000, carryOver: false, previous: { enabled: true, limitRub: 3000, carryOver: true } };
    assert.deepEqual(revertAction(a), { type: "daily_limit", campaignId: "1", enabled: true, limitRub: 3000, carryOver: true, previous: { enabled: true, limitRub: 2000, carryOver: false } });
    assert.equal(revertAction({ ...a, previous: null } as AgentAction), null);
  });
});
