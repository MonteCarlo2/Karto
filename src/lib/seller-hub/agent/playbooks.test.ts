import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_PLAYBOOK_STATE, evaluatePlaybook, type PlaybookSignals, type PlaybookState } from "./playbooks";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const sig = (over: Partial<PlaybookSignals> = {}): PlaybookSignals => ({
  nmId: "1",
  buyerPrice: 1000,
  oosDays: 40,
  turnoverDays: 40,
  cartPercent: 4.5,
  cartSample: 1000,
  declineDays: 0,
  riseDays: 0,
  recentNegative: false,
  trendKnown: true,
  ...over,
});

const run = (id: Parameters<typeof evaluatePlaybook>[0], s: PlaybookSignals, state: PlaybookState = EMPTY_PLAYBOOK_STATE) => evaluatePlaybook(id, s, state, NOW);

describe("защита наличия (перекрывает всё)", () => {
  it("до нуля ≤7 дней +7%, 8–14 дней +5%, дальше нет", () => {
    assert.equal(run("grow_no_price_war", sig({ oosDays: 5 })).stepPercent, 7);
    assert.equal(run("grow_no_price_war", sig({ oosDays: 7 })).stepPercent, 7);
    assert.equal(run("grow_no_price_war", sig({ oosDays: 10 })).stepPercent, 5);
    assert.equal(run("grow_no_price_war", sig({ oosDays: 14 })).stepPercent, 5);
    assert.notEqual(run("grow_no_price_war", sig({ oosDays: 15 })).stepPercent, 5);
  });

  it("перекрывает негатив и падение заказов", () => {
    const res = run("grow_no_price_war", sig({ oosDays: 6, recentNegative: true, declineDays: 9, turnoverDays: 200 }));
    assert.equal(res.stepPercent, 7);
    assert.equal(res.reasons.length, 1);
    assert.equal(res.reasons[0]!.rule, "protect_stock");
  });

  it("у стратегии про негатив порог только 14 дней: +5%", () => {
    assert.equal(run("hold_conversion_on_negative", sig({ oosDays: 10 })).stepPercent, 5);
    assert.notEqual(run("hold_conversion_on_negative", sig({ oosDays: 5 })).stepPercent, 7);
  });

  it("неизвестные дни до нуля защиту не включают", () => {
    assert.equal(run("grow_no_price_war", sig({ oosDays: null })).stepPercent, 0);
  });
});

describe("тренд падения заказов", () => {
  it("3–4 дня −1%, 5–7 дней −2%, от 8 дней −3%", () => {
    assert.equal(run("grow_no_price_war", sig({ declineDays: 3 })).stepPercent, -1);
    assert.equal(run("grow_no_price_war", sig({ declineDays: 4 })).stepPercent, -1);
    assert.equal(run("grow_no_price_war", sig({ declineDays: 5 })).stepPercent, -2);
    assert.equal(run("grow_no_price_war", sig({ declineDays: 7 })).stepPercent, -2);
    assert.equal(run("grow_no_price_war", sig({ declineDays: 8 })).stepPercent, -3);
    assert.equal(run("grow_no_price_war", sig({ declineDays: 2 })).stepPercent, 0);
  });

  it("если данных для тренда мало, правило не срабатывает", () => {
    assert.equal(run("grow_no_price_war", sig({ declineDays: 9, trendKnown: false })).stepPercent, 0);
  });

  it("первое снижение запоминает опорную цену", () => {
    const res = run("grow_no_price_war", sig({ declineDays: 3 }));
    assert.equal(res.nextState.anchorBuyer, 1000);
  });

  it("у стратегии «поднять маржу» и «про негатив» только один шаг −1% на любой длине падения", () => {
    assert.equal(run("raise_margin", sig({ declineDays: 9 })).stepPercent, -1);
    assert.equal(run("hold_conversion_on_negative", sig({ declineDays: 9 })).stepPercent, -1);
  });

  it("в «снять завалы» правила тренда нет", () => {
    assert.equal(run("clear_overstock", sig({ declineDays: 9 })).stepPercent, 0);
  });
});

