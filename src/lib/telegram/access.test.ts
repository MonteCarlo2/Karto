import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { assistantAllowed } from "./access";

const saved = { ids: process.env.SELLER_HUB_ALLOWED_USER_IDS, pub: process.env.SELLER_HUB_PUBLIC };
afterEach(() => {
  if (saved.ids === undefined) delete process.env.SELLER_HUB_ALLOWED_USER_IDS;
  else process.env.SELLER_HUB_ALLOWED_USER_IDS = saved.ids;
  if (saved.pub === undefined) delete process.env.SELLER_HUB_PUBLIC;
  else process.env.SELLER_HUB_PUBLIC = saved.pub;
});

describe("помощник в Telegram открыт только тем, кому открыт Seller Hub", () => {
  it("список разрешённых: свой аккаунт да, чужой нет", () => {
    process.env.SELLER_HUB_ALLOWED_USER_IDS = "owner-1, owner-2";
    delete process.env.SELLER_HUB_PUBLIC;
    assert.equal(assistantAllowed("owner-1"), true);
    assert.equal(assistantAllowed("owner-2"), true);
    assert.equal(assistantAllowed("customer-9"), false);
  });

  it("публичный режим открывает всем", () => {
    process.env.SELLER_HUB_ALLOWED_USER_IDS = "owner-1";
    process.env.SELLER_HUB_PUBLIC = "1";
    assert.equal(assistantAllowed("customer-9"), true);
  });
});
