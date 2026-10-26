import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearSnapshotCache, readSnapshotCache, writeSnapshotCache } from "./snapshot-cache";

describe("кэш серверного снимка", () => {
  it("та же версия данных: отдаётся из кэша; новая версия: нет", () => {
    writeSnapshotCache("u1", "wildberries", "v1", { n: 1 }, 1000);
    assert.deepEqual(readSnapshotCache("u1", "wildberries", "v1", 2000), { n: 1 });
    assert.equal(readSnapshotCache("u1", "wildberries", "v2", 2000), null);
  });

  it("не живёт дольше минуты, даже если версия та же", () => {
    writeSnapshotCache("u2", "wildberries", "v1", { n: 1 }, 1000);
    assert.equal(readSnapshotCache("u2", "wildberries", "v1", 1000 + 60_001), null);
  });

  it("кабинеты разных пользователей не смешиваются", () => {
    writeSnapshotCache("a", "wildberries", "v1", "A", 1000);
    writeSnapshotCache("b", "wildberries", "v1", "B", 1000);
    assert.equal(readSnapshotCache("a", "wildberries", "v1", 1500), "A");
    assert.equal(readSnapshotCache("b", "wildberries", "v1", 1500), "B");
  });

  it("явный сброс (изменили себестоимость) убирает запись", () => {
    writeSnapshotCache("u3", "wildberries", "v1", 1, 1000);
    clearSnapshotCache("u3");
    assert.equal(readSnapshotCache("u3", "wildberries", "v1", 1100), null);
  });
});
