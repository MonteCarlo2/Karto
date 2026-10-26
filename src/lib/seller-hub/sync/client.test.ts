import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDataAge, serverSnapshotVersion, shouldApplyServerSnapshot } from "./client";

const T = Date.parse("2026-10-22T11:00:00Z");

describe("серверный снимок в браузере", () => {
  it("снимок, прочитанный после последнего действия человека, применяется", () => {
    assert.equal(shouldApplyServerSnapshot({ baseLoadedAt: "2026-10-22T11:00:30Z", lastLocalChangeAt: T }), true);
  });

  it("снимок, прочитанный до действия человека, не применяется: иначе действие на секунды «откатилось» бы", () => {
    assert.equal(shouldApplyServerSnapshot({ baseLoadedAt: "2026-10-22T10:59:50Z", lastLocalChangeAt: T }), false);
  });

  it("нет действий — применяется любой снимок; нет времени чтения — не применяется", () => {
    assert.equal(shouldApplyServerSnapshot({ baseLoadedAt: "2026-10-22T11:00:30Z", lastLocalChangeAt: 0 }), true);
    assert.equal(shouldApplyServerSnapshot({ baseLoadedAt: null, lastLocalChangeAt: 0 }), false);
    assert.equal(shouldApplyServerSnapshot({ baseLoadedAt: "не дата", lastLocalChangeAt: 0 }), false);
  });

  it("версия данных не зависит от порядка источников и меняется при любом новом чтении", () => {
    const a = serverSnapshotVersion({ base: "t1", funnel: "t2" });
    assert.equal(a, serverSnapshotVersion({ funnel: "t2", base: "t1" }));
    assert.notEqual(a, serverSnapshotVersion({ base: "t3", funnel: "t2" }));
  });

  it("возраст данных: только что, минуты, часы, отставание фона", () => {
    assert.deepEqual(describeDataAge("2026-10-22T11:00:00Z", T + 20_000), { minutes: 0, label: "только что", stale: false });
    assert.equal(describeDataAge("2026-10-22T10:45:00Z", T).label, "15 мин назад");
    assert.equal(describeDataAge("2026-10-22T10:45:00Z", T).stale, false);
    const old = describeDataAge("2026-10-22T09:30:00Z", T);
    assert.equal(old.label, "1 ч 30 мин назад");
    assert.equal(old.stale, true);
    assert.equal(describeDataAge(null, T).stale, true);
  });
});
