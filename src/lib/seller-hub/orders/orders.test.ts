import assert from "node:assert/strict";
import { it } from "node:test";
import { computeNextRun, firstRun } from "./schedule";
import { orderSummary, scheduleText, validateOrderInput } from "./types";

// 2026-11-18 07:00 UTC = 10:00 по Москве (среда)
const NOW = Date.parse("2026-11-18T07:00:00Z");

it("daily: сегодня, если время ещё не прошло, иначе завтра (по Москве)", () => {
  assert.equal(computeNextRun({ type: "daily", time: "12:00" }, NOW, 0), "2026-11-18T09:00:00.000Z");
  assert.equal(computeNextRun({ type: "daily", time: "09:00" }, NOW, 0), "2026-11-19T06:00:00.000Z");
});

it("weekly: ближайший подходящий день недели", () => {
  // среда 18.11; пятница (5) в 09:30 МСК = 06:30 UTC 20.11
  assert.equal(computeNextRun({ type: "weekly", time: "09:30", weekdays: [1, 5] }, NOW, 0), "2026-11-20T06:30:00.000Z");
  // понедельник (1) → 23.11
  assert.equal(computeNextRun({ type: "weekly", time: "09:30", weekdays: [1] }, NOW, 0), "2026-11-23T06:30:00.000Z");
  // сегодня (3) позже по времени
  assert.equal(computeNextRun({ type: "weekly", time: "18:00", weekdays: [3] }, NOW, 0), "2026-11-18T15:00:00.000Z");
});

it("once: один запуск и конец; every и check идут от текущего момента", () => {
  const at = "2026-11-20T10:00:00.000Z";
  assert.equal(computeNextRun({ type: "once", at }, NOW, 0), at);
  assert.equal(computeNextRun({ type: "once", at }, NOW, 1), null);
  assert.equal(computeNextRun({ type: "every", everyHours: 6 }, NOW, 3), "2026-11-18T13:00:00.000Z");
  assert.equal(computeNextRun({ type: "check", everyMinutes: 30 }, NOW, 5), "2026-11-18T07:30:00.000Z");
  assert.equal(firstRun({ type: "check", everyMinutes: 30 }, NOW), "2026-11-18T07:01:00.000Z");
});

it("maxRuns и until завершают поручение", () => {
  assert.equal(computeNextRun({ type: "daily", time: "12:00", maxRuns: 7 }, NOW, 7), null);
  assert.equal(computeNextRun({ type: "daily", time: "12:00", maxRuns: 7 }, NOW, 6), "2026-11-18T09:00:00.000Z");
  assert.equal(computeNextRun({ type: "daily", time: "12:00", until: "2026-11-18T08:00:00Z" }, NOW, 0), null);
});

it("проверка: пополнение без суточного лимита не создаётся", () => {
  const base = { title: "Пополнять", kind: "ads_deposit", params: { campaignId: "123", belowRub: 500, topUpRub: 2000 }, schedule: { type: "check", everyMinutes: 60 }, mode: "act" };
  assert.equal(validateOrderInput({ ...base, limits: {} }).ok, false);
  const ok = validateOrderInput({ ...base, limits: { maxPerDayRub: 6000 } });
  assert.equal(ok.ok, true);
  assert.equal(validateOrderInput({ ...base, limits: { maxPerDayRub: 1000 } }).ok, false);
});

it("проверка: снижение цены требует нижней границы, шаг 1-20%", () => {
  const base = { title: "Снижать", kind: "price_step", params: { nmIds: ["12345678"], pct: 5, direction: "down" }, schedule: { type: "daily", time: "10:00", maxRuns: 7 }, mode: "act" };
  assert.equal(validateOrderInput({ ...base, limits: {} }).ok, false);
  assert.equal(validateOrderInput({ ...base, limits: { minBuyerPriceRub: 900 } }).ok, true);
  assert.equal(validateOrderInput({ ...base, params: { ...base.params, pct: 50 }, limits: { minBuyerPriceRub: 900 } }).ok, false);
  assert.equal(validateOrderInput({ ...base, schedule: { type: "check", everyMinutes: 30 }, limits: { minBuyerPriceRub: 900 } }).ok, false);
});