describe("оборачиваемость и завалы", () => {
  it("запас больше 60 дней: −1% раз в 3 дня", () => {
    const res = run("grow_no_price_war", sig({ turnoverDays: 75 }));
    assert.equal(res.stepPercent, -1);
    assert.equal(res.nextState.lastStepAt.turnover, new Date(NOW).toISOString());
    const tooSoon = run("grow_no_price_war", sig({ turnoverDays: 75 }), { anchorBuyer: 1010, lastStepAt: { turnover: ago(2) } });
    assert.equal(tooSoon.stepPercent, 0);
    const due = run("grow_no_price_war", sig({ turnoverDays: 75 }), { anchorBuyer: 1010, lastStepAt: { turnover: ago(3.1) } });
    assert.equal(due.stepPercent, -1);
  });

  it("завал: запас >90 даёт первый шаг −2%, дальше −1% раз в 3 дня, пока запас не станет ≤60 (между 60 и 90 распродажа продолжается)", () => {
    const first = run("clear_overstock", sig({ turnoverDays: 100 }));
    assert.equal(first.stepPercent, -2);
    assert.equal(first.nextState.overstockActive, true);
    const middle = run("clear_overstock", sig({ turnoverDays: 75 }), { anchorBuyer: 1000, lastStepAt: { turnover: ago(3.2) }, overstockActive: true });
    assert.equal(middle.stepPercent, -1);
    const waits = run("clear_overstock", sig({ turnoverDays: 75 }), { anchorBuyer: 1000, lastStepAt: { turnover: ago(1) }, overstockActive: true });
    assert.equal(waits.stepPercent, 0);
    const done = run("clear_overstock", sig({ turnoverDays: 58 }), { anchorBuyer: 1000, lastStepAt: { turnover: ago(5) }, overstockActive: true });
    assert.equal(done.nextState.overstockActive, false);
  });

  it("запас 75 дней без активной распродажи завалом не считается", () => {
    assert.equal(run("clear_overstock", sig({ turnoverDays: 75 })).stepPercent, 0);
  });

  it("завал по второму признаку: до нуля больше 45 дней и конверсия меньше 4%", () => {
    const res = run("clear_overstock", sig({ turnoverDays: 70, oosDays: 60, cartPercent: 3.5 }));
    assert.equal(res.stepPercent, -2);
  });
});

describe("негатив в отзывах", () => {
  it("временно −5% от прежней цены, повторно в тот же день не копится", () => {
    const first = run("grow_no_price_war", sig({ recentNegative: true }));
    assert.equal(first.stepPercent, -5);
    assert.equal(first.nextState.anchorBuyer, 1000);
    // На следующий день цена уже 950, уровень 950: ничего не делаем.
    const second = run("grow_no_price_war", sig({ recentNegative: true, buyerPrice: 950 }), { anchorBuyer: 1000, lastStepAt: {} });
    assert.equal(second.stepPercent, 0);
  });

  it("отзывы не прочитаны (null) — правило не срабатывает", () => {
    assert.equal(run("grow_no_price_war", sig({ recentNegative: null })).stepPercent, 0);
  });

  it("суточный кап: негатив и тренд вместе не опускают цену больше чем на 5% за день", () => {
    const res = run("grow_no_price_war", sig({ recentNegative: true, declineDays: 8 }));
    assert.equal(res.stepPercent, -5);
    assert.ok(res.reasons.some((r) => r.rule === "daily_cap"));
  });
});

