import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
  SELLER_HUB_WB_MARKETPLACE_ID,
  SELLER_HUB_WB_SHOP_ID,
  connectSellerHubWbToken,
  decryptSellerHubWbToken,
  disconnectSellerHubWbToken,
  encryptSellerHubWbToken,
  localRootAfterWbMigration,
  migrateSellerHubWbToken,
  openSellerHubWbToken,
  replaceSellerHubWbToken,
  safeSellerHubMessage,
  shouldClearLocalApiKeyAfterMigrate,
  stripWbApiKeyForPersist,
  type SellerHubSecretDb,
} from "./wb-token";
import { settlePriceUpload } from "./price-write";
import { patchSellerHubConnection, readSellerHubRoot } from "./store";

function memoryDb(seed?: Map<string, string>): SellerHubSecretDb & { rows: Map<string, string>; mainRows: Map<string, string> } {
  const rows = seed ?? new Map<string, string>();
  const mainRows = new Map<string, string>();
  return {
    rows,
    mainRows,
    async findHub(userId) {
      const ciphertext = rows.get(userId);
      return ciphertext ? { ciphertext } : null;
    },
    async upsertHub(userId, ciphertext) {
      rows.set(userId, ciphertext);
    },
    async deleteHub(userId) {
      rows.delete(userId);
    },
  };
}

const previousKey = process.env.AUTO_REPLY_SECRETS_KEY;
const previousCron = process.env.CRON_SECRET;

