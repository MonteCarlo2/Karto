import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createCipheriv, randomBytes, scryptSync } from "crypto";
import { SELLER_HUB_WB_SHOP_ID } from "@/lib/seller-hub/wb-token";
import {
  decryptAutoReplySecret,
  encryptAutoReplySecret,
  isSellerHubSecretShopId,
  listMarketplaceSecretsForUser,
  upsertMarketplaceSecrets,
} from "./server-secrets";

type Row = {
  user_id: string;
  shop_id: string;
  marketplace_id: string;
  api_key_ciphertext: string;
  client_id?: string | null;
  campaign_id?: string | null;
  business_id?: string | null;
  updated_at?: string;
};

function encryptWithRawKey(plain: string, rawKey: string): string {
  const key = scryptSync(rawKey, "karto-auto-reply-secrets-v1", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

type Filter = { op: "eq" | "neq"; col: string; val: string };

/** Минимальный supabase-мок: filter chain + in-memory rows. */
function memorySecretsDb(seed: Row[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const ops: Array<{ type: string; payload?: unknown }> = [];

  function applyFilters(list: Row[], filters: Filter[]): Row[] {
    let out = list;
    for (const f of filters) {
      if (f.op === "eq") out = out.filter((r) => String((r as Record<string, unknown>)[f.col]) === f.val);
      if (f.op === "neq") out = out.filter((r) => String((r as Record<string, unknown>)[f.col]) !== f.val);
    }
    return out;
  }

  function filterChain(onDone: (filters: Filter[]) => Promise<{ error: null }>) {
    const filters: Filter[] = [];
    const api: Record<string, unknown> = {};
    api.eq = (col: string, val: string) => {
      filters.push({ op: "eq", col, val });
      return api;
    };
    api.neq = (col: string, val: string) => {
      filters.push({ op: "neq", col, val });
      return api;
    };
    api.then = (
      resolve: (v: { error: null }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => onDone(filters).then(resolve, reject);
    return api;
  }

  function from() {
    const filters: Filter[] = [];
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      eq(col: string, val: string) {
        filters.push({ op: "eq", col, val });
        return builder;
      },
      neq(col: string, val: string) {
        filters.push({ op: "neq", col, val });
        return builder;
      },
      async upsert(payload: Row | Row[]) {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          ops.push({ type: "upsert", payload: item });
          const idx = rows.findIndex(
            (r) =>
              r.user_id === item.user_id &&
              r.shop_id === item.shop_id &&
              r.marketplace_id === item.marketplace_id,
          );
          if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
          else rows.push({ ...item });
        }
        return { error: null };
      },
      update(patch: Partial<Row>) {
        return filterChain(async (updateFilters) => {
          for (const row of applyFilters(rows, updateFilters)) {
            ops.push({ type: "update", payload: { shop_id: row.shop_id, patch } });
            Object.assign(row, patch);
          }
          return { error: null };
        });
      },
      delete() {
        return filterChain(async (delFilters) => {
          for (const row of applyFilters(rows, delFilters)) {
            ops.push({ type: "delete", payload: { shop_id: row.shop_id } });
            const idx = rows.indexOf(row);
            if (idx >= 0) rows.splice(idx, 1);
          }
          return { error: null };
        });
      },
      then(
        resolve: (v: { data: Row[] | null; error: null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) {
        try {
          return Promise.resolve(resolve({ data: applyFilters(rows, filters), error: null }));
        } catch (e) {
          return Promise.resolve(reject?.(e));
        }
      },
    };
    return builder;
  }

  return { rows, ops, from };
}

const previousKey = process.env.AUTO_REPLY_SECRETS_KEY;
const previousCron = process.env.CRON_SECRET;

afterEach(() => {
  if (previousKey == null) delete process.env.AUTO_REPLY_SECRETS_KEY;
  else process.env.AUTO_REPLY_SECRETS_KEY = previousKey;
  if (previousCron == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCron;
});

describe("auto-reply marketplace secrets vs seller hub", () => {
  it("recognizes seller-hub shop id as reserved", () => {
    assert.equal(isSellerHubSecretShopId(SELLER_HUB_WB_SHOP_ID), true);
    assert.equal(isSellerHubSecretShopId("main"), false);
    assert.equal(isSellerHubSecretShopId("shop-2"), false);
  });

  it("does not decrypt or reencrypt seller-hub rows when listing auto-reply secrets", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-auto-reply-secrets-key-32chars!!";
    delete process.env.CRON_SECRET;
    const hubCipher = "hub.not.auto-reply-format-on-purpose";
    const db = memorySecretsDb([
      {
        user_id: "u1",
        shop_id: "main",
        marketplace_id: "wildberries",
        api_key_ciphertext: encryptAutoReplySecret("wb-main-token"),
      },
      {
        user_id: "u1",
        shop_id: SELLER_HUB_WB_SHOP_ID,
        marketplace_id: "wildberries",
        api_key_ciphertext: hubCipher,
      },
    ]);

    const listed = await listMarketplaceSecretsForUser(db as never, "u1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.shopId, "main");
    assert.equal(listed[0]?.apiKey, "wb-main-token");
    assert.equal(
      db.rows.find((r) => r.shop_id === SELLER_HUB_WB_SHOP_ID)?.api_key_ciphertext,
      hubCipher,
    );
    assert.equal(
      db.ops.some(
        (op) =>
          op.type === "update" &&
          (op.payload as { shop_id?: string })?.shop_id === SELLER_HUB_WB_SHOP_ID,
      ),
      false,
    );
    assert.equal(
      db.ops.some(
        (op) =>
          op.type === "delete" &&
          (op.payload as { shop_id?: string })?.shop_id === SELLER_HUB_WB_SHOP_ID,
      ),
      false,
    );
  });

  it("reads secrets for several ordinary auto-reply shops", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-auto-reply-secrets-key-32chars!!";
    const db = memorySecretsDb([
      {
        user_id: "u1",
        shop_id: "main",
        marketplace_id: "wildberries",
        api_key_ciphertext: encryptAutoReplySecret("token-main"),
      },
      {
        user_id: "u1",
        shop_id: "shop-b",
        marketplace_id: "ozon",
        api_key_ciphertext: encryptAutoReplySecret("token-ozon"),
        client_id: "123",
      },
      {
        user_id: "u1",
        shop_id: SELLER_HUB_WB_SHOP_ID,
        marketplace_id: "wildberries",
        api_key_ciphertext: "seller-hub-cipher",
      },
    ]);

    const listed = await listMarketplaceSecretsForUser(db as never, "u1");
    assert.equal(listed.length, 2);
    const byShop = new Map(listed.map((s) => [s.shopId, s]));
    assert.equal(byShop.get("main")?.apiKey, "token-main");
    assert.equal(byShop.get("shop-b")?.apiKey, "token-ozon");
    assert.equal(byShop.get("shop-b")?.clientId, "123");
    assert.equal(byShop.has(SELLER_HUB_WB_SHOP_ID), false);
  });

  it("reencrypts old auto-reply secrets with AUTO_REPLY_SECRETS_KEY and leaves hub untouched", async () => {
    delete process.env.CRON_SECRET;
    process.env.AUTO_REPLY_SECRETS_KEY = "new-primary-auto-reply-key-32chars!!!";
    const oldCipher = encryptWithRawKey("legacy-token", "karto-auto-reply-dev-key");
    const hubCipher = "hub-cipher-must-stay";
    const db = memorySecretsDb([
      {
        user_id: "u1",
        shop_id: "main",
        marketplace_id: "wildberries",
        api_key_ciphertext: oldCipher,
      },
      {
        user_id: "u1",
        shop_id: SELLER_HUB_WB_SHOP_ID,
        marketplace_id: "wildberries",
        api_key_ciphertext: hubCipher,
      },
    ]);

    const listed = await listMarketplaceSecretsForUser(db as never, "u1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.apiKey, "legacy-token");

    const main = db.rows.find((r) => r.shop_id === "main");
    assert.ok(main);
    assert.notEqual(main!.api_key_ciphertext, oldCipher);
    assert.equal(decryptAutoReplySecret(main!.api_key_ciphertext), "legacy-token");
    assert.equal(
      db.rows.find((r) => r.shop_id === SELLER_HUB_WB_SHOP_ID)?.api_key_ciphertext,
      hubCipher,
    );
  });

  it("keeps a broken auto-reply row when decrypt fails and does not touch seller-hub", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-auto-reply-secrets-key-32chars!!";
    const goodCipher = encryptAutoReplySecret("good");
    const brokenCipher = "not.a.valid.ciphertext";
    const hubCipher = "hub-stay";
    const db = memorySecretsDb([
      {
        user_id: "u1",
        shop_id: "main",
        marketplace_id: "wildberries",
        api_key_ciphertext: goodCipher,
      },
      {
        user_id: "u1",
        shop_id: "broken-shop",
        marketplace_id: "ozon",
        api_key_ciphertext: brokenCipher,
      },
      {
        user_id: "u1",
        shop_id: SELLER_HUB_WB_SHOP_ID,
        marketplace_id: "wildberries",
        api_key_ciphertext: hubCipher,
      },
    ]);

    const listed = await listMarketplaceSecretsForUser(db as never, "u1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.shopId, "main");
    assert.equal(
      db.rows.find((r) => r.shop_id === "broken-shop")?.api_key_ciphertext,
      brokenCipher,
    );
    assert.equal(
      db.rows.find((r) => r.shop_id === SELLER_HUB_WB_SHOP_ID)?.api_key_ciphertext,
      hubCipher,
    );
    assert.equal(db.ops.some((op) => op.type === "delete"), false);
  });

  it("refuses upsert/delete of seller-hub via auto-reply helpers", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-auto-reply-secrets-key-32chars!!";
    const hubCipher = "hub-original";
    const db = memorySecretsDb([
      {
        user_id: "u1",
        shop_id: SELLER_HUB_WB_SHOP_ID,
        marketplace_id: "wildberries",
        api_key_ciphertext: hubCipher,
      },
    ]);

    await assert.rejects(
      () =>
        upsertMarketplaceSecrets(db as never, "u1", [
          {
            shopId: SELLER_HUB_WB_SHOP_ID,
            marketplaceId: "wildberries",
            apiKey: "should-not-write",
          },
        ]),
      /Seller Hub/,
    );
    await assert.rejects(
      () =>
        upsertMarketplaceSecrets(db as never, "u1", [
          {
            shopId: SELLER_HUB_WB_SHOP_ID,
            marketplaceId: "wildberries",
            apiKey: "",
          },
        ]),
      /Seller Hub/,
    );
    assert.equal(db.rows[0]?.api_key_ciphertext, hubCipher);
    assert.equal(db.ops.length, 0);
  });
});
