import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTENT_APPLICABLE_MAX,
  contentLeverSuffix,
  contentScore,
} from "./product-signal";
import { DEFAULT_TASK_THRESHOLDS } from "./task-engine/config";
import { ruleContent, ruleNoSales } from "./task-engine/rules";
import { EMPTY_STOCKS_REPORT_FIELDS, type TaskFact } from "./task-engine/types";

const DICT = [
  "Объём",
  "Цвет",
  "Материал",
  "Комплектация",
  "Страна производства",
  "Сезон",
  "Пол",
];

const FILLED_ALL = [...DICT];
const DIMS = { length: 10, width: 10, height: 10, weightKg: 1.2 };
const DESC_MAX =
  [
    "Этот набор подойдёт для ежедневного использования дома.",
    "Корпус выполнен аккуратно, края обработаны, поверхность гладкая на ощупь.",
    "В комплекте есть всё необходимое, чтобы сразу начать пользоваться без дополнительных покупок.",
    "Перед первым применением протрите мягкой тканью и убедитесь, что поверхность сухая.",
    "Храните вдали от прямого солнца и сильного нагрева, чтобы сохранить внешний вид дольше.",
    "Если заметили дефект при получении, сохраните упаковку и обратитесь в поддержку продавца.",
    "Мы стараемся отвечать быстро и помочь с заменой или уточнением характеристик.",
    "Размер и вес указаны в карточке, сверьте их с вашими условиями доставки и хранения.",
    "Отзывы покупателей помогают нам улучшать описание и комплектацию следующих партий.",
    "Спасибо, что выбрали этот артикул: надеемся, он будет служить долго и без сюрпризов.",
    "Дополнительный абзац нужен для объёма текста и естественных формулировок без списков ключей.",
    "Ещё несколько предложений про удобство, аккуратную сборку и понятную инструкцию внутри коробки.",
  ].join(" ") +
  "\n\n" +
  [
    "Дополнительно: инструкция простая, уход не занимает много времени.",
    "Подходит для подарка, если нужен практичный вариант без лишней сложности.",
  ].join(" ");

function maxCard(patch: Partial<Parameters<typeof contentScore>[0]> = {}) {
  return contentScore({
    photos: 7,
    hasVideo: true,
    description: DESC_MAX,
    characteristicNames: FILLED_ALL,
    categoryCharcNames: DICT,
    categoryCharcRequiredNames: [],
    dimensions: DIMS,
    ...patch,
  });
}

function fact(patch: Partial<TaskFact> = {}): TaskFact {
  return {
    nmId: "1",
    itemId: "i",
    title: "Товар",
    vendorCode: "v",
    stock: 5,
    price: 1000,
    promoPrice: 800,
    cost: 400,
    salesQty: 0,
    salesKnown: true,
    priorSalesQty: 0,
    recentSalesQty: 0,
    coverDays: 20,
    paceWindow: "span",
    dailyPace: 0.5,
    sittingRub: 0,
    marginPercent: 20,
    marginRub: 160,
    marginSource: "sku",
    contentScore: 80,
    contentGaps: null,
    contentGap: null,
    contentPeerLine: null,
    photoCount: 7,
    hasVideo: true,
    subjectId: 105,
    createdAt: "2020-01-01T00:00:00.000Z",
    paceSource: "sales-span",
    funnelStatus: "ok",
    orders: 0,
    priorOrders: 0,
    ordersPerDay: 0,
    priorOrdersPerDay: 0,
    openCount: 40,
    priorOpenCount: 40,
    cartCount: 0,
    priorCartCount: 0,
    addToCartPercent: 0,
    priorAddToCartPercent: 0,
    cartToOrderPercent: null,
    priorCartToOrderPercent: null,
    avgOrderPrice: 800,
    orderSum: 0,
    priorOrderSum: 0,
    funnelDateFrom: null,
    funnelDateTo: null,
    funnelPastDateFrom: null,
    funnelPastDateTo: null,
    ...EMPTY_STOCKS_REPORT_FIELDS,
    ...patch,
  };
}

