import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { taskCategoryBreakdown } from "./breakdown";

describe("taskCategoryBreakdown", () => {
  it("считает задачи по разделам и уровням и сохраняет порядок разделов", () => {
    const rows = taskCategoryBreakdown([
      { category: "content", severity: "opportunity" },
      { category: "economics", severity: "critical" },
      { category: "economics", severity: "important" },
      { category: "content", severity: "opportunity" },
    ]);
    assert.deepEqual(
      rows.map((row) => [row.category, row.critical, row.important, row.opportunity, row.total]),
      [
        ["economics", 1, 1, 0, 2],
        ["content", 0, 0, 2, 2],
      ],
    );
  });

  it("пустой список даёт пустой результат", () => {
    assert.deepEqual(taskCategoryBreakdown([]), []);
  });
});
