import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { algorithmView, applySecondOpinion, observerFingerprint, parseObserver, parseObserverReview, shouldRunObserver, type ObserverInput, type ObserverFinding } from "./ai-observer";

const input = (): ObserverInput => ({
  profile: { sku_total: 2, orders_28d_total: 20 },
  products: [
    { nmId: "1", title: "Ведро", facts: { orders_28d: 15, orders_prev_28d: 9, margin_pct: -15.5, price_buyer: 996, break_even: 1217 } },
    { nmId: "2", title: "Лопата", facts: { orders_28d: 5 } },
  ],
  tasks: [
    { type: "LOSS", title: "Убыточная цена", nmId: "1", severity: "important" },
    { type: "X", title: "Контент карточки ниже порога", nmId: "1", severity: "opportunity" },
  ],
  events: [],
  recentTitles: [],
  nowIso: "2026-10-28T10:00:00Z",
});

const finding = (over: Record<string, unknown> = {}) => ({ nmId: "1", kind: "money", severity: "important", title: "Продажи в убыток", what: "w", whyNow: "n", evidence: [{ key: "margin_pct", value: -15.5 }], humanAdvice: "a", ...over });
const reply = (findings: unknown[], verdict = "findings") => JSON.stringify({ verdict, summary: "итог", findings });

describe("ИИ-наблюдатель: разбор ответа", () => {
  it("находка с верными цифрами принимается", () => {
    const r = parseObserver("```json\n" + reply([finding()]) + "\n```", input());
    assert.equal(r.verdict, "findings");
    assert.equal(r.findings.length, 1);
    assert.equal(r.dropped, 0);
  });
  it("выдуманная цифра, неизвестный товар, пустые основания и чужой вид отбрасываются", () => {
    const bad = [finding({ evidence: [{ key: "margin_pct", value: -3 }] }), finding({ nmId: "999" }), finding({ evidence: [] }), finding({ kind: "magic" }), finding({ title: "" })];
    const r = parseObserver(reply(bad), input());
    assert.equal(r.findings.length, 0);
    assert.equal(r.dropped, 5);
    assert.equal(r.verdict, "quiet");
  });
  it("находка по кабинету сверяется с профилем магазина", () => {
    const ok = parseObserver(reply([finding({ nmId: null, kind: "store_level", evidence: [{ key: "orders_28d_total", value: 20 }] })]), input());
    assert.equal(ok.findings.length, 1);
    const bad = parseObserver(reply([finding({ nmId: null, kind: "store_level", evidence: [{ key: "orders_28d_total", value: 90 }] })]), input());
    assert.equal(bad.findings.length, 0);
  });
  it("тишина и мусор вместо ответа не создают находок", () => {
    assert.equal(parseObserver(reply([], "quiet"), input()).verdict, "quiet");
    assert.equal(parseObserver("не json", input()).findings.length, 0);
  });
  it("не больше пяти находок", () => {
    const many = Array.from({ length: 8 }, (_, i) => finding({ title: `Н${i}` }));
    assert.equal(parseObserver(reply(many), input()).findings.length, 5);
  });
});

