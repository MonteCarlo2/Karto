import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unifyFeed, type FeedFinding, type FeedTask } from "./feed";

const task = (id: string, title: string, nmId: string | null, severity = "important"): FeedTask => ({ id, type: "T", title, nmId, severity });
const finding = (over: Partial<FeedFinding> = {}): FeedFinding => ({ id: "f1", nmId: "1", kind: "money", severity: "important", title: "Продажи в убыток", what: "", whyNow: "", humanAdvice: "", evidence: [], second: "agree", secondReason: "", action: null, ...over });

describe("единая лента алгоритмов и ИИ", () => {
  it("алгоритм и ИИ об одном: одна карточка с двумя источниками", () => {
    const feed = unifyFeed([task("t1", "Убыточная цена", "1")], [finding()]);
    assert.equal(feed.length, 1);
    assert.equal(feed[0]!.source, "both");
    assert.deepEqual(feed[0]!.taskIds, ["t1"]);
  });
  it("ИИ видит то, чего нет у алгоритма: карточка только от ИИ; задача без находки остаётся от алгоритма", () => {
    const feed = unifyFeed([task("t1", "Излишек запаса", "1"), task("t2", "Товар не продаётся", "2")], [finding({ kind: "reviews", title: "Низкий рейтинг" })]);
    assert.equal(feed.length, 3);
    assert.equal(feed.find((i) => i.finding)!.source, "ai");
    assert.equal(feed.filter((i) => i.source === "algorithm").length, 2);
  });
  it("важность берётся наибольшая из двух, критичные идут первыми", () => {
    const feed = unifyFeed([task("t1", "Убыточная цена", "1", "critical"), task("t2", "Излишек запаса", "9", "opportunity")], [finding({ severity: "watch" })]);
    assert.equal(feed[0]!.severity, "critical");
    assert.equal(feed[feed.length - 1]!.severity, "watch");
  });
  it("задача одного товара не сливается с находкой другого", () => {
    const feed = unifyFeed([task("t1", "Убыточная цена", "2")], [finding({ nmId: "1" })]);
    assert.equal(feed.length, 2);
  });
});
