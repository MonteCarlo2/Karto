import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextRequest } from "next/server";
import { withSyncInvalidation, type InvalidationDeps } from "./invalidate";
import type { SyncSourceId } from "./sources";

const request = {} as NextRequest;

function setup(userId: string | null = "u1", boom = false) {
  const marked: Array<{ userId: string; mp: string; sources: SyncSourceId[] }> = [];
  const deps: InvalidationDeps = {
    authorize: async () => userId,
    invalidate: async (u, mp, sources) => {
      if (boom) throw new Error("база недоступна");
      marked.push({ userId: u, mp, sources });
    },
  };
  return { marked, deps };
}

describe("пометка источников после действия", () => {
  it("успешное действие: источники помечены, ответ пользователю не изменён", async () => {
    const { marked, deps } = setup();
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const wrapped = withSyncInvalidation(async () => response, ["base", "ads_stats"], "wildberries", deps);
    assert.equal(await wrapped(request), response);
    assert.deepEqual(marked, [{ userId: "u1", mp: "wildberries", sources: ["base", "ads_stats"] }]);
  });

  it("действие не дошло до WB (неверный запрос, нет входа): ничего не помечаем", async () => {
    for (const status of [400, 401, 403]) {
      const { marked, deps } = setup();
      await withSyncInvalidation(async () => new Response("{}", { status }), ["base"], "wildberries", deps)(request);
      assert.equal(marked.length, 0, `статус ${status}`);
    }
  });

  it("неудача после отправки (таймаут, 502, «результат неизвестен», расхождение цены 409): помечаем, правду покажет перечитывание", async () => {
    for (const status of [409, 500, 502, 504]) {
      const { marked, deps } = setup();
      await withSyncInvalidation(async () => new Response("{}", { status }), ["base"], "wildberries", deps)(request);
      assert.equal(marked.length, 1, `статус ${status}`);
    }
  });

  it("сбой пометки не ломает действие пользователя", async () => {
    const { deps } = setup("u1", true);
    const response = new Response("{}", { status: 200 });
    const wrapped = withSyncInvalidation(async () => response, ["base"], "wildberries", deps);
    assert.equal(await wrapped(request), response);
  });

  it("пользователь не определён: ничего не помечаем, ответ отдаём как есть", async () => {
    const { marked, deps } = setup(null);
    const response = new Response("{}", { status: 200 });
    assert.equal(await withSyncInvalidation(async () => response, ["base"], "wildberries", deps)(request), response);
    assert.equal(marked.length, 0);
  });

  it("обработчик с дополнительными аргументами (динамические маршруты) передаёт их дальше", async () => {
    const { deps } = setup();
    let seen = "";
    const wrapped = withSyncInvalidation(async (_req: NextRequest, ctx: { id: string }) => { seen = ctx.id; return new Response("{}"); }, ["base"], "wildberries", deps);
    await wrapped(request, { id: "42" });
    assert.equal(seen, "42");
  });
});
