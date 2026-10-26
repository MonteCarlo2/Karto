import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job, JobContext } from "./jobs";
import type { SyncStateRow } from "./schedule";
import { SYNC_SOURCES, type SyncSourceId } from "./sources";
import type { CabinetKey } from "./store";
import { runCabinetPass, type StoreLike, type TokenResult, type WorkerDeps } from "./worker";

const KEY: CabinetKey = { userId: "u1", marketplaceId: "wildberries" };
const NOW = 1_000_000_000_000;

function fakeStore(over: { states?: SyncStateRow[]; snapshots?: SyncSourceId[]; claimDenied?: SyncSourceId[] } = {}) {
  const calls: string[] = [];
  const store: StoreLike = {
    ensureState: async () => { calls.push("ensure"); },
    loadState: async () => over.states ?? [],
    claim: async (_k, source) => { calls.push(`claim:${source}`); return !(over.claimDenied ?? []).includes(source); },
    finishOk: async (_k, source) => { calls.push(`ok:${source}`); },
    finishFail: async (_k, source, _next, fails, msg) => { calls.push(`fail:${source}:${fails}:${msg}`); },
    markTokenLost: async (_k, msg) => { calls.push(`lost:${msg}`); },
    startRun: async (_k, source) => { calls.push(`start:${source}`); return `run-${source}`; },
    finishRun: async (id, r) => { calls.push(`run:${id}:${r.status}`); },
    readSnapshot: (async (_k: CabinetKey, source: SyncSourceId) => ((over.snapshots ?? []).includes(source) ? { payload: {}, loadedAt: NOW } : null)) as StoreLike["readSnapshot"],
  };
  return { store, calls };
}

function deps(store: StoreLike, jobs: Partial<Record<SyncSourceId, Job>>, token: TokenResult = { ok: true, token: "SECRET" }): WorkerDeps {
  const all = Object.fromEntries(SYNC_SOURCES.map((s) => [s.id, jobs[s.id] ?? (async () => ({ status: "ok" as const, changed: false }))])) as Record<SyncSourceId, Job>;
  let t = NOW;
  return {
    store,
    jobs: all,
    makeContext: (key, tok, now, failCount) => ({ key, token: tok, now, failCount }) as unknown as JobContext,
    openToken: async () => token,
    now: () => (t += 1000),
    owner: "test",
    log: () => {},
    scrub: (m, tok) => m.split(tok).join("***"),
  };
}

describe("проход воркера по кабинету", () => {
  it("новый кабинет: источники читаются по приоритету, базовый первым, остальные видят его снимок", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"] });
    const order: string[] = [];
    const jobs: Partial<Record<SyncSourceId, Job>> = {};
    for (const s of SYNC_SOURCES) jobs[s.id] = async () => { order.push(s.id); return { status: "ok", changed: true }; };
    const report = await runCabinetPass(deps(store, jobs), KEY);
    assert.equal(order[0], "base");
    assert.equal(report.ran.length, SYNC_SOURCES.length);
    assert.equal(report.changed, true);
    assert.ok(calls.includes("ok:base"));
  });

  it("источник, которому нужен базовый снимок, ждёт, пока он появится", async () => {
    const { store } = fakeStore({ snapshots: [] });
    const jobs: Partial<Record<SyncSourceId, Job>> = { base: async () => ({ status: "partial", reason: "Каталог пришёл пустым" }) };
    const report = await runCabinetPass(deps(store, jobs), KEY);
    assert.equal(report.ran.find((r) => r.source === "base")?.status, "partial");
    assert.ok(report.skipped.some((s) => s.source === "ads_stats"));
    assert.equal(report.ran.some((r) => r.source === "ads_stats"), false);
  });

  it("неполный результат не считается успехом: растёт счётчик неудач, причина записана", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"], states: SYNC_SOURCES.map((s) => ({ source: s.id, nextDueAt: NOW + 3_600_000, failCount: 0, leaseUntil: null, leaseOwner: null })).map((r) => (r.source === "funnel" ? { ...r, nextDueAt: NOW - 1, failCount: 2 } : r)) });
    const report = await runCabinetPass(deps(store, { funnel: async () => ({ status: "partial", reason: "WB вернул ошибку" }) }), KEY);
    assert.deepEqual(report.ran.map((r) => r.source), ["funnel"]);
    assert.ok(calls.includes("fail:funnel:3:WB вернул ошибку"));
    assert.equal(calls.some((c) => c.startsWith("ok:")), false);
  });

  it("источник, занятый другим воркером, пропускается без ошибки", async () => {
    const { store } = fakeStore({ snapshots: ["base"], claimDenied: ["feedbacks"] });
    const report = await runCabinetPass(deps(store, {}), KEY);
    assert.ok(report.skipped.some((s) => s.source === "feedbacks" && /другим воркером/.test(s.why)));
  });

  it("ошибка 401: кабинет получает статус «токен потерян», остальные источники не читаются", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"] });
    const err = Object.assign(new Error("Токен не принят"), { status: 401 });
    const report = await runCabinetPass(deps(store, { base: async () => { throw err; } }), KEY);
    assert.equal(report.stopped, "token_lost");
    assert.equal(report.ran.length, 1);
    assert.ok(calls.some((c) => c.startsWith("lost:")));
  });

  it("ошибка 429: прогон помечен rate_limited, пауза берётся из ответа WB, кабинет не останавливается", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"] });
    const err = Object.assign(new Error("Слишком часто"), { status: 429, retryAfterSec: 30 });
    const report = await runCabinetPass(deps(store, { feedbacks: async () => { throw err; } }), KEY);
    assert.equal(report.stopped, null);
    assert.equal(report.ran.find((r) => r.source === "feedbacks")?.status, "rate_limited");
    assert.ok(calls.some((c) => c === "run:run-feedbacks:rate_limited"));
  });

  it("токен не попадает в журнал ошибок", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"] });
    const err = Object.assign(new Error("Запрос с Authorization SECRET отклонён"), { status: 500 });
    await runCabinetPass(deps(store, { feedbacks: async () => { throw err; } }), KEY);
    assert.equal(calls.some((c) => c.includes("SECRET")), false);
    assert.ok(calls.some((c) => c.includes("***")));
  });

  it("токена нет в хранилище: кабинет останавливается; ключ шифрования недоступен: кабинет не трогаем", async () => {
    const a = fakeStore();
    const lost = await runCabinetPass(deps(a.store, {}, { ok: false, reason: "missing" }), KEY);
    assert.equal(lost.stopped, "token_lost");
    assert.ok(a.calls.some((c) => c.startsWith("lost:")));
    const b = fakeStore();
    const server = await runCabinetPass(deps(b.store, {}, { ok: false, reason: "unavailable" }), KEY);
    assert.equal(server.stopped, "no_token");
    assert.equal(b.calls.some((c) => c.startsWith("lost:")), false);
  });

  it("нечего читать: токен даже не открывается", async () => {
    const states = SYNC_SOURCES.map((s) => ({ source: s.id, nextDueAt: NOW + 3_600_000, failCount: 0, leaseUntil: null, leaseOwner: null }));
    const { store } = fakeStore({ states });
    let opened = 0;
    const d = deps(store, {});
    d.openToken = async () => { opened += 1; return { ok: true, token: "t" }; };
    const report = await runCabinetPass(d, KEY);
    assert.equal(opened, 0);
    assert.equal(report.ran.length, 0);
  });
});