describe("ИИ-наблюдатель: второй ИИ и взгляд алгоритма", () => {
  const f = (severity: "watch" | "important"): ObserverFinding => ({ nmId: "1", kind: "money", severity, title: "t", what: "", whyNow: "", evidence: [], humanAdvice: "", action: { type: "price", direction: "raise", stepPercent: 2, reason: "r" } });
  it("отвергнутая важная находка пропадает, спорная понижается, согласованная остаётся", () => {
    const out = applySecondOpinion([f("important"), f("important"), f("important"), f("watch")], [{ verdict: "reject", reason: "r" }, { verdict: "dispute", reason: "d" }, { verdict: "agree", reason: "a" }, null]);
    assert.equal(out.length, 3);
    assert.equal(out[0]!.severity, "watch");
    assert.equal(out[0]!.second, "dispute");
    assert.equal(out[1]!.second, "agree");
    assert.equal(out[2]!.second, "not_checked");
    // действие остаётся только у согласованной находки
    assert.equal(out[0]!.action, null);
    assert.equal(out[1]!.action?.type, "price");
    assert.equal(out[2]!.action, null);
  });
  it("действие из ответа ИИ: только по товару, только цена, ступень 1–3", () => {
    const act = (a: unknown, nmId: string | null = "1") => parseObserver(reply([finding({ action: a, nmId, kind: nmId ? "money" : "store_level", evidence: nmId ? [{ key: "margin_pct", value: -15.5 }] : [{ key: "orders_28d_total", value: 20 }] })]), input()).findings[0]?.action ?? null;
    assert.deepEqual(act({ type: "price", direction: "raise", stepPercent: 2, reason: "r" }), { type: "price", direction: "raise", stepPercent: 2, reason: "r" });
    assert.equal(act({ type: "price", direction: "raise", stepPercent: 9 }), null);
    assert.equal(act({ type: "delete_card", direction: "raise", stepPercent: 1 }), null);
    assert.equal(act({ type: "price", direction: "raise", stepPercent: 1 }, null), null);
  });
  it("нет ответа второго ИИ: находка остаётся без отметки проверки", () => {
    assert.equal(applySecondOpinion([f("important")], null)[0]!.second, "not_checked");
  });
  it("разбор ответа проверяющего: пропуск и неизвестный вердикт дают осторожное сомнение", () => {
    const v = parseObserverReview(JSON.stringify({ review: [{ index: 0, verdict: "agree", reason: "ok" }, { index: 1, verdict: "???" }] }), [f("important"), f("important"), f("important")]);
    assert.equal(v[0]!.verdict, "agree");
    assert.equal(v[1]!.verdict, "dispute");
    assert.equal(v[2], null);
  });
  it("алгоритм видит только связанные по смыслу задачи", () => {
    const view = algorithmView({ nmId: "1", kind: "money" }, input().tasks);
    assert.equal(view.covered, true);
    assert.deepEqual(view.tasks, ["Убыточная цена"]);
    assert.equal(view.otherTasks, 1);
    assert.equal(algorithmView({ nmId: "1", kind: "reviews" }, input().tasks).covered, false);
  });
});

describe("ИИ-наблюдатель: когда запускать", () => {
  const base = { lastFingerprint: "a", fingerprint: "a" };
  const H = 3_600_000;
  it("первый запуск", () => assert.equal(shouldRunObserver({ ...base, lastRunMs: null, nowMs: 0 }).run, true));
  it("без изменений не запускать, кроме суточного обзора", () => {
    assert.equal(shouldRunObserver({ ...base, lastRunMs: 0, nowMs: 5 * H }).run, false);
    assert.equal(shouldRunObserver({ ...base, lastRunMs: 0, nowMs: 25 * H }).run, true);
  });
  it("картина изменилась: запуск не раньше чем через три часа", () => {
    assert.equal(shouldRunObserver({ lastFingerprint: "a", fingerprint: "b", lastRunMs: 0, nowMs: 1 * H }).run, false);
    assert.equal(shouldRunObserver({ lastFingerprint: "a", fingerprint: "b", lastRunMs: 0, nowMs: 4 * H }).run, true);
  });
  it("мелкий дрейф цифр не меняет отпечаток, заметный сдвиг и новое событие меняют", () => {
    const a = input();
    const drift = input();
    drift.products[0]!.facts.orders_28d = 15.4;
    assert.equal(observerFingerprint(a), observerFingerprint(drift));
    const shift = input();
    shift.products[0]!.facts.orders_28d = 30;
    assert.notEqual(observerFingerprint(a), observerFingerprint(shift));
    const withEvent = input();
    withEvent.events = [{ kind: "k", title: "t", detail: "", nmId: "1", at: "2026-10-28T09:00:00Z" }];
    assert.notEqual(observerFingerprint(a), observerFingerprint(withEvent));
  });
});
