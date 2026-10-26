import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGatedFetch, installWbGate } from "./gated-fetch";
import { wbLimitFor } from "./index";
import { WbRateGate } from "./rate-gate";

/** Виртуальные часы: sleep двигает время, а не ждёт по-настоящему. */
function clock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, advance: (ms: number) => { t += ms; } };
}

/** Ключ кабинета для токена «t» так же, как считает шлюз (хэш заголовка Authorization). */
function shortKeyForTest(): string {
  let h = 5381;
  for (let i = 0; i < "t".length; i += 1) h = ((h << 5) + h + "t".charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function fakeFetch(statuses: number[] = [], headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; at: number; authorization: string }> = [];
  const c = clock();
  const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), at: c.now(), authorization: String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "") });
    const status = statuses.shift() ?? 200;
    return new Response("{}", { status, headers });
  }) as typeof fetch;
  return { base, calls, c };
}

describe("fetch со шлюзом лимитов WB", () => {
  it("запросы не к WB проходят без ожидания", async () => {
    const { base, calls, c } = fakeFetch();
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep });
    await gated("https://example.com/a");
    await gated("https://example.com/a");
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.at, calls[0]!.at);
  });

  it("статистика рекламы: подряд идущие запросы разносятся на интервал (20 с + запас)", async () => {
    const { base, calls, c } = fakeFetch();
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep });
    const url = "https://advert-api.wildberries.ru/adv/v3/fullstats?ids=1";
    await gated(url, { headers: { Authorization: "tokenA" } });
    await gated(url, { headers: { Authorization: "tokenA" } });
    assert.ok(calls[1]!.at - calls[0]!.at >= 20_000, `интервал ${calls[1]!.at - calls[0]!.at}`);
  });

  it("лимит на токен: другой токен не ждёт", async () => {
    const { base, calls, c } = fakeFetch();
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep });
    const url = "https://advert-api.wildberries.ru/adv/v3/fullstats?ids=1";
    await gated(url, { headers: { Authorization: "tokenA" } });
    await gated(url, { headers: { Authorization: "tokenB" } });
    assert.equal(calls[1]!.at, calls[0]!.at);
  });

  it("429: следующий запрос ждёт паузу из ответа WB", async () => {
    const { base, calls, c } = fakeFetch([429], { "x-ratelimit-retry": "30" });
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep });
    const url = "https://statistics-api.wildberries.ru/api/v1/supplier/orders";
    const first = await gated(url, { headers: { Authorization: "t" } });
    assert.equal(first.status, 429);
    await gated(url, { headers: { Authorization: "t" } });
    assert.ok(calls[1]!.at - calls[0]!.at >= 30_000);
  });

  it("журнал: сообщает ключ лимита, ожидание и статус ответа", async () => {
    const { base, c } = fakeFetch();
    const seen: string[] = [];
    const gated = createGatedFetch(base, {
      now: c.now,
      sleep: c.sleep,
      onRequest: (i) => seen.push(`req ${i.method} ${i.path} wait=${i.waitedMs} known=${i.known}`),
      onResponse: (i) => seen.push(`res ${i.status}`),
    });
    await gated("https://statistics-api.wildberries.ru/api/v1/supplier/orders", { headers: { Authorization: "t" } });
    assert.deepEqual(seen, ["req GET /api/v1/supplier/orders wait=0 known=true", "res 200"]);
  });

  it("клиентский таймаут, истёкший пока запрос стоял в очереди лимита, не обрывает запрос: время очереди не время ответа WB", async () => {
    const { base, calls, c } = fakeFetch();
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep, gate: new WbRateGate() });
    const url = "https://advert-api.wildberries.ru/adv/v3/fullstats?ids=1";
    await gated(url, { headers: { Authorization: "t" } });
    // Клиент с таймаутом 15 с, а в очереди придётся стоять ~22 с: таймаут сработает ещё до отправки.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 0);
    const realSleep = c.sleep;
    const slowSleep = async (ms: number) => { await new Promise((r) => setTimeout(r, 5)); await realSleep(ms); };
    const gated2 = createGatedFetch(base, { now: c.now, sleep: slowSleep, gate: new WbRateGate() });
    await gated2(url, { headers: { Authorization: "t" } });
    const res = await gated2(url, { headers: { Authorization: "t" }, signal: controller.signal });
    clearTimeout(timeout);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 3);
  });

  it("после отправки таймаут клиента по-прежнему отменяет запрос", async () => {
    const c = clock();
    let aborted = false;
    const base = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
      })) as typeof fetch;
    const gate = new WbRateGate();
    const gated = createGatedFetch(base, { now: c.now, sleep: c.sleep, gate });
    const url = "https://advert-api.wildberries.ru/adv/v3/fullstats?ids=1";
    gate.record(shortKeyForTest(), wbLimitFor("GET", "/adv/v3/fullstats"), c.now());
    const controller = new AbortController();
    const pending = gated(url, { headers: { Authorization: "t" }, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await assert.rejects(pending, /aborted/);
    assert.equal(aborted, true);
  });
});

describe("глобальная установка шлюза", () => {
  it("если обёртку делает кто-то другой уже после нас (Next.js), запросы к WB всё равно проходят через шлюз и не зацикливаются", async () => {
    const saved = globalThis.fetch;
    const seen: string[] = [];
    const real = (async () => new Response("{}")) as typeof fetch;
    globalThis.fetch = real;
    const restore = installWbGate({ onRequest: (i) => seen.push(i.path), sleep: async () => {} });
    try {
      // Так делает Next.js: читает текущий fetch (наш шлюз), оборачивает его и присваивает обратно.
      const ours = globalThis.fetch;
      globalThis.fetch = (async (...args: Parameters<typeof fetch>) => ours(...args)) as typeof fetch;
      await globalThis.fetch("https://statistics-api.wildberries.ru/api/v1/supplier/orders", { headers: { Authorization: "t" } });
      await globalThis.fetch("https://example.com/");
      assert.deepEqual(seen, ["/api/v1/supplier/orders"]);
    } finally {
      restore();
      globalThis.fetch = saved;
    }
  });

  it("возврат восстанавливает прежний fetch", () => {
    const saved = globalThis.fetch;
    const restore = installWbGate();
    restore();
    assert.equal(globalThis.fetch, saved);
  });
});