describe("полосы и время заданий", () => {
  it("быстрая полоса читает только быстрые источники и не ждёт медленных", async () => {
    const { store } = fakeStore({ snapshots: ["base"] });
    const report = await runCabinetPass(deps(store, {}), KEY, "fast");
    const lanes = report.ran.map((r) => SYNC_SOURCES.find((s) => s.id === r.source)!.lane);
    assert.ok(lanes.length > 0 && lanes.every((l) => l === "fast"));
    const slow = await runCabinetPass(deps(store, {}), KEY, "slow");
    assert.ok(slow.ran.every((r) => SYNC_SOURCES.find((s) => s.id === r.source)!.lane === "slow"));
  });

  it("зависшее задание обрывается по времени: ошибка записана, источник освобождён, остальные продолжают", async () => {
    const { store, calls } = fakeStore({ snapshots: ["base"] });
    const d = deps(store, { funnel: () => new Promise(() => {}) });
    d.jobTimeoutMs = 30;
    const report = await runCabinetPass(d, KEY, "slow");
    const funnel = report.ran.find((r) => r.source === "funnel");
    assert.equal(funnel?.status, "failed");
    assert.match(funnel?.note ?? "", /Превышено время/);
    assert.ok(calls.some((c) => c.startsWith("fail:funnel:1:Превышено время")));
    assert.ok(report.ran.some((r) => r.source !== "funnel" && r.status === "ok"));
  });
});

describe("сбой самой базы во время прохода", () => {
  it("если база недоступна при записи итога, проход не обрывается и остальные источники пробуются", async () => {
    const { store } = fakeStore({ snapshots: ["base"] });
    let failures = 0;
    store.finishFail = async () => { failures += 1; throw new Error("fetch failed"); };
    const jobs: Partial<Record<SyncSourceId, Job>> = { feedbacks: async () => { throw new Error("WB недоступен"); } };
    const report = await runCabinetPass(deps(store, jobs), KEY, "fast");
    assert.equal(failures, 1);
    assert.ok(report.ran.some((r) => r.source === "feedbacks" && r.status === "failed"));
    assert.ok(report.ran.length >= 2);
  });

  it("сбой при начале прогона тоже не роняет проход", async () => {
    const { store } = fakeStore({ snapshots: ["base"] });
    store.startRun = async () => { throw new Error("fetch failed"); };
    const report = await runCabinetPass(deps(store, {}), KEY, "fast");
    assert.ok(report.ran.length > 0 && report.ran.every((r) => r.status === "failed"));
  });
});
