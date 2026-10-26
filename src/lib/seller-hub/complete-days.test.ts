import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastFullDaysRange, moscowDateKey, withoutIncompleteDay } from "./complete-days";

const NOW = Date.parse("2026-10-16T10:20:00+03:00");

describe("withoutIncompleteDay", () => {
  it("определяет московскую дату независимо от часового пояса машины", () => {
    assert.equal(moscowDateKey(Date.parse("2026-10-15T22:30:00Z")), "2026-10-16");
  });

  it("отбрасывает сегодняшний неполный день", () => {
    const rows = withoutIncompleteDay(
      [{ date: "2026-10-14" }, { date: "2026-10-15" }, { date: "2026-10-16" }],
      NOW,
    );
    assert.deepEqual(rows.map((row) => row.date), ["2026-10-14", "2026-10-15"]);
  });

  it("оставляет ряд, если сегодняшнего дня в нём нет", () => {
    const rows = withoutIncompleteDay([{ date: "2026-10-14" }, { date: "2026-10-15" }], NOW);
    assert.equal(rows.length, 2);
  });

  it("время снимка берётся из syncedAt, без него — 0", async () => {
    const { snapshotTimeMs } = await import("./complete-days");
    assert.equal(snapshotTimeMs({ syncedAt: "2026-10-16T07:43:32.434Z" }), Date.parse("2026-10-16T07:43:32.434Z"));
    assert.equal(snapshotTimeMs(undefined), 0);
    assert.equal(snapshotTimeMs({ syncedAt: "мусор" }), 0);
  });

  it("пустой ряд не ломается", () => {
    assert.deepEqual(withoutIncompleteDay([], NOW), []);
  });
});

describe("lastFullDaysRange", () => {
  it("7 полных дней заканчиваются вчера по Москве", () => {
    assert.deepEqual(lastFullDaysRange(NOW, 7), { dateFrom: "2026-10-09", dateTo: "2026-10-15" });
  });

  it("один день — только вчера", () => {
    assert.deepEqual(lastFullDaysRange(NOW, 1), { dateFrom: "2026-10-15", dateTo: "2026-10-15" });
  });
});
