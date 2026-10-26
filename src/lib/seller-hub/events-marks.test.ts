import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearUnread, emptyMarks, isEventRead, isValidMarksString, isValidMutedString, matchesView, MAX_MARKED, parseMarks, parseMuted, pruneMarks, serializeMarks, serializeMuted, setArchived, setPinned, setRead } from "./events-marks";
import type { SellerProductEvent } from "./event-engine/types";

const ev = (id: string, createdAt: string, severity: SellerProductEvent["severity"] = "info"): SellerProductEvent => ({ id, createdAt, kind: "price_changed", group: "price", severity, title: id, detail: "", productTitle: null, vendorCode: null, nmId: null, itemId: null });
const attention = (e: SellerProductEvent) => e.severity !== "info";
const SEEN = Date.parse("2026-10-20T00:00:00Z");

describe("пометки уведомлений", () => {
  it("прочитано определяется меткой времени и уточняется точечными пометками", () => {
    const old = ev("old", "2026-10-19T10:00:00Z");
    const fresh = ev("fresh", "2026-10-21T10:00:00Z");
    assert.equal(isEventRead(old, emptyMarks(), SEEN), true);
    assert.equal(isEventRead(fresh, emptyMarks(), SEEN), false);
    assert.equal(isEventRead(fresh, setRead(emptyMarks(), "fresh", true), SEEN), true);
    assert.equal(isEventRead(old, setRead(emptyMarks(), "old", false), SEEN), false);
  });

  it("пометки взаимоисключающи: прочитано убирает из непрочитанных, закрепление и архив независимы", () => {
    let m = setRead(emptyMarks(), "a", false);
    m = setRead(m, "a", true);
    assert.deepEqual([m.read, m.unread], [["a"], []]);
    m = setPinned(setArchived(m, "a", true), "a", true);
    assert.deepEqual([m.pinned, m.archived], [["a"], ["a"]]);
    assert.deepEqual(setArchived(m, "a", false).archived, []);
  });

  it("запись и разбор строки: туда-обратно, мусор даёт пустые пометки, размер ограничен", () => {
    const m = setPinned(emptyMarks(), "x", true);
    assert.deepEqual(parseMarks(serializeMarks(m)), m);
    assert.deepEqual(parseMarks("не json"), emptyMarks());
    assert.deepEqual(parseMarks('{"read":[1,"ok",""]}').read, ["ok"]);
    let big = emptyMarks();
    for (let i = 0; i < MAX_MARKED + 50; i += 1) big = setArchived(big, `id${i}`, true);
    assert.equal(big.archived.length, MAX_MARKED);
    assert.equal(big.archived.at(-1), `id${MAX_MARKED + 49}`);
  });

  it("проверка настройки на сервере: только нужная форма", () => {
    assert.equal(isValidMarksString(""), true);
    assert.equal(isValidMarksString(serializeMarks(emptyMarks())), true);
    assert.equal(isValidMarksString('{"hack":["a"]}'), false);
    assert.equal(isValidMarksString('{"read":"a"}'), false);
    assert.equal(isValidMarksString("[]"), false);
    assert.equal(isValidMarksString(5), false);
  });

  it("представления: архив отдельно, закреплённые, непрочитанные и внимание не показывают архивные", () => {
    const a = ev("a", "2026-10-21T10:00:00Z", "important");
    const b = ev("b", "2026-10-19T10:00:00Z");
    const m = setPinned(setArchived(emptyMarks(), "b", true), "a", true);
    const view = (e: SellerProductEvent, v: Parameters<typeof matchesView>[1]) => matchesView(e, v, m, SEEN, attention);
    assert.deepEqual([view(a, "all"), view(b, "all"), view(b, "archive"), view(a, "archive")], [true, false, true, false]);
    assert.deepEqual([view(a, "pinned"), view(b, "pinned")], [true, false]);
    assert.deepEqual([view(a, "unread"), view(a, "attention"), view(b, "attention")], [true, true, false]);
  });

  it("«всё прочитано» сбрасывает точечные пометки; убираем id исчезнувших событий", () => {
    const m = setRead(setRead(emptyMarks(), "a", true), "b", false);
    assert.deepEqual([clearUnread(m).read, clearUnread(m).unread], [[], []]);
    assert.deepEqual(pruneMarks(setPinned(m, "gone", true), new Set(["a"])), { read: ["a"], unread: [], pinned: [], archived: [] });
  });

  it("скрытые направления: разбор и проверка", () => {
    const known = ["sales", "ads", "money"] as const;
    assert.deepEqual([...parseMuted("ads,xx,money", known)], ["ads", "money"]);
    assert.equal(serializeMuted(new Set(["ads", "money"])), "ads,money");
    assert.equal(isValidMutedString("ads,money"), true);
    assert.equal(isValidMutedString("ADS; drop"), false);
  });
});
