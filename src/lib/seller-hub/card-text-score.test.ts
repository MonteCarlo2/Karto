import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureText } from "./card-text-metrics";
import {
  applyTextCaps,
  buildTextResult,
  parseTextJson,
  textBandOf,
  textContentHash,
  textWeightedScore,
  TEXT_CRITERIA,
  type TextCriterionId,
  type TextRaw,
} from "./card-text-score";

const ids = TEXT_CRITERIA.map((c) => c.id) as TextCriterionId[];
const raw = (score: number, overall: number | null = null): TextRaw => ({
  category: "Ведро",
  criteria: Object.fromEntries(ids.map((id) => [id, { score, evidence: "ok" }])) as TextRaw["criteria"],
  defects: [],
  strengths: [],
  missingKeywords: [],
  titleSuggestion: null,
  overall,
  sellability: null,
  confidence: "high",
});

const LONG = [
  "Ведро строительное предназначено для ремонта, дачи и хозяйственных работ.",
  "Изготовлено из ударопрочного пластика, который не боится перепадов температур и ударов.",
  "Внутри нанесена мерная шкала, поэтому смеси и растворы легко дозировать без лишней посуды.",
  "Усиленное дно сохраняет форму под нагрузкой, а металлическая ручка удобно ложится в ладонь.",
  "Объём 10 литров подходит для замеса штукатурки, переноски песка, воды и садового инвентаря.",
  "Гладкие стенки легко мыть после работы, остатки раствора не прилипают к поверхности.",
  "Ведро выдерживает значительный вес, не трескается на морозе и не деформируется на солнце.",
  "Подходит для строителей, дачников и владельцев частных домов, а также для уборки и хранения.",
  "",
  "Преимущества:",
  "- ударопрочный материал служит несколько сезонов",
  "- мерная шкала экономит время при приготовлении смесей",
  "- прочная ручка не гнётся и не соскальзывает",
  "- аккуратная форма удобна для хранения стопкой в кладовой",
  "",
  "Комплектация: одно ведро. Размеры: высота 24 сантиметра, диаметр 28 сантиметров. Цвет чёрный, вес около 500 граммов.",
  "Условия эксплуатации от минус тридцати до плюс шестидесяти градусов, допускается контакт со строительными смесями и водой.",
].join("\n");

describe("parseTextJson", () => {
  const good = JSON.stringify({
    category: "Ведро",
    criteria: Object.fromEntries(ids.map((id) => [id, { score: 7, evidence: "ok" }])),
    overall: 76,
    purchase_likelihood: { level: "above_average", reason: "хороший текст" },
    defects: [{ what: "нет списка", fix: "добавьте список" }],
    strengths: ["есть ключи"],
    missing_keywords: [{ word: "оцинкованное", why: "синоним" }],
    title_suggestion: "Ведро строительное пластиковое 10 л",
    confidence: "high",
  });
  it("разбирает ответ с обрамляющим текстом", () => {
    const parsed = parseTextJson("Вот:\n" + good)!;
    assert.equal(parsed.overall, 76);
    assert.equal(parsed.sellability?.level, "above_average");
    assert.equal(parsed.missingKeywords[0]?.word, "оцинкованное");
    assert.equal(parsed.titleSuggestion, "Ведро строительное пластиковое 10 л");
  });
  it("название длиннее нормы WB не принимается, мусор отклоняется", () => {
    const long = good.replace("Ведро строительное пластиковое 10 л", "Ведро ".repeat(20));
    assert.equal(parseTextJson(long)!.titleSuggestion, null);
    assert.equal(parseTextJson("нет json"), null);
    assert.equal(parseTextJson('{"criteria":{"title":{"score":5}}}'), null);
  });
});

describe("applyTextCaps — ограничения по замерам", () => {
  it("нет описания: объём 0, информация и ключи ограничены, итог модели сбрасывается", () => {
    const out = applyTextCaps(raw(9, 90), measureText({ title: "Ведро", description: null }));
    assert.equal(out.criteria.volume.score, 0);
    assert.ok(out.criteria.info.score <= 2);
    assert.equal(out.overall, null);
    assert.match(out.defects[0]!.what, /нет/);
  });
  it("запрещённое и крик ограничивают соответствие правилам", () => {
    const out = applyTextCaps(raw(9), measureText({ title: "Ведро", description: "ЗВОНИТЕ +7 900 123-45-67 ТОЛЬКО У НАС ЛУЧШЕЕ ВЕДРО ДЛЯ ВАШЕЙ ДАЧИ" }));
    assert.ok(out.criteria.compliance.score <= 3);
    assert.ok(out.defects.some((d) => /Запрещённое/.test(d.what)));
  });
  it("хороший нормальный текст не трогаем", () => {
    const out = applyTextCaps(raw(8, 80), measureText({ title: "Ведро строительное 10 л", description: LONG }));
    assert.equal(out.overall, 80);
    assert.equal(out.criteria.volume.score, 8);
  });
  it("название длиннее 60 знаков ограничивает оценку названия", () => {
    const out = applyTextCaps(raw(9), measureText({ title: "Ведро ".repeat(15).trim(), description: LONG }));
    assert.ok(out.criteria.title.score <= 4);
  });
});

describe("итог и отпечаток", () => {
  it("связный итог модели принимается, несвязный заменяется итогом разбора", () => {
    const m = measureText({ title: "Ведро", description: LONG });
    assert.equal(buildTextResult(raw(8, 84), { metrics: m, title: "Ведро", description: LONG }).score, 84);
    assert.equal(buildTextResult(raw(5, 95), { metrics: m, title: "Ведро", description: LONG }).score, 50);
    assert.equal(textWeightedScore(raw(7).criteria), 70);
  });
  it("отпечаток меняется вместе с текстом и не зависит от пробелов по краям", () => {
    const a = textContentHash("Ведро", "Описание");
    assert.equal(a, textContentHash(" Ведро ", " Описание "));
    assert.notEqual(a, textContentHash("Ведро", "Описание изменено"));
  });
  it("уровни по баллам", () => {
    assert.equal(textBandOf(80), "strong");
    assert.equal(textBandOf(60), "good");
    assert.equal(textBandOf(45), "average");
    assert.equal(textBandOf(20), "weak");
  });
});