afterEach(() => {
  if (previousKey == null) delete process.env.AUTO_REPLY_SECRETS_KEY;
  else process.env.AUTO_REPLY_SECRETS_KEY = previousKey;
  if (previousCron == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCron;
});

describe("seller hub wb token storage (mocked)", () => {
  it("user reads only own secret", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("user-a", "token-a", db, async () => ({ sellerName: "A" }));
    await connectSellerHubWbToken("user-b", "token-b", db, async () => ({ sellerName: "B" }));
    const a = await openSellerHubWbToken("user-a", db);
    const b = await openSellerHubWbToken("user-b", db);
    assert.equal(a.ok && a.token, "token-a");
    assert.equal(b.ok && b.token, "token-b");
  });

  it("another session cannot read change or delete this secret", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("owner", "secret-token", db, async () => ({ sellerName: "Owner" }));
    const stranger = await openSellerHubWbToken("stranger", db);
    assert.equal(stranger.ok, false);
    await disconnectSellerHubWbToken("stranger", db);
    const stillThere = await openSellerHubWbToken("owner", db);
    assert.equal(stillThere.ok && stillThere.token, "secret-token");
  });

  it("does not write a new secret without AUTO_REPLY_SECRETS_KEY", async () => {
    delete process.env.AUTO_REPLY_SECRETS_KEY;
    delete process.env.CRON_SECRET;
    const db = memoryDb();
    const result = await connectSellerHubWbToken("user", "token", db, async () => ({ sellerName: "X" }));
    assert.equal(result.ok, false);
    assert.equal(db.rows.size, 0);
    assert.throws(() => encryptSellerHubWbToken("token"));
  });

  it("does not use CRON_SECRET or the built-in dev key for new writes", async () => {
    delete process.env.AUTO_REPLY_SECRETS_KEY;
    process.env.CRON_SECRET = "cron-only-secret";
    const db = memoryDb();
    const result = await connectSellerHubWbToken("user", "token", db, async () => ({ sellerName: "X" }));
    assert.equal(result.ok, false);
    assert.equal(db.rows.size, 0);
  });

  it("migrates once then clears local apiKey only after confirm", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    const root = {
      connections: {
        wildberries: { apiKey: "local-token", status: "active" as const, marketplaceId: "wildberries" as const },
      },
    };
    const failed = await migrateSellerHubWbToken("user", "local-token", db, async () => {
      throw new Error("wb down");
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.keepLocal, true);
    assert.equal(root.connections.wildberries.apiKey, "local-token");

    const ok = await migrateSellerHubWbToken("user", "local-token", db, async () => ({ sellerName: "Shop" }));
    assert.equal(ok.ok, true);
    const cleared = localRootAfterWbMigration(root, ok);
    assert.equal(cleared.connections.wildberries?.apiKey, "");
    const opened = await openSellerHubWbToken("user", db);
    assert.equal(opened.ok && opened.token, "local-token");
  });

  it("does not overwrite an existing server secret during migration", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("user", "server-token", db, async () => ({ sellerName: "Server" }));
    const seen: string[] = [];
    const result = await migrateSellerHubWbToken("user", "stale-local", db, async (token) => {
      seen.push(token);
      return { sellerName: "Verified" };
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.alreadyStored, true);
      assert.equal(result.serverVerified, true);
    }
    assert.deepEqual(seen, ["server-token"]);
    const opened = await openSellerHubWbToken("user", db);
    assert.equal(opened.ok && opened.token, "server-token");
  });

  it("alreadyStored without successful server verify keeps local apiKey", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("user", "server-token", db, async () => ({ sellerName: "Server" }));
    const root = {
      connections: {
        wildberries: {
          apiKey: "local-token-keep-me",
          status: "active" as const,
          marketplaceId: "wildberries" as const,
        },
      },
    };
    const result = await migrateSellerHubWbToken("user", "local-token-keep-me", db, async () => {
      throw new Error("wb down for server-token");
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.keepLocal, true);
      assert.equal(result.alreadyStored, true);
      assert.doesNotMatch(result.error, /server-token|local-token-keep-me/);
    }
    assert.equal(shouldClearLocalApiKeyAfterMigrate(result), false);
    const kept = localRootAfterWbMigration(root, result);
    assert.equal(kept.connections.wildberries?.apiKey, "local-token-keep-me");
    const opened = await openSellerHubWbToken("user", db);
    assert.equal(opened.ok && opened.token, "server-token");
  });

  it("alreadyStored with verified server connection clears local apiKey", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("user", "server-token", db, async () => ({ sellerName: "Server" }));
    const root = {
      connections: {
        wildberries: {
          apiKey: "local-token",
          status: "active" as const,
          marketplaceId: "wildberries" as const,
        },
      },
    };
    const result = await migrateSellerHubWbToken("user", "local-token", db, async (token) => {
      assert.equal(token, "server-token");
      return { sellerName: "Shop", sampleCount: 2 };
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.alreadyStored, true);
      assert.equal(result.serverVerified, true);
    }
    assert.equal(shouldClearLocalApiKeyAfterMigrate(result), true);
    const cleared = localRootAfterWbMigration(root, result);
    assert.equal(cleared.connections.wildberries?.apiKey, "");
  });

  it("draft token is not written to seller-hub localStorage", () => {
    const uid = "draft-token-user";
    const key = `karto-seller-hub-v1:${uid}`;
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    const g = globalThis as {
      window?: unknown;
      localStorage?: typeof storage;
    };
    const prevWindow = g.window;
    const prevStorage = g.localStorage;
    g.window = globalThis;
    g.localStorage = storage;

    try {
      patchSellerHubConnection(uid, "wildberries", {
        apiKey: "draft-secret-should-not-persist",
        status: "idle",
        sellerName: "Keep Me",
        catalogCount: 12,
      });
      const raw = storage.getItem(key);
      assert.ok(raw);
      assert.doesNotMatch(raw, /draft-secret-should-not-persist/);
      assert.match(raw!, /Keep Me/);
      assert.match(raw!, /"catalogCount":12/);
      const root = readSellerHubRoot(uid);
      assert.equal(root.connections.wildberries?.apiKey, "");
      assert.equal(root.connections.wildberries?.sellerName, "Keep Me");
      assert.equal(root.connections.wildberries?.catalogCount, 12);

      const stripped = stripWbApiKeyForPersist("wildberries", {
        apiKey: "another-draft",
        status: "idle" as const,
        marketplaceId: "wildberries" as const,
      });
      assert.equal(stripped.apiKey, "");

      const ozonKept = stripWbApiKeyForPersist("ozon", {
        apiKey: "ozon-key",
        status: "idle" as const,
        marketplaceId: "ozon" as const,
      });
      assert.equal(ozonKept.apiKey, "ozon-key");
    } finally {
      if (prevWindow === undefined) delete g.window;
      else g.window = prevWindow;
      if (prevStorage === undefined) delete g.localStorage;
      else g.localStorage = prevStorage;
    }
  });

  it("connect failure does not wipe previously saved connection metadata", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    const prior = await connectSellerHubWbToken("user", "good-token", db, async () => ({
      sellerName: "Shop",
      sampleCount: 3,
    }));
    assert.equal(prior.ok, true);
    const failed = await replaceSellerHubWbToken("user", "bad-token", db, async () => {
      throw new Error("invalid token bad-token");
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.doesNotMatch(failed.error, /bad-token|good-token/);
    }
    const opened = await openSellerHubWbToken("user", db);
    assert.equal(opened.ok && opened.token, "good-token");
  });

  it("successful connect result clears draft via strip and clear helpers", () => {
    assert.equal(shouldClearLocalApiKeyAfterMigrate({ ok: true }), true);
    assert.equal(
      shouldClearLocalApiKeyAfterMigrate({ ok: true, alreadyStored: true, serverVerified: true }),
      true,
    );
    assert.equal(
      shouldClearLocalApiKeyAfterMigrate({ ok: true, alreadyStored: true, serverVerified: false }),
      false,
    );
    assert.equal(shouldClearLocalApiKeyAfterMigrate({ ok: false, keepLocal: true }), false);
    const cleared = stripWbApiKeyForPersist("wildberries", { apiKey: "typed-in-field" });
    assert.equal(cleared.apiKey, "");
  });

  it("keeps the old secret when replace fails and uses the new one after success", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    await connectSellerHubWbToken("user", "old-token", db, async () => ({ sellerName: "Old" }));
    const failed = await replaceSellerHubWbToken("user", "new-token", db, async () => {
      throw new Error("bad token");
    });
    assert.equal(failed.ok, false);
    const kept = await openSellerHubWbToken("user", db);
    assert.equal(kept.ok, true);
    if (kept.ok) assert.equal(kept.token, "old-token");

    const ok = await replaceSellerHubWbToken("user", "new-token", db, async () => ({ sellerName: "New" }));
    assert.equal(ok.ok, true);
    const opened = await openSellerHubWbToken("user", db);
    assert.equal(opened.ok, true);
    if (opened.ok) assert.equal(opened.token, "new-token");
  });

  it("disconnect removes only the seller-hub row key space", async () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const db = memoryDb();
    db.mainRows.set("user", "main-ciphertext");
    await connectSellerHubWbToken("user", "hub-token", db, async () => ({ sellerName: "Hub" }));
    await disconnectSellerHubWbToken("user", db);
    assert.equal(db.rows.has("user"), false);
    assert.equal(db.mainRows.get("user"), "main-ciphertext");
    assert.equal(SELLER_HUB_WB_SHOP_ID, "seller-hub");
    assert.notEqual(SELLER_HUB_WB_SHOP_ID, "main");
    assert.equal(SELLER_HUB_WB_MARKETPLACE_ID, "wildberries");
  });

  it("sanitizes responses so token and Authorization do not leak", () => {
    const msg = safeSellerHubMessage("Bearer abc.def.ghi failed for token-xyz", "token-xyz");
    assert.doesNotMatch(msg, /token-xyz/);
    assert.doesNotMatch(msg, /Bearer/);
    assert.doesNotMatch(msg, /abc\.def\.ghi/);
  });

  it("encrypts and decrypts with AUTO_REPLY_SECRETS_KEY only", () => {
    process.env.AUTO_REPLY_SECRETS_KEY = "test-seller-hub-secrets-key-32chars!";
    const cipher = encryptSellerHubWbToken("plain-wb-token");
    assert.match(cipher, /^[^.]+\.[^.]+\.[^.]+$/);
    assert.equal(decryptSellerHubWbToken(cipher), "plain-wb-token");
  });

  it("all listed WB routes ignore client apiKey and use the server helper", () => {
    const routes = [
      "verify",
      "sync-catalog",
      "funnel",
      "realization",
      "categories",
      "cards/read",
      "promotions/terms",
      "promotions/roster",
      "prices/update",
      "stocks/update",
      "cards/update",
      "media/upload",
      "media/save",
      "ads/toggle",
      "ads/stats",
      "ads/deposit",
      "ads/clusters",
      "ads/bids",
      "ads/minus",
      "ads/bid",
      "ads/create",
      "ads/nm",
      "ads/cluster-bid",
      "ads/placements",
      "logistics/stocks",
      "logistics/regions",
      "logistics/acceptance",
      "analytics/period",
      "risks/blocked",
      "seo/search-texts",
      "orders/supply",
      "orders/supply-orders",
      "promotions/manage",
    ];
    for (const route of routes) {
      const source = readFileSync(`src/app/api/seller-hub/wildberries/${route}/route.ts`, "utf8");
      assert.match(source, /requireSellerHubWbToken/);
      assert.doesNotMatch(source, /parseApiKey/);
    }
    const client = readFileSync("src/lib/seller-hub/client-api.ts", "utf8");
    assert.doesNotMatch(client, /body\.set\("apiKey"/);
    assert.match(client, /manageSellerHubWbConnection/);
  });

  it("UI draft and connection responses do not persist or echo WB token", () => {
    const hub = readFileSync("src/components/seller-hub/hub-integration.tsx", "utf8");
    assert.match(hub, /wbTokenDraft/);
    assert.match(hub, /onWbTokenDraftChange/);
    assert.match(
      hub,
      /if \(marketplaceId === "wildberries"\) \{\s*onWbTokenDraftChange\?\.\(e\.target\.value\);/,
    );
    assert.doesNotMatch(hub, /onPatch\(\{\s*apiKey: e\.target\.value,\s*\.\.\.\(marketplaceId === "wildberries"/);
    const app = readFileSync("src/components/seller-hub/seller-hub-app.tsx", "utf8");
    assert.match(app, /stripWbApiKeyForPersist/);
    assert.match(app, /shouldClearLocalApiKeyAfterMigrate/);
    assert.match(app, /setWbTokenDraft\(""\)/);
    const route = readFileSync("src/app/api/seller-hub/wildberries/connection/route.ts", "utf8");
    assert.match(route, /serverVerified/);
    assert.match(route, /function publicResult/);
    const publicBlock = route.slice(route.indexOf("function publicResult"), route.indexOf("export async function GET"));
    assert.doesNotMatch(publicBlock, /\btoken\b/);
    assert.doesNotMatch(publicBlock, /ciphertext/);
    assert.doesNotMatch(route, /NextResponse\.json\(\{[^}]*\btoken\b/);
  });

  it("price confirmation logic did not regress", () => {
    const accepted = settlePriceUpload({ uploadOk: true, uploadId: 1 });
    assert.equal(accepted.outcome, "unknown");
    assert.equal(accepted.applyLocal, false);
    const confirmed = settlePriceUpload({
      uploadOk: true,
      uploadId: 2,
      waitOutcome: "processed",
      read: "match",
    });
    assert.equal(confirmed.outcome, "confirmed");
    assert.equal(confirmed.applyLocal, true);
  });
});
