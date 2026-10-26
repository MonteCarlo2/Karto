import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_SETTINGS } from "./config";
import { reconcileTasks } from "./engine";
import { taskFromEvent, type EventRowForTask } from "./from-event";

const row = (over: Partial<EventRowForTask> = {}): EventRowForTask => ({
  event_key: "stock_out:1:out", kind: "stock_out", event_group: "stock", severity: "critical", title: "Остаток закончился", detail: "Остаток: 0 шт.",
  product_title: "Ведро 10л", vendor_code: "V1", nm_id: "1", item_id: "i1", ...over,
});

describe("задача из уведомления", () => {
  it("берёт название, подробности и товар из события; важность и действие по виду", () => {
    const t = taskFromEvent(row(), "wildberries", "2026-10-21T10:00:00Z", "t1");
    assert.equal(t.type, "TASK_FROM_EVENT");
    assert.equal(t.title, "Остаток закончился");
    assert.equal(t.description, "Остаток: 0 шт.");
    assert.equal(t.productTitle, "Ведро 10л");
    assert.equal(t.severity, "critical");
    assert.equal(t.category, "stock");
    assert.equal(t.actionType, "OPEN_STOCKS");
    assert.equal(t.sourceEventId, "stock_out:1:out");
    assert.equal(t.status, "active");
  });

  it("событие без товара: задача без привязки к товару, действие «нет»; к сведению — «возможность»", () => {
    const t = taskFromEvent(row({ kind: "penalties_up", event_group: "money", severity: "important", nm_id: null, item_id: null, product_title: null }), "wildberries", "2026-10-21T10:00:00Z", "t2");
    assert.equal(t.nmId, null);
    assert.equal(t.actionType, "NONE");
    assert.equal(t.category, "economics");
    assert.equal(taskFromEvent(row({ severity: "info" }), "wildberries", "2026-10-21T10:00:00Z", "t3").severity, "opportunity");
  });

  it("пересчёт задач такую задачу не закрывает, даже если условий для неё нет", () => {
    const task = taskFromEvent(row(), "wildberries", "2026-10-21T10:00:00Z", "t4");
    const result = reconcileTasks({
      now: "2026-10-22T10:00:00.000Z",
      storeId: "wildberries",
      facts: [],
      baselines: {},
      store: { unansweredFeedbacks: null, unansweredQuestions: null, feedbacksStatus: null, unansweredPositiveCount: null, unansweredPositiveProductCount: null },
      settings: DEFAULT_TASK_SETTINGS,
      tasks: [task],
      events: [],
      createId: () => "x",
    });
    const kept = result.tasks.find((x) => x.id === "t4")!;
    assert.equal(kept.status, "active");
    assert.equal(kept.resolution, null);
  });
});
