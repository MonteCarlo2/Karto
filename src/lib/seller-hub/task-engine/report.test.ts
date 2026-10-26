import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedTasksCsv, csvCell } from "./report";
import type { SellerTask } from "./types";

function task(patch: Partial<SellerTask>): SellerTask {
  return {
    id: "t1",
    storeId: "s",
    nmId: "123",
    itemId: null,
    productTitle: "Ведро 10л",
    vendorCode: "V-1",
    type: "TASK_NEGATIVE_MARGIN",
    category: "economics",
    severity: "critical",
    status: "completed",
    title: "Убыточная цена",
    description: "",
    reason: "",
    evidence: {} as SellerTask["evidence"],
    recommendation: "",
    actionType: "NONE",
    businessImpactType: "PROFIT_PROTECTION" as SellerTask["businessImpactType"],
    score: 0,
    sourceEventId: null,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-10T10:00:00Z",
    snoozeUntil: null,
    resolvedAt: "2026-10-10T10:00:00Z",
    resolution: null,
    ...patch,
  };
}

describe("completedTasksCsv", () => {
  it("кавычки удваиваются, формулы экранируются", () => {
    assert.equal(csvCell('он сказал "да"'), '"он сказал ""да"""');
    assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
    assert.equal(csvCell(null), '""');
  });

  it("в отчёт попадают только завершённые, с BOM и заголовком", () => {
    const csv = completedTasksCsv([task({}), task({ id: "t2", status: "active", title: "Не должна попасть" })]);
    assert.ok(csv.startsWith("﻿\"Завершена\";"));
    assert.ok(csv.includes("Убыточная цена"));
    assert.ok(!csv.includes("Не должна попасть"));
    assert.ok(csv.includes("Цены и маржа"));
  });

  it("без завершённых остаётся только заголовок", () => {
    const lines = completedTasksCsv([task({ status: "active" })]).trim().split("\r\n");
    assert.equal(lines.length, 1);
  });
});
