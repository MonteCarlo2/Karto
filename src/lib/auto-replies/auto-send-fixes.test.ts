import assert from "node:assert/strict";
import { it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxReviewItem } from "./inbox-demo-data";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "./settings-types";
import { reconcileAnsweredElsewhere } from "./inbox-item-merge";
import { AUTO_SEND_MAX_ATTEMPTS, autoSendBackoffMs, autoSendIsPaused, shouldAutoSendInboxItem } from "./inbox-star-rules";
import { applyMinusWords } from "./reply-postprocess";
import { findStopWordHitsInReview } from "./restrictions-settings";
import { processAutoRepliesInbox } from "./inbox-auto-send";

const shop = (advanced: Partial<AutoRepliesShopSettings["advanced"]> = {}): AutoRepliesShopSettings =>
  ({
    advanced: { stopWordsEnabled: false, stopWords: [], minusWordsEnabled: false, minusWords: [], ...advanced },
    style: { useBuyerName: false, mentionProduct: false, emojis: true, emptyReviewEnabled: false, addressForm: "vy" },
    templates: { signaturesEnabled: false, signatures: [], rotationMode: "random" },
  }) as unknown as AutoRepliesShopSettings;

const mp = (byStar: Record<string, "auto" | "confirm"> = { "5": "auto", "4": "auto", "3": "auto", "2": "auto", "1": "auto" }): AutoRepliesMarketplaceSettings =>
  ({ usage: "auto", starRules: { byStar }, reviewScope: { mode: "all", limit: 0, limitConsumed: 0 } }) as unknown as AutoRepliesMarketplaceSettings;

const item = (over: Partial<InboxReviewItem> = {}): InboxReviewItem =>
  ({ id: "r1", feed: "semi", status: "pending", starRating: "5", productName: "Ведро", productArticle: "Арт. 1", marketplaceId: "wildberries", buyerLabel: "Покупатель", shopName: "М", reviewText: "Отличное ведро, спасибо!", replyDraft: "Здравствуйте! Спасибо за отзыв.", timeLabel: "10:00", dateLabel: "1 ноября", listDateLabel: "1 ноября 2026", externalId: "fb1", ...over }) as InboxReviewItem;

