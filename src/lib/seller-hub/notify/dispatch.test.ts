import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlToPlain } from "@/lib/telegram/send-safe";
import { flushNotifications } from "./dispatch";

type Row = Record<string, unknown>;

/** Мини-база в памяти: ровно те запросы, которые делает доставка. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = tables[table] ?? (tables[table] = []);
    let filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let single = false;
    let max = Infinity;
    const run = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) {
        for (const r of hit) Object.assign(r, patch);
        return { data: null, error: null };
      }
      const out = hit.slice(0, max);
      return { data: single ? (out[0] ?? null) : out, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => ((patch = p), b),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
      like: (col: string, pat: string) => (filters.push((r) => String(r[col]).startsWith(pat.replace("%", ""))), b),
      order: () => b,
      limit: (n: number) => ((max = n), b),
      maybeSingle: () => ((single = true), Promise.resolve(run())),
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const queued = (id: number, over: Row = {}): Row => ({ id, user_id: "u1", status: "pending", category: "event", severity: "important", title: `Событие ${id}`, body: "", subject: null, occurred_at: iso(NOW - 60_000), created_at: iso(NOW), attempts: 0, ...over });
const link = (over: Row = {}): Row => ({ user_id: "u1", chat_id: 777, linked_at: iso(NOW - 48 * 3_600_000), notify_enabled: true, ...over });

describe("доставка уведомлений", () => {
  it("отправляет накопленное одним проходом и помечает отправленным", async () => {
    const tables = { seller_hub_notify_queue: [queued(1), queued(2)], auto_reply_telegram_links: [link()], seller_hub_user_settings: [] };
    const sent: string[] = [];
    const n = await flushNotifications(fakeDb(tables), "u1", NOW, { send: async (_chat, text) => void sent.push(text) });
    assert.equal(n, 2);
    assert.equal(sent.length, 2);
    assert.ok(tables.seller_hub_notify_queue.every((r) => r.status === "sent"));
    // Повторный проход ничего не шлёт.
    assert.equal(await flushNotifications(fakeDb(tables), "u1", NOW, { send: async () => assert.fail("повтор") }), 0);
  });

  it("не подключён Telegram: ничего не отправляется, записи закрываются", async () => {
    const tables = { seller_hub_notify_queue: [queued(1)], auto_reply_telegram_links: [], seller_hub_user_settings: [] };
    assert.equal(await flushNotifications(fakeDb(tables), "u1", NOW, { send: async () => assert.fail("не должно") }), 0);
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "skipped");
  });

  it("тихие часы: несрочное ждёт, срочное уходит", async () => {
    const night = Date.parse("2026-11-20T21:30:00Z");
    const tables = {
      seller_hub_notify_queue: [queued(1, { occurred_at: iso(night - 60_000) }), queued(2, { severity: "critical", occurred_at: iso(night - 60_000) })],
      auto_reply_telegram_links: [link({ linked_at: iso(night - 48 * 3_600_000) })],
      seller_hub_user_settings: [{ user_id: "u1", marketplace_id: "wildberries", setting_key: "notify.quiet", value: true }],
    };
    const sent: string[] = [];
    await flushNotifications(fakeDb(tables), "u1", night, { send: async (_c, t) => void sent.push(t) });
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "pending");
    assert.equal(tables.seller_hub_notify_queue[1]!.status, "sent");
    assert.equal(sent.length, 1);
    // Утром отправится и отложенное.
    const morning = Date.parse("2026-11-21T06:00:00Z");
    await flushNotifications(fakeDb(tables), "u1", morning, { send: async (_c, t) => void sent.push(t) });
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "sent");
  });

  it("сбой Telegram: повтор на следующем проходе, после пяти попыток отказ", async () => {
    const tables = { seller_hub_notify_queue: [queued(1)], auto_reply_telegram_links: [link()], seller_hub_user_settings: [] };
    for (let i = 0; i < 4; i += 1) await flushNotifications(fakeDb(tables), "u1", NOW, { send: async () => Promise.reject(new Error("Too Many Requests")) });
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "pending");
    assert.equal(tables.seller_hub_notify_queue[0]!.attempts, 4);
    await flushNotifications(fakeDb(tables), "u1", NOW, { send: async () => Promise.reject(new Error("Too Many Requests")) });
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "failed");
  });

  it("бот заблокирован: уведомления в этот чат выключаются", async () => {
    const tables = { seller_hub_notify_queue: [queued(1)], auto_reply_telegram_links: [link()], seller_hub_user_settings: [] };
    await flushNotifications(fakeDb(tables), "u1", NOW, { send: async () => Promise.reject(new Error("Forbidden: bot was blocked by the user")) });
    assert.equal(tables.auto_reply_telegram_links[0]!.notify_enabled, false);
    assert.equal(tables.seller_hub_notify_queue[0]!.status, "skipped");
  });
});

describe("запасной простой текст", () => {
  it("убирает теги, оставляет ссылки адресом и возвращает символы", () => {
    assert.equal(htmlToPlain('<b>Заголовок &amp; &lt;товар&gt;</b>\n<a href="https://karto.pro/?a=1&amp;b=2">Открыть</a>'), "Заголовок & <товар>\nОткрыть: https://karto.pro/?a=1&b=2");
  });
});
