import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRelevance } from "./ads-query-relevance";

describe("parseRelevance", () => {
  const queries = ["кашпо", "ведро для мусора", "горшок большой"];

  it("разбирает ответ и сохраняет порядок запросов", () => {
    const text = 'Вот:\n{"results":[{"query":"ведро для мусора","verdict":"irrelevant","reason":"другой товар"},{"query":"кашпо","verdict":"relevant","reason":"тип товара"}]}';
    const out = parseRelevance(text, queries)!;
    assert.deepEqual(out.map((r) => r.query), queries);
    assert.equal(out[0]!.verdict, "relevant");
    assert.equal(out[1]!.verdict, "irrelevant");
  });

  it("запрос без ответа модели — неясный, решение за продавцом", () => {
    const out = parseRelevance('{"results":[{"query":"кашпо","verdict":"relevant","reason":"ок"}]}', queries)!;
    assert.equal(out[2]!.verdict, "unclear");
  });

  it("неизвестный вердикт и мусор отбрасываются", () => {
    const out = parseRelevance('{"results":[{"query":"кашпо","verdict":"maybe","reason":"?"}]}', queries)!;
    assert.equal(out[0]!.verdict, "unclear");
    assert.equal(parseRelevance("не json", queries), null);
  });

  it("регистр запроса не мешает сопоставлению", () => {
    const out = parseRelevance('{"results":[{"query":"КАШПО","verdict":"relevant","reason":"ок"}]}', ["кашпо"])!;
    assert.equal(out[0]!.verdict, "relevant");
  });
});
