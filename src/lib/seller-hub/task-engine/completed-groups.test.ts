import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapseCompleted } from "./completed-groups";
import type { SellerTask } from "./types";

const task = (id: string, type: SellerTask["type"], nmId: string | null, resolvedAt: string): SellerTask =>
  ({ id, type, nmId, resolvedAt, updatedAt: resolvedAt, status: "completed" }) as unknown as SellerTask;

describe("завершённые задачи: группировка повторов", () => {
  it("одна строка на пару «тип + товар»: самая свежая, с числом повторов; разные товары и типы не склеиваются", () => {
    const out = collapseCompleted([
      task("a1", "TASK_EXCESS_STOCK", "1", "2026-10-10T10:00:00Z"),
      task("a2", "TASK_EXCESS_STOCK", "1", "2026-10-16T10:00:00Z"),
      task("a3", "TASK_EXCESS_STOCK", "1", "2026-10-13T10:00:00Z"),
      task("b1", "TASK_EXCESS_STOCK", "2", "2026-10-12T10:00:00Z"),
      task("c1", "TASK_NO_SALES", "1", "2026-10-11T10:00:00Z"),
    ]);
    assert.equal(out.length, 3);
    const a = out.find((g) => g.task.nmId === "1" && g.task.type === "TASK_EXCESS_STOCK")!;
    assert.equal(a.task.id, "a2");
    assert.equal(a.repeats, 3);
    assert.equal(out.find((g) => g.task.id === "b1")!.repeats, 1);
  });

  it("порядок — по времени закрытия, свежие сверху; задачи магазина без товара группируются по типу", () => {
    const out = collapseCompleted([task("s1", "TASK_UNANSWERED_REVIEWS", null, "2026-10-10T10:00:00Z"), task("s2", "TASK_UNANSWERED_REVIEWS", null, "2026-10-11T10:00:00Z"), task("x", "TASK_NO_SALES", "9", "2026-10-15T10:00:00Z")]);
    assert.deepEqual(out.map((g) => g.task.id), ["x", "s2"]);
    assert.equal(out[1]!.repeats, 2);
    assert.deepEqual(collapseCompleted([]), []);
  });
});
