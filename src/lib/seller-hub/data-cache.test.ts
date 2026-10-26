import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cachedFetch, decideCache, type CacheEntry, type CacheStore } from "./data-cache";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function memoryStore(initial?: CacheEntry<unknown>): CacheStore & { writes: number; entry: CacheEntry<unknown> | null } {
  const store = {
    writes: 0,
    entry: initial ?? null,
    async read<T>() {
      return store.entry as CacheEntry<T> | null;
    },
    async write(_key: string, payload: unknown) {
      store.writes += 1;
      store.entry = { payload, loadedAt: new Date().toISOString() };
    },
  };
  return store;
}

describe("decideCache", () => {
  it("нет записи — идём в WB", () => {
    assert.equal(decideCache({ loadedAt: null, nowMs: NOW, ttlMs: 1000, refresh: false }), "fetch");
  });

  it("свежая запись используется, просроченная нет", () => {
    assert.equal(decideCache({ loadedAt: ago(5_000), nowMs: NOW, ttlMs: 10_000, refresh: false }), "use");
    assert.equal(decideCache({ loadedAt: ago(15_000), nowMs: NOW, ttlMs: 10_000, refresh: false }), "fetch");
  });

  it("явное обновление не чаще раза в минуту", () => {
    assert.equal(decideCache({ loadedAt: ago(30_000), nowMs: NOW, ttlMs: 600_000, refresh: true }), "use");
    assert.equal(decideCache({ loadedAt: ago(90_000), nowMs: NOW, ttlMs: 600_000, refresh: true }), "fetch");
  });

  it("битая дата — идём в WB", () => {
    assert.equal(decideCache({ loadedAt: "мусор", nowMs: NOW, ttlMs: 1000, refresh: false }), "fetch");
  });
});

describe("cachedFetch", () => {
  it("свежий кэш не вызывает WB", async () => {
    const store = memoryStore({ payload: { a: 1 }, loadedAt: ago(1000) });
    let calls = 0;
    const result = await cachedFetch({ store, key: "k", ttlMs: 60_000, nowMs: NOW, fetcher: async () => (calls++, { a: 2 }) });
    assert.equal(calls, 0);
    assert.deepEqual(result.value, { a: 1 });
    assert.equal(result.fromCache, true);
    assert.equal(result.stale, false);
  });

  it("просроченный кэш обновляется из WB и записывается", async () => {
    const store = memoryStore({ payload: { a: 1 }, loadedAt: ago(120_000) });
    const result = await cachedFetch({ store, key: "k", ttlMs: 60_000, nowMs: NOW, fetcher: async () => ({ a: 2 }) });
    assert.deepEqual(result.value, { a: 2 });
    assert.equal(result.fromCache, false);
    assert.equal(store.writes, 1);
  });

  it("WB не ответил, а кэш есть — отдаём устаревшие данные с пометкой, а не пустоту", async () => {
    const store = memoryStore({ payload: { a: 1 }, loadedAt: ago(120_000) });
    const result = await cachedFetch({
      store,
      key: "k",
      ttlMs: 60_000,
      nowMs: NOW,
      fetcher: async () => {
        throw new Error("WB ограничил запросы");
      },
    });
    assert.deepEqual(result.value, { a: 1 });
    assert.equal(result.stale, true);
    assert.match(result.staleReason ?? "", /ограничил/);
  });

  it("WB не ответил и кэша нет — ошибка пробрасывается", async () => {
    const store = memoryStore();
    await assert.rejects(
      cachedFetch({
        store,
        key: "k",
        ttlMs: 60_000,
        nowMs: NOW,
        fetcher: async () => {
          throw new Error("сбой");
        },
      }),
      /сбой/,
    );
  });
});
