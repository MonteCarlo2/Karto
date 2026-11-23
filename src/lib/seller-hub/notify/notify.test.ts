import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { itemFromEvent, itemFromPlanFinished, itemFromRun, itemFromTask, telegramBlock, telegramMessages, type NotifyItem } from "./compose";
import { planDelivery, type QueueRow } from "./dispatch";
import { DEFAULT_NOTIFY_PREFS, heldByQuiet, isQuietNow, parseNotifyPrefs, wantsNotification } from "./prefs";
import { itemsFromDerive } from "./sources";

const NOW = Date.parse("2026-11-20T12:00:00Z"); // 15:00 по Москве
const ev = (over: Partial<SellerProductEvent> = {}): SellerProductEvent => ({ id: "e1", createdAt: new Date(NOW - 3_600_000).toISOString(), kind: "stock_out", group: "stock", severity: "important", title: "Товар закончился", detail: "Остаток 0 <шт>", productTitle: "Кашпо & «16л»", vendorCode: null, nmId: "1", itemId: null, ...over });

describe("настройки уведомлений", () => {
  it("значения по умолчанию и разбор настроек", () => {
    assert.deepEqual(parseNotifyPrefs([]), DEFAULT_NOTIFY_PREFS);
    const p = parseNotifyPrefs([{ setting_key: "notify.tg.events", value: "critical" }, { setting_key: "notify.quiet", value: true }, { setting_key: "notify.quietFrom", value: 99 }, { setting_key: "notify.tg.tasks", value: "да" }]);
    assert.equal(p.events, "critical");
    assert.equal(p.quiet, true);
    assert.equal(p.quietFrom, 23);
    assert.equal(p.tasks, true);
  });

  it("фильтрует по уровню и категории", () => {
    const base = { ...DEFAULT_NOTIFY_PREFS };
    assert.equal(wantsNotification(base, { category: "event", severity: "info" }), false);
    assert.equal(wantsNotification(base, { category: "event", severity: "important" }), true);
    assert.equal(wantsNotification({ ...base, events: "critical" }, { category: "event", severity: "important" }), false);
    assert.equal(wantsNotification({ ...base, events: "all" }, { category: "event", severity: "info" }), true);
    assert.equal(wantsNotification({ ...base, events: "off" }, { category: "event", severity: "critical" }), false);
    assert.equal(wantsNotification({ ...base, telegram: false }, { category: "agent", severity: "info" }), false);
    assert.equal(wantsNotification(base, { category: "task", severity: "important" }), false);
    assert.equal(wantsNotification(base, { category: "task", severity: "critical" }), true);
    assert.equal(wantsNotification({ ...base, token: false }, { category: "token", severity: "critical" }), false);
  });

  it("тихие часы по Москве, в том числе через полночь", () => {
    const q = { ...DEFAULT_NOTIFY_PREFS, quiet: true, quietFrom: 23, quietTo: 8 };
    assert.equal(isQuietNow(q, NOW), false); // 15:00
    assert.equal(isQuietNow(q, Date.parse("2026-11-20T21:30:00Z")), true); // 00:30
    assert.equal(isQuietNow(q, Date.parse("2026-11-20T04:00:00Z")), true); // 07:00
    assert.equal(isQuietNow(q, Date.parse("2026-11-20T05:00:00Z")), false); // 08:00
    assert.equal(isQuietNow({ ...q, quiet: false }, Date.parse("2026-11-20T21:30:00Z")), false);
    assert.equal(isQuietNow({ ...q, quietFrom: 5, quietTo: 5 }, Date.parse("2026-11-20T21:30:00Z")), false);
    assert.equal(isQuietNow({ ...q, quietFrom: 13, quietTo: 17 }, NOW), true);
    const night = Date.parse("2026-11-20T21:30:00Z");
    assert.equal(heldByQuiet(q, { severity: "important" }, night), true);
    assert.equal(heldByQuiet(q, { severity: "critical" }, night), false);
  });
});