it("напоминание: текст обязателен, режим всегда «напомнить»; фразы для списка", () => {
  assert.equal(validateOrderInput({ title: "Поставка", kind: "remind", params: { text: "" }, schedule: { type: "weekly", time: "10:00", weekdays: [5] } }).ok, false);
  const r = validateOrderInput({ title: "Поставка", kind: "remind", params: { text: "Собрать поставку" }, schedule: { type: "weekly", time: "10:00", weekdays: [5] }, mode: "act" });
  assert.equal(r.ok && r.value.mode, "ask");
  assert.equal(scheduleText({ type: "weekly", time: "10:00", weekdays: [1, 5] }), "по пн, пт в 10:00");
  assert.match(orderSummary({ kind: "price_step", params: { nmIds: ["12345678"], pct: 5, direction: "down" }, limits: { minBuyerPriceRub: 900 }, mode: "act" }), /Снижать цену на 5%.*не ниже 900/);
});

it("сценарий по заказам: проверка полей и лимит для пополнения", () => {
  const base = { title: "Мало заказов", kind: "when_orders", schedule: { type: "check", everyMinutes: 180 } };
  assert.equal(validateOrderInput({ ...base, params: { belowOrders: 20, days: 3, then: "notify" }, limits: {} }).ok, true);
  assert.equal(validateOrderInput({ ...base, params: { belowOrders: 0, days: 3, then: "notify" } }).ok, false);
  assert.equal(validateOrderInput({ ...base, params: { belowOrders: 20, days: 3, then: "deposit", campaignId: "1", topUpRub: 500 }, limits: {} }).ok, false);
  assert.equal(validateOrderInput({ ...base, params: { belowOrders: 20, days: 3, then: "deposit", campaignId: "1", topUpRub: 1000 }, limits: { maxPerDayRub: 1000 }, mode: "act" }).ok, true);
  // каждый день в выбранное время тоже можно, а по дням недели или разово нельзя
  assert.equal(validateOrderInput({ ...base, schedule: { type: "daily", time: "10:00" }, params: { belowOrders: 20, days: 3, then: "notify" } }).ok, true);
  assert.equal(validateOrderInput({ ...base, schedule: { type: "weekly", time: "10:00", weekdays: [1] }, params: { belowOrders: 20, days: 3, then: "notify" } }).ok, false);
  assert.match(orderSummary({ kind: "when_orders", params: { belowOrders: 20, days: 4, then: "notify" }, limits: {}, mode: "ask" }), /меньше 20 в сутки 4 дня подряд, сообщить/);
});

import { BASE_FORM, inputFromForm, defaultOnce } from "./form";
import { SORTED_TEMPLATES, templateSchedule } from "./templates";
import { upcomingRuns } from "./preview";
import { parseSchedule } from "./types";

it("каждый шаблон после минимальной настройки создаётся и имеет ближайший запуск", () => {
  assert.ok(SORTED_TEMPLATES.length >= 20);
  const ids = new Set<string>();
  for (const t of SORTED_TEMPLATES) {
    assert.equal(ids.has(t.id), false, `повтор id ${t.id}`);
    ids.add(t.id);
    // Что человек обязан указать сам: товары и границу цены, кампанию.
    const form = { ...BASE_FORM, onceAt: defaultOnce(), campaignId: "123456", ...t.form, ...(t.form.kind === "price_step" ? { nmIds: ["999504771"], boundRub: 900 } : {}) };
    const input = inputFromForm(form);
    const v = validateOrderInput(input);
    assert.equal(v.ok, true, `шаблон «${t.title}»: ${v.ok ? "" : v.error}`);
    if (v.ok && v.value.schedule.type !== "check") {
      const s = parseSchedule(v.value.schedule);
      assert.equal(s.ok, true);
      assert.ok(upcomingRuns(v.value.schedule, Date.now(), 1).length === 1, `шаблон «${t.title}» без ближайшего запуска`);
    }
    assert.ok(templateSchedule(t.form).length > 0);
  }
});

it("срок «N дней» превращается в конец срока по московским суткам", () => {
  const r = parseSchedule({ type: "daily", time: "09:00", durationDays: 14 });
  assert.ok(r.ok && r.value.type === "daily" && r.value.until);
  if (r.ok && r.value.type === "daily" && r.value.until) {
    const days = (Date.parse(r.value.until) - Date.now()) / 86_400_000;
    assert.ok(days > 13 && days <= 14.01, `осталось ${days} суток`);
    // конец срока приходится на полночь по Москве
    assert.equal((Date.parse(r.value.until) + 3 * 3_600_000) % 86_400_000, 0);
  }
  const c = parseSchedule({ type: "check", everyMinutes: 180, durationDays: 7 });
  assert.ok(c.ok && c.value.type === "check" && c.value.until);
  assert.equal(parseSchedule({ type: "daily", time: "09:00", durationDays: 0 }).ok, true);
});