/** Заглушка базы: баланс и списания. */
function fakeDb(balance: number) {
  const calls = { consumed: 0 };
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "update", "upsert"]) api[m] = () => api;
    api.maybeSingle = async () => ({ data: table === "user_subscriptions" ? { plan_volume: balance, period_start: new Date().toISOString(), auto_reply_welcome_remaining: 0 } : null });
    return api;
  };
  const db = {
    from: (table: string) => chain(table),
    rpc: async () => {
      calls.consumed += 1;
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

it("автоотправка: ответ списывается только после успешной отправки", async () => {
  const ok = fakeDb(5);
  const r1 = await processAutoRepliesInbox({ items: [item()], shopSettings: shop(), mpSettings: mp(), sendReply: async () => {}, userId: "u", supabase: ok.db });
  assert.equal(r1.autoSentCount, 1);
  assert.equal(ok.calls.consumed, 1);

  const bad = fakeDb(5);
  const r2 = await processAutoRepliesInbox({
    items: [item()],
    shopSettings: shop(),
    mpSettings: mp(),
    sendReply: async () => {
      throw new Error("WB отказал");
    },
    userId: "u",
    supabase: bad.db,
  });
  assert.equal(r2.autoSentCount, 0);
  assert.equal(bad.calls.consumed, 0, "при сбое отправки ответ не списывается");
  assert.equal(r2.items[0]!.autoSendAttempts, 1);
  assert.equal(r2.items[0]!.autoSendError, "WB отказал");
  assert.ok(r2.items[0]!.autoSendFailedAt);
});

it("автоотправка: без остатка ничего не отправляется", async () => {
  const empty = fakeDb(0);
  let sent = 0;
  const r = await processAutoRepliesInbox({
    items: [item()],
    shopSettings: shop(),
    mpSettings: mp(),
    sendReply: async () => {
      sent += 1;
    },
    userId: "u",
    supabase: empty.db,
  });
  assert.equal(sent, 0);
  assert.equal(r.autoSentCount, 0);
  assert.equal(empty.calls.consumed, 0);
});

it("пауза после неудачи: 5, 10, 20, 40 минут, а после пяти неудач отзыв ждёт ручного решения", () => {
  assert.equal(autoSendBackoffMs(1), 5 * 60_000);
  assert.equal(autoSendBackoffMs(3), 20 * 60_000);
  assert.equal(autoSendBackoffMs(9), 60 * 60_000);
  const now = Date.parse("2026-11-19T10:00:00Z");
  const failed = (attempts: number, minutesAgo: number) => ({ autoSendAttempts: attempts, autoSendFailedAt: new Date(now - minutesAgo * 60_000).toISOString() });
  assert.equal(autoSendIsPaused(failed(1, 2), now), true);
  assert.equal(autoSendIsPaused(failed(1, 6), now), false);
  assert.equal(autoSendIsPaused(failed(AUTO_SEND_MAX_ATTEMPTS, 600), now), true);
  assert.equal(shouldAutoSendInboxItem(item(failed(1, 2)), mp(), shop(), now), false);
  assert.equal(shouldAutoSendInboxItem(item(failed(1, 30)), mp(), shop(), now), true);
  assert.equal(shouldAutoSendInboxItem(item(), mp(), shop(), now), true);
});

it("одна заготовка с чужим языком не останавливает остальные отзывы", async () => {
  const db = fakeDb(5);
  const r = await processAutoRepliesInbox({ items: [item({ id: "bad", replyDraft: "Спасибо 谢谢" }), item({ id: "good", externalId: "fb2" })], shopSettings: shop(), mpSettings: mp(), sendReply: async () => {}, userId: "u", supabase: db.db });
  assert.equal(r.autoSentCount, 1);
  assert.equal(r.items.find((i) => i.id === "good")!.status, "sent");
  assert.equal(r.items.find((i) => i.id === "bad")!.status, "pending");
  assert.ok(r.items.find((i) => i.id === "bad")!.autoSendError);
});

it("минус-слова убираются из русского текста целыми словами", () => {
  const s = shop({ minusWordsEnabled: true, minusWords: ["брак", "дешёвый"] });
  assert.equal(applyMinusWords("Это не брак, а дешёвый вариант. Бракованный товар вернём.", s), "Это не, а вариант. Бракованный товар вернём.");
  assert.equal(applyMinusWords("Слово без совпадений", s), "Слово без совпадений");
  assert.equal(applyMinusWords("Text brand", shop({ minusWordsEnabled: true, minusWords: ["brand"] })), "Text");
});

it("стоп-слова ловятся с начала слова, а не внутри чужих слов", () => {
  assert.deepEqual(findStopWordHitsInReview("Товар бракованный", ["брак"]), ["брак"]);
  assert.deepEqual(findStopWordHitsInReview("Это брак!", ["брак"]), ["брак"]);
  assert.deepEqual(findStopWordHitsInReview("Подбрак что-то", ["рак"]), []);
  assert.deepEqual(findStopWordHitsInReview("Очень БРАК", ["брак"]), ["брак"]);
  assert.deepEqual(findStopWordHitsInReview("Верните деньги за возврат", ["возврат", "жалоба"]), ["возврат"]);
  assert.deepEqual(findStopWordHitsInReview("", ["брак"]), []);
});

it("отзыв, на который ответили вне KARTO, помечается и больше не автоотправляется", () => {
  const stale = [item({ id: "a", reviewPublishedAt: "2026-11-18T10:00:00Z" }), item({ id: "b", reviewPublishedAt: "2026-11-10T10:00:00Z" }), item({ id: "c", status: "sent" })];
  const fresh = [item({ id: "new", reviewPublishedAt: "2026-11-19T08:00:00Z" }), item({ id: "edge", reviewPublishedAt: "2026-11-15T08:00:00Z" })];
  // выдача неполная, самый старый полученный отзыв от 15.11: «a» новее и отсутствует, значит отвечен; «b» старше границы, судить нельзя
  const partial = reconcileAnsweredElsewhere(stale, fresh, { complete: false });
  assert.equal(partial.find((i) => i.id === "a")!.status, "sent");
  assert.equal(partial.find((i) => i.id === "a")!.answeredExternally, true);
  assert.equal(partial.find((i) => i.id === "a")!.canSend, false);
  assert.equal(partial.find((i) => i.id === "b")!.status, "pending");
  assert.equal(partial.find((i) => i.id === "c")!.status, "sent");
  // выдача полная: отвечены все пропавшие
  const full = reconcileAnsweredElsewhere(stale, fresh, { complete: true });
  assert.equal(full.find((i) => i.id === "b")!.status, "sent");
  // пустая неполная выдача (сбой связи) ничего не меняет
  const hiccup = reconcileAnsweredElsewhere(stale, [], { complete: false });
  assert.equal(hiccup.find((i) => i.id === "a")!.status, "pending");
  assert.equal(shouldAutoSendInboxItem(full.find((i) => i.id === "a")!, mp(), shop()), false);
});