describe("content score 1.6 — cover N/A normalize", () => {
  it("photo 7 + video + max charcs/copy, cover unmeasured → 100", () => {
    const card = maxCard();
    assert.equal(card.earned, CONTENT_APPLICABLE_MAX);
    assert.equal(card.applicableMax, 95);
    assert.equal(card.score, 100);
    assert.equal(card.slots.cover, "na");
    assert.equal(card.parts.media, 35);
  });

  it("photo 3 (14), no video, rest max → 74/95 → 78, no task (≥70)", () => {
    const card = maxCard({ photos: 3, hasVideo: false });
    assert.equal(card.earned, 74);
    assert.equal(card.score, 78);
    assert.ok(card.score >= DEFAULT_TASK_THRESHOLDS.lowContentScore);
    const draft = ruleContent(
      fact({ contentScore: card.score, contentGaps: card.gapLines, contentGap: card.gapLines.join("\n") }),
      DEFAULT_TASK_THRESHOLDS,
    );
    assert.equal(draft, null);
  });

  it("photo 2 + desc 240 no breaks → 54/95 → 57 with ordered gap list", () => {
    const card = maxCard({
      photos: 2,
      hasVideo: false,
      description: "x".repeat(240),
    });
    assert.equal(card.earned, 54);
    assert.equal(card.score, 57);
    assert.deepEqual(card.gapLines, [
      "Фото: 2 → добавьте ещё 5 (+19 б.)",
      "Видео: нет (+10 б.)",
      "Описание: 240 знаков → до 800 (+7 б.)",
      "нет абзацев или списков (+5 б.)",
    ]);
    const draft = ruleContent(
      fact({
        contentScore: card.score,
        contentGaps: card.gapLines,
        contentGap: card.gapLines.join("\n"),
        salesQty: 0,
      }),
      DEFAULT_TASK_THRESHOLDS,
    );
    assert.equal(draft?.type, "TASK_LOW_CONTENT_SCORE");
    assert.equal(draft?.severityFloor, "opportunity");
    assert.match(draft!.description, /Фото: 2 → добавьте ещё 5/);
    assert.match(draft!.description, /Видео: нет/);
    assert.match(draft!.description, /Описание: 240 знаков/);
    assert.match(draft!.description, /нет абзацев или списков/);
  });

  it("paragraphs +5 sorts above named Цвет +3 / Комплектация +2 in the same list", () => {
    const card = maxCard({
      photos: 7,
      hasVideo: true,
      description: "x".repeat(240),
      characteristicNames: ["Объём", "Страна производства", "Сезон", "Пол", "Материал"],
    });
    const idxBreak = card.gapLines.findIndex((line) => line.includes("нет абзацев"));
    const idxColor = card.gapLines.findIndex((line) => line.includes("Цвет"));
    assert.ok(idxBreak >= 0 && idxColor >= 0);
    assert.ok(idxBreak < idxColor, `expected paragraphs before color: ${card.gapLines.join(" | ")}`);
  });

  it("required WB charc is first gap line even if points are low", () => {
    const card = maxCard({
      photos: 6,
      hasVideo: true,
      characteristicNames: FILLED_ALL.filter((name) => name !== "Объём" && name !== "Материал"),
      categoryCharcRequiredNames: ["Объём", "Материал"],
    });
    assert.ok(card.gapLines[0]?.startsWith("Не заполнено обязательное по WB:"));
    assert.match(card.gapLines[0]!, /Объём/);
    assert.match(card.gapLines[0]!, /Материал/);
    assert.ok(card.requiredMissing.includes("Объём"));
    assert.ok(card.requiredMissing.includes("Материал"));
  });

  it("injects top-3 content levers into no_carts demand text; content stays opportunity", () => {
    const card = maxCard({ photos: 2, hasVideo: false, description: "x".repeat(240) });
    const gaps = card.gapLines;
    const contentDraft = ruleContent(
      fact({ contentScore: card.score, contentGaps: gaps, salesQty: 0 }),
      DEFAULT_TASK_THRESHOLDS,
    );
    assert.equal(contentDraft?.baseSeverity, "opportunity");
    assert.equal(contentDraft?.severityCeiling, "opportunity");

    const noSales = ruleNoSales(
      fact({
        contentScore: card.score,
        contentGaps: gaps,
        salesQty: 0,
        orders: 0,
        priorOrders: 0,
        openCount: 40,
        priorOpenCount: 40,
        cartCount: 0,
        priorCartCount: 0,
        stock: 8,
        createdAt: "2020-01-01T00:00:00.000Z",
        funnelStatus: "ok",
      }),
      DEFAULT_TASK_THRESHOLDS,
      {
        now: "2026-10-14T12:00:00.000Z",
        store: { turnoverRub: 1_000_000, grossProfitRub: 200_000, useGrossProfit: false },
        events: [],
      },
    );
    assert.equal(noSales?.type, "TASK_NO_SALES");
    assert.match(noSales!.description, /не кладут в корзину/);
    assert.match(noSales!.description, /Контент: Фото: 2/);
    assert.match(noSales!.description, /Видео: нет/);
    assert.match(noSales!.description, /Описание: 240/);
    assert.equal(contentLeverSuffix(gaps, 3).includes("нет абзацев"), false);
  });
});