describe("слабая конверсия", () => {
  it("меньше 3% — −1%, но не чаще раза в 7 дней", () => {
    assert.equal(run("grow_no_price_war", sig({ cartPercent: 2.5 })).stepPercent, -1);
    assert.equal(run("grow_no_price_war", sig({ cartPercent: 2.5 }), { anchorBuyer: 1010, lastStepAt: { cart: ago(3) } }).stepPercent, 0);
    assert.equal(run("grow_no_price_war", sig({ cartPercent: 2.5 }), { anchorBuyer: 1010, lastStepAt: { cart: ago(8) } }).stepPercent, -1);
  });

  it("конверсия неизвестна — правило не срабатывает", () => {
    assert.equal(run("grow_no_price_war", sig({ cartPercent: null })).stepPercent, 0);
  });
});

describe("восстановление к прежней цене", () => {
  const lowered: PlaybookState = { anchorBuyer: 1000, lastStepAt: {} };

  it("при выполненных условиях +1% в день, при росте заказов от 5 дней +2%", () => {
    const calm = sig({ buyerPrice: 950, cartPercent: 6, turnoverDays: 40, oosDays: 30 });
    assert.equal(run("grow_no_price_war", calm, lowered).stepPercent, 1);
    assert.equal(run("grow_no_price_war", { ...calm, riseDays: 5 }, lowered).stepPercent, 2);
  });

  it("шаг не перескакивает опорную цену", () => {
    const res = run("grow_no_price_war", sig({ buyerPrice: 995, cartPercent: 6, oosDays: 30 }), lowered);
    assert.ok(res.stepPercent > 0 && res.stepPercent <= 0.51, `шаг ${res.stepPercent}`);
  });

  it("пока конверсия ниже 5,5%, цена не возвращается", () => {
    const res = run("grow_no_price_war", sig({ buyerPrice: 950, cartPercent: 5 }), lowered);
    assert.equal(res.stepPercent, 0);
    assert.match(res.holdReason ?? "", /ждём/);
  });

  it("пока есть падение заказов или негатив, цена не возвращается", () => {
    assert.equal(run("grow_no_price_war", sig({ buyerPrice: 950, cartPercent: 6, declineDays: 1 }), lowered).stepPercent, 0);
    assert.equal(run("grow_no_price_war", sig({ buyerPrice: 950, cartPercent: 6, recentNegative: true }), lowered).stepPercent, 0);
  });

  it("цена вернулась к опорной — состояние сбрасывается", () => {
    const res = run("grow_no_price_war", sig({ buyerPrice: 1000 }), lowered);
    assert.equal(res.stepPercent, 0);
    assert.equal(res.nextState.anchorBuyer, null);
  });

  it("стратегия про негатив: выход после двух дней без негатива, конверсию не требует", () => {
    const state: PlaybookState = { anchorBuyer: 1000, lastStepAt: {}, negativeClearSince: ago(1) };
    const early = run("hold_conversion_on_negative", sig({ buyerPrice: 950, cartPercent: 4 }), state);
    assert.equal(early.stepPercent, 0);
    const later = run("hold_conversion_on_negative", sig({ buyerPrice: 950, cartPercent: 4 }), { ...state, negativeClearSince: ago(2.5) });
    assert.equal(later.stepPercent, 1);
  });

  it("отметка «без негатива» ставится в первый чистый день и сбрасывается при новом негативе", () => {
    const set = run("hold_conversion_on_negative", sig({ recentNegative: false }));
    assert.equal(set.nextState.negativeClearSince, new Date(NOW).toISOString());
    const reset = run("hold_conversion_on_negative", sig({ recentNegative: true }), { anchorBuyer: null, lastStepAt: {}, negativeClearSince: ago(5) });
    assert.equal(reset.nextState.negativeClearSince, null);
  });
});