describe("оформление уведомлений для Telegram", () => {
  it("экранирует данные и не оставляет незакрытых тегов", () => {
    const text = telegramBlock(itemFromEvent(ev()), "https://karto.pro/studio/seller-hub");
    assert.match(text, /<b>Товар закончился<\/b>/);
    assert.match(text, /Остаток 0 &lt;шт&gt;/);
    assert.match(text, /Кашпо &amp; «16л»/);
    assert.match(text, /<a href="https:\/\/karto\.pro\/studio\/seller-hub">Открыть в KARTO<\/a>/);
    assert.equal((text.match(/<(b|i|a)\b/g) ?? []).length, (text.match(/<\/(b|i|a)>/g) ?? []).length);
    assert.ok(text.length < 4096);
  });

  it("длинные тексты режутся, много уведомлений собираются в сводку", () => {
    const long = itemFromEvent(ev({ title: "Т".repeat(500), detail: "Д".repeat(5000) }));
    assert.ok(telegramBlock(long, "https://karto.pro").length < 1200);
    const many: NotifyItem[] = Array.from({ length: 30 }, (_, i) => ({ ...itemFromEvent(ev({ id: `e${i}`, title: `Событие <${i}>` })) }));
    const msgs = telegramMessages(many, "https://karto.pro");
    assert.equal(msgs.length, 1);
    assert.match(msgs[0]!, /Новое в KARTO: 30/);
    assert.match(msgs[0]!, /И ещё 15/);
    assert.match(msgs[0]!, /Событие &lt;0&gt;/);
    assert.ok(msgs[0]!.length <= 4096);
    assert.equal(telegramMessages([many[0]!, many[1]!], "https://karto.pro").length, 2);
    assert.deepEqual(telegramMessages([], "https://karto.pro"), []);
  });

  it("результаты агента и планов", () => {
    assert.equal(itemFromRun({ id: "1", orderTitle: "Напомнить", status: "skipped", summary: "", at: "x" }), null);
    const failed = itemFromRun({ id: "2", orderTitle: "Пополнить", status: "failed", summary: "Нет денег", at: new Date(NOW).toISOString() })!;
    assert.equal(failed.severity, "important");
    assert.match(failed.title, /не выполнено/);
    const plan = itemFromPlanFinished({ id: "p", title: "Поднять выкуп", worked: true, resolvedAt: new Date(NOW).toISOString() });
    assert.match(plan.title, /План сработал/);
  });
});

describe("что отправлять после пересчёта", () => {
  const task = { id: "t1", severity: "critical", status: "active", type: "negative_margin", title: "Убыточная цена", description: "Теряете деньги", recommendation: "", productTitle: "Кашпо", createdAt: new Date(NOW - 1000).toISOString() } as unknown as SellerTask;

  it("свежие события, срочные задачи и срок токена; старое и лишнее нет", () => {
    const items = itemsFromDerive({
      events: [ev({ id: "new" }), ev({ id: "old", createdAt: new Date(NOW - 10 * 3_600_000).toISOString() }), ev({ id: "sync", kind: "sync_completed" })],
      tasks: [task, { ...task, id: "t2", severity: "important" } as SellerTask, { ...task, id: "t3", status: "resolved" } as unknown as SellerTask],
      tokenExpiresAt: new Date(NOW + 2 * 86_400_000).toISOString(),
      nowMs: NOW,
    });
    const keys = items.map((i) => i.dedupeKey);
    assert.ok(keys.includes("event:new"));
    assert.ok(!keys.includes("event:old"));
    assert.ok(!keys.includes("event:sync"));
    assert.ok(keys.some((k) => k.startsWith("task:t1")));
    assert.ok(!keys.some((k) => k.startsWith("task:t2")) && !keys.some((k) => k.startsWith("task:t3")));
    const token = items.find((i) => i.category === "token");
    assert.ok(token);
    assert.equal(token!.severity, "critical");
    assert.equal(itemFromTask(task).category, "task");
  });

  it("токен далеко от срока: уведомления нет", () => {
    assert.equal(itemsFromDerive({ events: [], tasks: [], tokenExpiresAt: new Date(NOW + 60 * 86_400_000).toISOString(), nowMs: NOW }).length, 0);
  });
});

describe("план доставки", () => {
  const row = (id: number, over: Partial<QueueRow> = {}): QueueRow => ({ id, category: "event", severity: "important", title: "t", body: "", subject: null, occurred_at: new Date(NOW - 60_000).toISOString(), created_at: new Date(NOW).toISOString(), attempts: 0, ...over });

  it("отправляет подходящее, задерживает ночью несрочное, отбрасывает лишнее", () => {
    const linkedAt = NOW - 48 * 3_600_000;
    const prefs = { ...DEFAULT_NOTIFY_PREFS };
    const plan = planDelivery([row(1), row(2, { severity: "info" }), row(3, { occurred_at: new Date(linkedAt - 1000).toISOString() }), row(4, { occurred_at: new Date(NOW - 30 * 3_600_000).toISOString() })], prefs, linkedAt, NOW);
    assert.deepEqual(plan.send.map((r) => r.id), [1]);
    assert.deepEqual(plan.skip.map((s) => [s.row.id, s.reason]).sort(), [[2, "выключено в настройках"], [3, "до подключения Telegram"], [4, "устарело"]].sort());

    const night = Date.parse("2026-11-20T21:30:00Z");
    const quiet = { ...prefs, quiet: true };
    const held = planDelivery([row(5, { occurred_at: new Date(night - 60_000).toISOString() }), row(6, { severity: "critical", occurred_at: new Date(night - 60_000).toISOString() })], quiet, linkedAt, night);
    assert.deepEqual(held.hold.map((r) => r.id), [5]);
    assert.deepEqual(held.send.map((r) => r.id), [6]);
  });
});
