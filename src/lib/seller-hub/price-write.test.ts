import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  claimPriceSubmit,
  interpretPriceUploadStatus,
  priceJournalEntry,
  priceWriteClosesTask,
  priceWriteView,
  releasePriceSubmit,
  requestedPriceMatchesRead,
  settlePriceUpload,
} from "./price-write";

describe("price upload result", () => {
  it("does not call an accepted task an applied price", () => {
    const view = settlePriceUpload({ uploadOk: true, uploadId: 42 });
    assert.equal(view.outcome, "unknown");
    assert.equal(view.applyLocal, false);
    assert.match(view.text, /неизвест/);
    assert.doesNotMatch(view.text, /совпала/);
  });

  it("confirms only when the processed upload matches the price read back", () => {
    const view = settlePriceUpload({
      uploadOk: true,
      uploadId: 7,
      waitOutcome: "processed",
      read: "match",
    });
    assert.equal(view.outcome, "confirmed");
    assert.equal(view.applyLocal, true);
    assert.match(view.text, /прочитанная цена совпала/);
  });

  it("keeps a processed upload unconfirmed when the read does not match", () => {
    const view = settlePriceUpload({
      uploadOk: true,
      uploadId: 7,
      waitOutcome: "processed",
      read: "mismatch",
    });
    assert.equal(view.outcome, "processed");
    assert.equal(view.applyLocal, false);
    assert.match(view.text, /не совпала/);
    assert.match(view.text, /не меняю/);
  });

  it("shows a WB error instead of success", () => {
    const status = interpretPriceUploadStatus({
      status: 6,
      successCount: 0,
      errors: ["nmID 5: quarantine"],
    });
    assert.equal(status?.outcome, "rejected");
    const partial = interpretPriceUploadStatus({ status: 5, successCount: 1, errors: ["nmID 2: quarantine"] });
    assert.equal(partial?.outcome, "partial");
    assert.equal(partial?.ok, false);
    const view = settlePriceUpload({
      uploadOk: true,
      uploadId: 9,
      waitOutcome: "rejected",
      waitError: status?.error,
    });
    assert.equal(view.tone, "error");
    assert.equal(view.applyLocal, false);
    assert.match(view.text, /quarantine/);
  });

  it("leaves a timed-out upload unknown and does not describe it as a failure", () => {
    const view = settlePriceUpload({
      uploadOk: true,
      uploadId: 11,
      waitOutcome: "unknown",
      waitError: "Загрузка 11 ещё не обработана. Результат неизвестен, повторно цену не отправляю.",
    });
    assert.equal(view.outcome, "unknown");
    assert.equal(view.applyLocal, false);
    assert.match(view.text, /неизвест/);
    assert.doesNotMatch(view.text, /отклонил/);
  });

  it("blocks a second submit while the first is in flight", () => {
    const lock = { current: false };
    assert.equal(claimPriceSubmit(lock), true);
    assert.equal(claimPriceSubmit(lock), false);
    releasePriceSubmit(lock);
    assert.equal(claimPriceSubmit(lock), true);
  });

  it("reports a network failure without claiming the price changed", () => {
    const view = settlePriceUpload({ uploadOk: false, uploadError: "Не удалось связаться с Wildberries" });
    assert.equal(view.outcome, "failed");
    assert.equal(view.tone, "error");
    assert.match(view.text, /Не удалось связаться/);
    assert.equal(view.applyLocal, false);
  });

  it("uses the same status text in the product and price editors", () => {
    const catalog = readFileSync("src/components/seller-hub/hub-catalog.tsx", "utf8");
    const prices = readFileSync("src/components/seller-hub/hub-prices.tsx", "utf8");
    const drawer = readFileSync("src/components/seller-hub/hub-product-drawer.tsx", "utf8");
    const assistant = readFileSync("src/components/seller-hub/hub-assistant.tsx", "utf8");
    for (const source of [catalog, prices, drawer, assistant]) {
      assert.match(source, /updateSellerHubPrices/);
      assert.doesNotMatch(source, /WB принял цену/);
      assert.doesNotMatch(source, /Цена обновлена/);
      assert.doesNotMatch(source, /Задача на цены принята WB/);
      assert.doesNotMatch(source, /updateSellerHubTaskStatus/);
    }
    for (const source of [catalog, prices, drawer]) {
      assert.match(source, /priceWriteView/);
      assert.match(source, /claimPriceSubmit/);
    }
    assert.equal(interpretPriceUploadStatus({ status: 1, successCount: 0, errors: [] }), null);
    assert.equal(interpretPriceUploadStatus({ status: 2, successCount: 0, errors: [] }), null);
    const unknown = priceWriteView({ outcome: "unknown", uploadId: 3 });
    assert.equal(priceWriteView({ outcome: "unknown", uploadId: 3 }).text, unknown.text);
  });

  it("does not close a task because a price was sent", () => {
    assert.equal(priceWriteClosesTask(), false);
    const entry = priceJournalEntry({
      rows: [{ nmId: 100, beforePrice: 1000, beforeDiscount: 10, price: 900, discount: 15 }],
      view: priceWriteView({ outcome: "unknown", uploadId: 4 }),
    });
    assert.match(entry.title, /Цена/);
    assert.match(entry.detail, /upload 4/);
    assert.match(entry.detail, /unknown/);
    assert.equal(requestedPriceMatchesRead({ price: 900, discount: 15 }, { price: 900, discountPercent: 15 }), true);
    assert.equal(requestedPriceMatchesRead({ price: 900, discount: 15 }, { price: 1000, discountPercent: 15 }), false);
  });
});
