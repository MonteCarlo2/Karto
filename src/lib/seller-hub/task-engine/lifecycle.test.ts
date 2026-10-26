import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionableTasks,
  isPendingSnooze,
  parseTaskStatusPatch,
  reconcileRowWritable,
  snoozeChoices,
  statusUpdateAllowed,
  taskStatusWriteDecision,
} from "./lifecycle";

const NOW = Date.parse("2026-10-08T10:00:00.000Z");

describe("task status patch", () => {
  it("accepts manual completion and ignores a user id in the body", () => {
    const parsed = parseTaskStatusPatch({ status: "completed", userId: "attacker" }, NOW);
    assert.deepEqual(parsed, { ok: true, patch: { status: "completed" } });
    assert.equal(parsed.ok && "userId" in parsed.patch, false);
  });

  it("rejects a status that cannot be saved and a date that is not in the future", () => {
    assert.equal(parseTaskStatusPatch({ status: "active" }, NOW).ok, false);
    assert.equal(parseTaskStatusPatch({ status: "dismissed" }, NOW).ok, false);
    assert.equal(parseTaskStatusPatch({ status: "snoozed" }, NOW).ok, false);
    assert.equal(parseTaskStatusPatch({ status: "snoozed", snoozeUntil: "завтра" }, NOW).ok, false);
    assert.equal(parseTaskStatusPatch({ status: "snoozed", snoozeUntil: "2026-10-08T10:00:00.000Z" }, NOW).ok, false);
    assert.equal(parseTaskStatusPatch({ status: "snoozed", snoozeUntil: "2026-10-07T10:00:00.000Z" }, NOW).ok, false);
    const future = parseTaskStatusPatch({ status: "snoozed", snoozeUntil: "2026-10-09T10:00:00.000Z" }, NOW);
    assert.equal(future.ok, true);
    if (future.ok && future.patch.status === "snoozed") {
      assert.equal(future.patch.snoozeUntil, "2026-10-09T10:00:00.000Z");
    }
  });

  it("offers three future snooze deadlines", () => {
    const from = new Date("2026-10-08T10:00:00.000Z");
    const choices = snoozeChoices(from);
    assert.deepEqual(
      choices.map((choice) => choice.label),
      ["До завтра", "На 3 дня", "На 7 дней"],
    );
    for (const choice of choices) {
      assert.ok(Date.parse(choice.until) > from.getTime());
    }
  });
});

describe("task status access", () => {
  it("does not let another user or another shop change the task", () => {
    const row = { userId: "owner", marketplaceId: "wildberries", status: "active" as const };
    assert.equal(statusUpdateAllowed("owner", "other"), false);
    assert.equal(statusUpdateAllowed(null, "owner"), false);
    assert.equal(
      taskStatusWriteDecision(row, { userId: "other", marketplaceId: "wildberries" }),
      "missing",
    );
    assert.equal(
      taskStatusWriteDecision(row, { userId: "owner", marketplaceId: "ozon" }),
      "missing",
    );
    assert.equal(taskStatusWriteDecision(null, { userId: "owner", marketplaceId: "wildberries" }), "missing");
    assert.equal(
      taskStatusWriteDecision({ ...row, status: "completed" }, { userId: "owner", marketplaceId: "wildberries" }),
      "closed",
    );
    assert.equal(
      taskStatusWriteDecision({ ...row, status: "dismissed" }, { userId: "owner", marketplaceId: "wildberries" }),
      "closed",
    );
    assert.equal(
      taskStatusWriteDecision(row, { userId: "owner", marketplaceId: "wildberries" }),
      "apply",
    );
  });

  it("does not let an older reconcile overwrite a newer row", () => {
    assert.equal(reconcileRowWritable("2026-10-08T10:00:00.000Z", "2026-10-08T10:00:00.000Z"), true);
    assert.equal(reconcileRowWritable("2026-10-08T10:00:00.000Z", "2026-10-08T10:05:00.000Z"), false);
    assert.equal(reconcileRowWritable("2026-10-08T10:00:00.000Z", null), false);
    assert.equal(reconcileRowWritable(undefined, null), true);
  });
});

describe("actionable tasks", () => {
  it("counts active work without a future snooze, a completion, or a dismissal", () => {
    const rows = [
      { status: "active" as const, snoozeUntil: null, severity: "critical" },
      { status: "in_progress" as const, snoozeUntil: null, severity: "opportunity" },
      { status: "snoozed" as const, snoozeUntil: "2026-10-15T10:00:00.000Z", severity: "critical" },
      { status: "snoozed" as const, snoozeUntil: "2026-10-08T09:00:00.000Z", severity: "important" },
      { status: "completed" as const, snoozeUntil: null, severity: "critical" },
      { status: "dismissed" as const, snoozeUntil: null, severity: "critical" },
    ];
    const open = actionableTasks(rows, NOW);
    assert.deepEqual(
      open.map((row) => row.severity),
      ["critical", "opportunity", "important"],
    );
    assert.equal(open.some((row) => row.snoozeUntil === "2026-10-15T10:00:00.000Z"), false);
    assert.equal(isPendingSnooze(rows[2]!, NOW), true);
    assert.equal(rows.filter((row) => isPendingSnooze(row, NOW)).length, 1);
  });
});
