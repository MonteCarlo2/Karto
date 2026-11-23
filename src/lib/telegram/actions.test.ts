import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SANDBOX_MESSAGE } from "@/lib/seller-hub/sandbox";
import { actionCardHtml, cardCtx, priceEditFromBlock } from "./action-cards";
import { executeTgAction, inverseAction, type TgAction } from "./action-exec";
import { handleActionCallback, handleAskCallback, parseActionCallback, type PendingRow } from "./actions";
import { telegramCards } from "@/lib/seller-hub/notify/compose";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

type Row = Record<string, unknown>;

/** Мини-база в памяти: условные обновления возвращают изменённые строки, как настоящая. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = tables[table] ?? (tables[table] = []);
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => ((patch = p), b),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      maybeSingle: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (patch) for (const r of hit) Object.assign(r, patch);
        resolve({ data: hit, error: null });
      },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = Date.parse("2026-11-20T12:00:00Z");
const pause: TgAction = { type: "pause", campaignId: "555" };

function setup(over: Partial<PendingRow> = {}, action: TgAction = pause) {
  const pending: Row = { short_id: "abc12345", user_id: "u1", chat_id: 777, action, summary: "КАРТОЧКА", status: "pending", result: null, undo: null, message_id: 10, expires_at: new Date(NOW + 600_000).toISOString(), ...over };
  const tables = { seller_hub_tg_pending_actions: [pending], auto_reply_telegram_links: [{ user_id: "u1", telegram_user_id: 42, chat_id: 777 }] };
  const log = { answers: [] as string[], edits: [] as Array<{ text: string; kb: unknown }>, sends: [] as string[], exec: [] as TgAction[] };
  const tg = {
    answer: async (_id: string, text?: string) => void log.answers.push(text ?? ""),
    edit: async (i: { text: string; replyMarkup?: unknown }) => void log.edits.push({ text: i.text, kb: i.replyMarkup }),
    send: async (i: { html: string }) => void log.sends.push(i.html),
  };
  const cb = (data: string, fromId = 42) => ({ id: "cb1", data, from: { id: fromId }, message: { message_id: 10, chat: { id: 777 } } });
  return { pending, db: fakeDb(tables), log, tg, cb };
}

describe("кнопки действий: разбор и откат", () => {
  it("разбирает данные кнопки и отвергает чужие", () => {
    assert.deepEqual(parseActionCallback("ax:y:abc12345"), { op: "y", short: "abc12345" });
    assert.deepEqual(parseActionCallback("ax:u:abc12345"), { op: "u", short: "abc12345" });
    assert.equal(parseActionCallback("ax:x:abc12345"), null);
    assert.equal(parseActionCallback("edt:abc12345"), null);
    assert.equal(parseActionCallback("ax:y:"), null);
    assert.equal(parseActionCallback(undefined), null);
  });

  it("обратимые действия имеют откат, необратимые нет", () => {
    assert.deepEqual(inverseAction(pause), { type: "resume", campaignId: "555" });
    assert.deepEqual(inverseAction({ type: "resume", campaignId: "555" }), pause);
    assert.equal(inverseAction({ type: "deposit", campaignId: "1", sumRub: 500 }), null);
    assert.equal(inverseAction({ type: "minus_phrases", advertId: "1", nmId: "2", queries: ["а"] }), null);
    assert.deepEqual(inverseAction({ type: "bid", advertId: "1", nmId: "2", bidRub: 120, previousBidRub: 100 }), { type: "bid", advertId: "1", nmId: "2", bidRub: 100, previousBidRub: 120 });
    assert.equal(inverseAction({ type: "bid", advertId: "1", nmId: "2", bidRub: 120 }), null);
    const price = inverseAction({ type: "price_edit", nmId: "9", field: "price", value: 1300, prevPrice: 1200, prevDiscount: 20, title: "Т" });
    assert.deepEqual(price, { type: "price_edit", nmId: "9", field: "price", value: 1200, prevPrice: 1300, prevDiscount: 20, title: "Т" });
    assert.equal(inverseAction({ type: "price_edit", nmId: "9", field: "discount", value: 25, prevPrice: 1200, prevDiscount: null, title: "Т" }), null);
  });
});

describe("выполнение действия", () => {
  const db = fakeDb({});
  it("тестовый режим: в WB ничего не уходит", async () => {
    let ran = false;
    const r = await executeTgAction(db, "u1", pause, { sandbox: async () => true, run: async () => ((ran = true), { ok: true }) });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, true);
    assert.equal(r.message, SANDBOX_MESSAGE);
    assert.equal(ran, false);
  });

  it("боевой режим: пишет в WB, журнал и перечитывание", async () => {
    const entries: Array<Record<string, unknown>> = [];
    let invalidated: unknown = null;
    const r = await executeTgAction(db, "u1", pause, { sandbox: async () => false, token: async () => ({ ok: true, token: "SECRET-TOKEN" }), run: async (token, a) => (assert.equal(token, "SECRET-TOKEN"), assert.equal(a.type, "pause"), { ok: true }), log: async (e) => void entries.push(e as never), invalidate: async (_d, _u, s) => void (invalidated = s) });
    assert.equal(r.ok, true);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.action, "ad_pause");
    assert.equal(entries[0]!.result, "ok");
    assert.equal(entries[0]!.targetId, 555);
    assert.ok(Array.isArray(invalidated));
  });

  it("ошибка WB: сообщение без токена, журнал с ошибкой", async () => {
    const entries: Array<Record<string, unknown>> = [];
    const r = await executeTgAction(db, "u1", pause, { sandbox: async () => false, token: async () => ({ ok: true, token: "SECRET-TOKEN" }), run: async () => ({ ok: false, error: "Bearer SECRET-TOKEN отклонён SECRET-TOKEN" }), log: async (e) => void entries.push(e as never), invalidate: async () => undefined });
    assert.equal(r.ok, false);
    assert.ok(!r.message.includes("SECRET-TOKEN"));
    assert.equal(entries[0]!.result, "error");
    assert.ok(!JSON.stringify(entries).includes("SECRET-TOKEN"));
  });

  it("исключение при записи не ломает ответ; нет доступа к кабинету понятно", async () => {
    const r = await executeTgAction(db, "u1", pause, { sandbox: async () => false, token: async () => ({ ok: true, token: "T" }), run: async () => { throw new Error("сеть упала"); }, log: async () => undefined, invalidate: async () => undefined });
    assert.equal(r.ok, false);
    assert.match(r.message, /сеть упала/);
    const none = await executeTgAction(db, "u1", pause, { sandbox: async () => false, token: async () => ({ ok: false }) });
    assert.match(none.message, /Нет доступа к кабинету/);
  });

  it("неподдерживаемое действие отклоняется до обращения к WB", async () => {
    let touched = false;
    const r = await executeTgAction(db, "u1", { type: "create_campaign", nmId: "1", name: "x" }, { sandbox: async () => (touched = true, false) });
    assert.equal(r.ok, false);
    assert.equal(touched, false);
  });
});

describe("кнопки подтверждения", () => {
  it("«Подтвердить» выполняет один раз и предлагает отмену", async () => {
    const s = setup();
    const calls: TgAction[] = [];
    const deps = { tg: s.tg, now: () => NOW, exec: async (_d: SupabaseClient, _u: string, a: TgAction) => (calls.push(a), { ok: true, message: "Готово" }) };
    assert.equal(await handleActionCallback(s.db, s.cb("ax:y:abc12345"), deps), true);
    assert.equal(calls.length, 1);
    assert.equal(s.pending.status, "done");
    assert.deepEqual(s.pending.undo, { type: "resume", campaignId: "555" });
    assert.match(s.log.edits.at(-1)!.text, /КАРТОЧКА[\s\S]*✅ Готово/);
    assert.match(JSON.stringify(s.log.edits.at(-1)!.kb), /ax:u:abc12345/);
    // Двойное нажатие не выполняет второй раз.
    await handleActionCallback(s.db, s.cb("ax:y:abc12345"), deps);
    assert.equal(calls.length, 1);
    assert.match(s.log.answers.at(-1)!, /уже обработано/i);
  });

  it("ошибка выполнения показывается и не предлагает откат", async () => {
    const s = setup();
    await handleActionCallback(s.db, s.cb("ax:y:abc12345"), { tg: s.tg, now: () => NOW, exec: async () => ({ ok: false, message: "WB отказал" }) });
    assert.equal(s.pending.status, "failed");
    assert.match(s.log.edits.at(-1)!.text, /❌ WB отказал/);
    assert.deepEqual(s.log.edits.at(-1)!.kb, { inline_keyboard: [] });
  });

  it("тестовый режим: не ошибка, действие закрыто без выполнения", async () => {
    const s = setup();
    await handleActionCallback(s.db, s.cb("ax:y:abc12345"), { tg: s.tg, now: () => NOW, exec: async () => ({ ok: false, simulated: true, message: SANDBOX_MESSAGE }) });
    assert.equal(s.pending.status, "cancelled");
    assert.match(s.log.edits.at(-1)!.text, /🧪/);
  });

  it("«Отмена» ничего не выполняет", async () => {
    const s = setup();
    await handleActionCallback(s.db, s.cb("ax:n:abc12345"), { tg: s.tg, now: () => NOW, exec: async () => assert.fail("не должно выполняться") });
    assert.equal(s.pending.status, "cancelled");
    assert.match(s.log.edits.at(-1)!.text, /ничего не изменилось/);
  });

  it("устаревшая карточка не выполняется", async () => {
    const s = setup({ expires_at: new Date(NOW - 1000).toISOString() });
    await handleActionCallback(s.db, s.cb("ax:y:abc12345"), { tg: s.tg, now: () => NOW, exec: async () => assert.fail("не должно выполняться") });
    assert.equal(s.pending.status, "expired");
    assert.match(s.log.edits.at(-1)!.text, /устарела/);
  });

  it("чужой пользователь не может подтвердить", async () => {
    const s = setup();
    await handleActionCallback(s.db, s.cb("ax:y:abc12345", 999), { tg: s.tg, now: () => NOW, exec: async () => assert.fail("не должно выполняться") });
    assert.equal(s.pending.status, "pending");
    assert.match(s.log.answers.at(-1)!, /нет доступа/i);
  });

  it("«Отменить действие» возвращает прежнее и закрывает кнопку; сбой откат сохраняет", async () => {
    const s = setup({ status: "done", undo: { type: "resume", campaignId: "555" } as never });
    const calls: TgAction[] = [];
    await handleActionCallback(s.db, s.cb("ax:u:abc12345"), { tg: s.tg, now: () => NOW, exec: async (_d, _u, a) => (calls.push(a), { ok: false, message: "сбой" }) });
    assert.equal(s.pending.status, "done");
    assert.match(JSON.stringify(s.log.edits.at(-1)!.kb), /ax:u:abc12345/);
    await handleActionCallback(s.db, s.cb("ax:u:abc12345"), { tg: s.tg, now: () => NOW, exec: async (_d, _u, a) => (calls.push(a), { ok: true, message: "ок" }) });
    assert.equal(s.pending.status, "undone");
    assert.deepEqual(calls.map((c) => c.type), ["resume", "resume"]);
    assert.deepEqual(s.log.edits.at(-1)!.kb, { inline_keyboard: [] });
  });

  it("не наши кнопки не трогаются", async () => {
    const s = setup();
    assert.equal(await handleActionCallback(s.db, s.cb("cfm:xyz"), { tg: s.tg }), false);
  });
});

describe("карточка действия", () => {
  const snapshot = {
    items: [{ externalId: "9", title: "Ведро <10 л> & Ко", price: 1200, discountPercent: 20, discountedPrice: 960 }],
    ads: { campaigns: [{ id: 555, name: "Кампания «Ведро»" }] },
  } as unknown as SellerCatalogSnapshot;

  it("показывает «было → станет», риск и признак отмены, всё экранировано", () => {
    const html = actionCardHtml({ type: "price_edit", nmId: "9", field: "price", value: 1300, prevPrice: 1200, prevDiscount: 20, title: "Ведро" }, cardCtx(snapshot), { sandbox: true, why: "Спрос <вырос>" });
    assert.match(html, /Изменить цену/);
    assert.match(html, /Ведро &lt;10 л&gt; &amp; Ко/);
    assert.match(html, /1\s200\s₽ → <b>1\s300\s₽<\/b>/);
    assert.match(html, /Покупатель увидит примерно <b>1\s040\s₽<\/b>/);
    assert.match(html, /Спрос &lt;вырос&gt;/);
    assert.match(html, /можно будет отменить/);
    assert.match(html, /Тестовый режим/);
    assert.ok(html.length < 4000);
    const dep = actionCardHtml({ type: "deposit", campaignId: "555", sumRub: 700 }, cardCtx(snapshot));
    assert.match(dep, /Кампания «Ведро»/);
    assert.match(dep, /Отменить это действие кнопкой нельзя/);
  });

  it("правка цены из ответа агента: проценты, границы, неизвестный товар", () => {
    assert.deepEqual(priceEditFromBlock(snapshot, { nmId: "9", field: "price", value: null, pct: 5 }), { type: "price_edit", nmId: "9", field: "price", value: 1260, prevPrice: 1200, prevDiscount: 20, title: "Ведро <10 л> & Ко" });
    assert.equal(priceEditFromBlock(snapshot, { nmId: "9", field: "discount", value: 120 }), null);
    assert.equal(priceEditFromBlock(snapshot, { nmId: "9", field: "discount", value: 12.5 }), null);
    assert.equal(priceEditFromBlock(snapshot, { nmId: "9", field: "price", value: -3 }), null);
    assert.equal(priceEditFromBlock(snapshot, { nmId: "404", field: "price", value: 100 }), null);
    assert.equal(priceEditFromBlock(snapshot, { nmId: "9", field: "price", value: null }), null);
    assert.equal(priceEditFromBlock(snapshot, { nmId: "9", field: "discount", value: 25 })?.value, 25);
  });
});

describe("кнопка «Спросить агента»", () => {
  const mk = (over: Row = {}) => {
    const tables = {
      auto_reply_telegram_links: [{ user_id: "u1", telegram_user_id: 42, chat_id: 777 }],
      seller_hub_notify_queue: [{ id: 15, user_id: "u1", title: "Продажи снизились", body: "28 дней: 0 шт.", subject: "Ведро", ...over }],
    };
    const asked: string[] = [];
    const answers: string[] = [];
    const tg = { answer: async (_id: string, text?: string) => void answers.push(text ?? "") };
    return { db: fakeDb(tables), asked, answers, tg, ask: async (_l: unknown, text: string) => void asked.push(text) };
  };
  const cb = (data: string, fromId = 42) => ({ id: "c", data, from: { id: fromId } });

  it("собирает вопрос из уведомления и передаёт помощнику", async () => {
    const s = mk();
    assert.equal(await handleAskCallback(s.db, cb("nq:15"), s.ask, s.tg), true);
    assert.equal(s.asked.length, 1);
    assert.match(s.asked[0]!, /Продажи снизились[\s\S]*Товар: Ведро[\s\S]*28 дней/);
  });

  it("чужое уведомление и чужие кнопки не обрабатываются", async () => {
    const s = mk({ user_id: "other" });
    await handleAskCallback(s.db, cb("nq:15"), s.ask, s.tg);
    assert.equal(s.asked.length, 0);
    assert.match(s.answers.at(-1)!, /Не нашёл/);
    assert.equal(await handleAskCallback(s.db, cb("ax:y:abc12345"), s.ask, s.tg), false);
    assert.equal(await handleAskCallback(s.db, cb("nq:abc"), s.ask, s.tg), false);
  });
});

describe("карточки уведомлений с кнопкой", () => {
  const item = (id: string, category: "event" | "task" | "agent" | "token" = "event") => ({ dedupeKey: id, category, severity: "important" as const, title: "Т", body: "Б", subject: null, at: new Date(NOW).toISOString() });
  it("кнопка только у одиночных карточек событий и задач", () => {
    assert.equal(telegramCards([item("7")], "https://x")[0]!.askId, "7");
    assert.equal(telegramCards([item("7", "agent")], "https://x")[0]!.askId, undefined);
    assert.equal(telegramCards([item("test")], "https://x")[0]!.askId, undefined);
    assert.ok(telegramCards([item("1"), item("2"), item("3"), item("4")], "https://x").every((m) => m.askId === undefined));
  });
});

describe("поручения и правила WB в действиях", () => {
  const order: TgAction = { type: "order_create", input: { title: "Автопополнение: Кампания", kind: "ads_deposit", params: { campaignId: "555", belowRub: 500, topUpRub: 1000 }, schedule: { type: "check", everyMinutes: 60 }, limits: { maxPerDayRub: 2000 }, mode: "ask", createdFrom: "chat" } };

  it("карточка поручения показывает расписание, рамки и риск", () => {
    const html = actionCardHtml(order, cardCtx(null));
    assert.match(html, /Создать поручение/);
    assert.match(html, /Автопополнение: Кампания/);
    assert.match(html, /Проверка каждые 1 ч/);
    assert.match(html, /Рамки/);
    assert.match(html, /можно будет отменить/);
  });

  it("пополнение меньше минимума WB отклоняется до обращения к WB", async () => {
    let touched = false;
    const r = await executeTgAction(fakeDb({}), "u1", { type: "deposit", campaignId: "1", sumRub: 500 }, { sandbox: async () => ((touched = true), false) });
    assert.equal(r.ok, false);
    assert.match(r.message, /Минимальное пополнение/);
    assert.equal(touched, false);
  });

  it("поручение выполняется без тестового режима и токена, откат удаляет его", async () => {
    const s = setup({}, order);
    const calls: string[] = [];
    const deps = { tg: s.tg, now: () => NOW, exec: async (_d: SupabaseClient, _u: string, a: TgAction) => (calls.push(a.type), a.type === "order_create" ? { ok: true, message: "Поручение создано", createdId: "ord-1" } : { ok: true, message: "Удалено" }) };
    await handleActionCallback(s.db, s.cb("ax:y:abc12345"), deps);
    assert.deepEqual(s.pending.undo, { type: "order_delete", orderId: "ord-1", title: "Автопополнение: Кампания" });
    await handleActionCallback(s.db, s.cb("ax:u:abc12345"), deps);
    assert.deepEqual(calls, ["order_create", "order_delete"]);
    assert.equal(s.pending.status, "undone");
    const r = await executeTgAction(fakeDb({}), "u1", order, { sandbox: async () => assert.fail("тестовый режим для поручений не нужен"), order: async () => ({ ok: true, message: "ок", createdId: "x" }) });
    assert.equal(r.ok, true);
    assert.equal(r.createdId, "x");
  });
});