describe("повышение цены на силе", () => {
  const strong = sig({ cartPercent: 6.5, turnoverDays: 40, oosDays: 30 });

  it("конверсия выше 6%, нет падения, запас в норме: +2%, повторно через 3 дня", () => {
    assert.equal(run("raise_margin", strong).stepPercent, 2);
    assert.equal(run("raise_margin", strong, { anchorBuyer: null, lastStepAt: { raise: ago(1) } }).stepPercent, 0);
    assert.equal(run("raise_margin", strong, { anchorBuyer: null, lastStepAt: { raise: ago(3.5) } }).stepPercent, 2);
  });

  it("запаса не хватает (до нуля ≤21) — не повышаем", () => {
    assert.equal(run("raise_margin", { ...strong, oosDays: 20 }).stepPercent, 0);
  });

  it("свежий негатив или падение заказов останавливают повышение", () => {
    // Свежий негатив: вместо повышения — временное снижение на 5%.
    assert.equal(run("raise_margin", { ...strong, recentNegative: true }).stepPercent, -5);
    assert.equal(run("raise_margin", { ...strong, declineDays: 1 }).stepPercent, 0);
  });

  it("поддержка роста: заказы растут ≥3 дней, конверсия ≥5,5% — +1%", () => {
    const res = run("raise_margin", sig({ cartPercent: 5.8, riseDays: 4, turnoverDays: 40, oosDays: 30 }));
    assert.equal(res.stepPercent, 1);
  });

  it("у «grow_no_price_war» повышений нет", () => {
    assert.equal(run("grow_no_price_war", strong).stepPercent, 0);
  });

  it("«снять завалы»: при нормальном запасе, росте ≥3 дней и конверсии ≥6% — +1% раз в 3 дня", () => {
    const res = run("clear_overstock", sig({ cartPercent: 6.2, riseDays: 3, turnoverDays: 50, oosDays: 30 }));
    assert.equal(res.stepPercent, 1);
  });
});

describe("предел общего снижения", () => {
  it("цена не опускается больше чем на 20% от опорной", () => {
    const state: PlaybookState = { anchorBuyer: 1000, lastStepAt: {} };
    const near = run("grow_no_price_war", sig({ buyerPrice: 805, declineDays: 8 }), state); // шаг −3% дал бы 780,85 < 800
    assert.ok(near.stepPercent < 0 && near.stepPercent > -0.7, `шаг ${near.stepPercent}`);
    assert.ok(near.reasons.some((r) => r.rule === "total_cut_limit"));
  });
  it("на пределе дальше не снижаем и говорим, что нужна другая мера", () => {
    const res = run("grow_no_price_war", sig({ buyerPrice: 800, declineDays: 8 }), { anchorBuyer: 1000, lastStepAt: {} });
    assert.equal(res.stepPercent, 0);
    assert.match(res.holdReason ?? "", /предел снижения/);
  });
});

describe("достоверность конверсии", () => {
  it("мало просмотров: слабая конверсия цену не снижает, высокая не повышает", () => {
    assert.equal(run("grow_no_price_war", sig({ cartPercent: 0, cartSample: 40 })).stepPercent, 0);
    const strong = sig({ cartPercent: 21, cartSample: 60, turnoverDays: 40, oosDays: 30 });
    assert.equal(run("raise_margin", strong).stepPercent, 0);
    assert.equal(run("raise_margin", { ...strong, cartSample: 600 }).stepPercent, 2);
  });
  it("число просмотров неизвестно — конверсии не верим", () => {
    assert.equal(run("grow_no_price_war", sig({ cartPercent: 0, cartSample: null })).stepPercent, 0);
  });
});

describe("общие свойства", () => {
  it("состояние входа не изменяется, решение детерминировано", () => {
    const state: PlaybookState = { anchorBuyer: 1000, lastStepAt: { turnover: ago(5) } };
    const copy = JSON.parse(JSON.stringify(state));
    const a = run("grow_no_price_war", sig({ turnoverDays: 80 }), state);
    const b = run("grow_no_price_war", sig({ turnoverDays: 80 }), state);
    assert.deepEqual(a, b);
    assert.deepEqual(state, copy);
  });

  it("при нормальных показателях решение — «не менять» с причиной", () => {
    const res = run("grow_no_price_war", sig());
    assert.equal(res.stepPercent, 0);
    assert.ok(res.holdReason);
  });
});
