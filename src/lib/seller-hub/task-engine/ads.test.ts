import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerAdCampaignRow, SellerAdCampaignStats, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import {
  adFactsForNm,
  buildAdsFactsContext,
  ruleAdCampaignStopped,
  ruleAdDrrOverMargin,
  ruleAdNoOrders,
  ruleAdNoStock,
} from "./ads";
import { DEFAULT_TASK_SETTINGS } from "./config";
import { reconcileTasks } from "./engine";
import { ruleAdEfficiencyDrop, ruleAdScaleUp, ruleAdWeakCard } from "./ads-smart";
import { parseTaskReconcileBody } from "./parse";
import type { ProductAdCampaignFact, ProductAdFact, TaskFact } from "./types";

const campaign = (patch: Partial<ProductAdCampaignFact> = {}): ProductAdCampaignFact => ({
  id: "11",
  name: "Ведра",
  status: 9,
  budget: 3000,
  dailyLimitRub: null,
  advertised: true,
  spend: 0,
  orders: 0,
  orderSum: 0,
  recentSpend: 0,
  limitHitDays: 0,
  ...patch,
});

const ads = (patch: Partial<ProductAdFact> = {}): ProductAdFact => ({
  statsReady: true,
  windowDays: 7,
  dateFrom: "2026-10-14",
  dateTo: "2026-10-20",
  spend: 0,
  views: 0,
  clicks: 0,
  orders: 0,
  orderSum: 0,
  drrPercent: null,
  storeCpo: 200,
  campaigns: [campaign()],
  ...patch,
});

const fact = (adFacts: ProductAdFact | undefined, patch: Partial<TaskFact> = {}): TaskFact =>
  ({ nmId: "100", itemId: "i", title: "Ведро", vendorCode: "V", stock: 30, marginRub: 150, marginPercent: 25, adFacts, ...patch }) as TaskFact;

describe("реклама без заказов", () => {
  const spent = ads({ spend: 400, views: 5000, clicks: 40, campaigns: [campaign({ spend: 400 })] });

  it("расход больше маржи с продажи и заказов нет: критично, действие «Открыть рекламу»", () => {
    const d = ruleAdNoOrders(fact(spent));
    assert.ok(d);
    assert.equal(d.type, "TASK_AD_NO_ORDERS");
    assert.equal(d.baseSeverity, "critical");
    assert.equal(d.actionType, "OPEN_ADS");
    assert.equal(d.evidence.ad_spend, 400);
    assert.equal(d.evidence.threshold_basis, "margin");
    assert.match(d.description, /«?Ведро|400/);
  });

  it("маржи нет: порог — средняя цена заказа по рекламе магазина, важность ниже", () => {
    const d = ruleAdNoOrders(fact(spent, { marginRub: null, marginPercent: null }));
    assert.equal(d?.baseSeverity, "important");
    assert.equal(d?.evidence.threshold_basis, "store_cpo");
    assert.equal(d?.evidence.threshold_rub, 200);
  });

  it("молчит: расход меньше маржи, есть заказы, статистика не прочитана, нет остатка, кампания не идёт, маржа в минусе", () => {
    assert.equal(ruleAdNoOrders(fact(ads({ spend: 100, campaigns: [campaign({ spend: 100 })] }))), null);
    assert.equal(ruleAdNoOrders(fact(ads({ spend: 400, orders: 1, orderSum: 900 }))), null);
    assert.equal(ruleAdNoOrders(fact(ads({ ...spent, statsReady: false }))), null);
    assert.equal(ruleAdNoOrders(fact(spent, { stock: 0 })), null);
    assert.equal(ruleAdNoOrders(fact(ads({ ...spent, campaigns: [campaign({ status: 11, spend: 400 })] }))), null);
    assert.equal(ruleAdNoOrders(fact(spent, { marginRub: -20, marginPercent: -4 })), null);
    assert.equal(ruleAdNoOrders(fact(undefined)), null);
  });
});

describe("ДРР выше маржи", () => {
  const over = ads({ spend: 600, orders: 4, orderSum: 2000, drrPercent: 30, campaigns: [campaign({ spend: 600, orders: 4, orderSum: 2000 })] });

  it("ДРР 30% при марже 25%: важная задача с обеими цифрами", () => {
    const d = ruleAdDrrOverMargin(fact(over));
    assert.ok(d);
    assert.equal(d.type, "TASK_AD_DRR_OVER_MARGIN");
    assert.equal(d.evidence.drr_percent, 30);
    assert.equal(d.evidence.margin_percent, 25);
    assert.equal(d.actionType, "OPEN_ADS");
  });

  it("молчит: ДРР не выше маржи, маржа в минусе или неизвестна, расход меньше маржи с продажи", () => {
    assert.equal(ruleAdDrrOverMargin(fact({ ...over, drrPercent: 25 })), null);
    assert.equal(ruleAdDrrOverMargin(fact(over, { marginPercent: -3, marginRub: -10 })), null);
    assert.equal(ruleAdDrrOverMargin(fact(over, { marginPercent: null, marginRub: null })), null);
    assert.equal(ruleAdDrrOverMargin(fact({ ...over, spend: 100 })), null);
    assert.equal(ruleAdDrrOverMargin(fact({ ...over, orders: 0, drrPercent: null })), null);
  });
});

describe("кампания остановилась", () => {
  const good = (c: Partial<ProductAdCampaignFact>) =>
    ads({ spend: 300, orders: 6, orderSum: 3000, drrPercent: 10, campaigns: [campaign({ spend: 300, orders: 6, orderSum: 3000, recentSpend: 120, ...c })] });

  it("бюджет 0 у кампании с заказами, ДРР ниже маржи, товар в наличии: важная задача", () => {
    const d = ruleAdCampaignStopped(fact(good({ budget: 0 })));
    assert.ok(d);
    assert.equal(d.type, "TASK_AD_CAMPAIGN_STOPPED");
    assert.equal(d.evidence.stop_reason, "budget");
    assert.equal(d.baseSeverity, "important");
  });

  it("пауза недавно работавшей кампании: причину не называем", () => {
    const d = ruleAdCampaignStopped(fact(good({ status: 11 })));
    assert.equal(d?.evidence.stop_reason, "paused");
    assert.match(d?.description ?? "", /не сообщает/);
  });

  it("упёрлась в дневной лимит: только возможность", () => {
    const d = ruleAdCampaignStopped(fact(good({ dailyLimitRub: 150, limitHitDays: 2 })));
    assert.equal(d?.evidence.stop_reason, "daily_limit");
    assert.equal(d?.baseSeverity, "opportunity");
  });

  it("молчит: нет остатка, ДРР выше маржи, мало заказов, пауза давно, кампания идёт без проблем", () => {
    assert.equal(ruleAdCampaignStopped(fact(good({ budget: 0 }), { stock: 0 })), null);
    assert.equal(ruleAdCampaignStopped(fact(good({ budget: 0 }), { marginPercent: 8 })), null);
    assert.equal(ruleAdCampaignStopped(fact({ ...good({ budget: 0 }), orders: 1 })), null);
    assert.equal(ruleAdCampaignStopped(fact(good({ status: 11, recentSpend: 0 }))), null);
    assert.equal(ruleAdCampaignStopped(fact(good({}))), null);
    assert.equal(ruleAdCampaignStopped(fact(good({ budget: 0, orders: 0 }))), null);
  });
});

describe("реклама без остатка", () => {
  it("остаток 0 и товар в активной кампании с бюджетом: задача", () => {
    const d = ruleAdNoStock(fact(ads(), { stock: 0 }));
    assert.ok(d);
    assert.equal(d.type, "TASK_AD_NO_STOCK");
    assert.equal(d.actionType, "OPEN_ADS");
  });

  it("работает и без статистики: нужен только список кампаний", () => {
    assert.ok(ruleAdNoStock(fact(ads({ statsReady: false }), { stock: 0 })));
  });

  it("молчит: есть остаток, остаток неизвестен, кампания на паузе, без бюджета или товара уже нет в списке", () => {
    assert.equal(ruleAdNoStock(fact(ads(), { stock: 5 })), null);
    assert.equal(ruleAdNoStock(fact(ads(), { stock: null })), null);
    assert.equal(ruleAdNoStock(fact(ads({ campaigns: [campaign({ status: 11 })] }), { stock: 0 })), null);
    assert.equal(ruleAdNoStock(fact(ads({ campaigns: [campaign({ budget: 0 })] }), { stock: 0 })), null);
    assert.equal(ruleAdNoStock(fact(ads({ campaigns: [campaign({ advertised: false })] }), { stock: 0 })), null);
    assert.equal(ruleAdNoStock(fact(undefined, { stock: 0 })), null);
  });
});

describe("факты рекламы из снимка", () => {
  const day = (date: string, spend: number) => ({ date, views: 0, clicks: 0, spend, orders: 0, orderSum: 0 });
  const row = (patch: Partial<SellerAdCampaignRow>): SellerAdCampaignRow => ({
    id: "11",
    name: "Ведра",
    status: 9,
    budget: 500,
    bids: [{ nmId: "100", searchRub: 100, recommendationsRub: 100 }],
    dailyLimit: { limitRub: 100, carryOver: false, requiredRub: null },
    ...patch,
  });
  const stat: SellerAdCampaignStats = {
    advertId: "11",
    views: 900,
    clicks: 60,
    spend: 360,
    orders: 3,
    orderSum: 1800,
    addToCart: 5,
    days: [day("2026-10-14", 10), day("2026-10-18", 99), day("2026-10-19", 100), day("2026-10-20", 98)],
    byNm: {
      "100": { views: 600, clicks: 40, spend: 240, orders: 2, orderSum: 1200 },
      "200": { views: 300, clicks: 20, spend: 120, orders: 1, orderSum: 600 },
    },
  };
  const snapshot = {
    ads: { campaigns: [row({}), row({ id: "12", bids: [{ nmId: "300", searchRub: 1, recommendationsRub: 1 }] })] },
    adsStats: { loadedAt: "x", dateFrom: "2026-10-14", dateTo: "2026-10-20", campaigns: [stat] },
  } as unknown as SellerCatalogSnapshot;

  it("суммирует расход и заказы товара, ДРР и последние дни лимита", () => {
    const context = buildAdsFactsContext(snapshot);
    assert.ok(context);
    const a = adFactsForNm(context, "100");
    assert.ok(a);
    assert.equal(a.statsReady, true);
    assert.equal(a.windowDays, 7);
    assert.equal(a.spend, 240);
    assert.equal(a.orders, 2);
    assert.equal(a.drrPercent, 20);
    assert.equal(a.storeCpo, 120);
    assert.equal(a.campaigns.length, 1);
    assert.equal(a.campaigns[0]?.advertised, true);
    assert.equal(a.campaigns[0]?.limitHitDays, 3);
    assert.equal(a.campaigns[0]?.recentSpend, 297);
  });

  it("товар без кампаний и статистики не получает фактов, чтобы не раздувать пакет", () => {
    const context = buildAdsFactsContext(snapshot);
    assert.ok(context);
    assert.equal(adFactsForNm(context, "999"), undefined);
  });

  it("без статистики есть список кампаний, но statsReady=false", () => {
    const context = buildAdsFactsContext({ ...snapshot, adsStats: undefined });
    assert.ok(context);
    const a = adFactsForNm(context, "100");
    assert.equal(a?.statsReady, false);
    assert.equal(a?.spend, 0);
    assert.equal(a?.campaigns.length, 1);
  });

  it("кампании в кабинете не читали: контекста нет", () => {
    assert.equal(buildAdsFactsContext({} as SellerCatalogSnapshot), null);
  });
});

describe("разбор пакета на сервере", () => {
  it("факты рекламы доходят до движка без потерь, мусор отбрасывается", () => {
    const body = parseTaskReconcileBody({
      marketplaceId: "wildberries",
      store: {},
      products: [
        {
          nmId: "100",
          adFacts: { ...ads({ spend: 400, orders: 0 }), campaigns: [campaign({ spend: 400 }), { id: "" }, null] },
        },
        { nmId: "200", adFacts: "oops" },
      ],
    });
    assert.ok(body);
    const first = body.products.find((p) => p.nmId === "100")?.adFacts;
    assert.equal(first?.spend, 400);
    assert.equal(first?.statsReady, true);
    assert.equal(first?.campaigns.length, 1);
    assert.equal(first?.campaigns[0]?.advertised, true);
    assert.equal(body.products.find((p) => p.nmId === "200")?.adFacts, undefined);
  });
});

describe("умные рекламные правила", () => {
  const adT = (patch: Partial<ProductAdFact>) =>
    ads({ campaigns: [campaign({ spend: 500, orders: 10, orderSum: 8000 })], ...patch });
  // Прошлая неделя: 1000 показов... 30 заказов на 600 ₽ → цена заказа 20 ₽.
  const prevWeek = { spend: 600, views: 10000, clicks: 400, orders: 30, orderSum: 24000 };

  it("падение эффективности: заказ подорожал и доля клика в заказ упала значимо — причина названа", () => {
    // Сейчас: 10000 показов, 400 кликов, 15 заказов на 600 ₽ → 40 ₽ за заказ против 20 ₽; заказов на 100 кликов 3,75% против 7,5%.
    const d = ruleAdEfficiencyDrop(
      fact(adT({ spend: 600, views: 10000, clicks: 400, orders: 15, orderSum: 24000, drrPercent: 2.5, prev: prevWeek }), { marginPercent: 25, marginRub: 150 }),
    );
    assert.ok(d);
    assert.equal(d.type, "TASK_AD_EFFICIENCY_DROP");
    assert.equal(d.baseSeverity, "important");
    assert.match(String(d.evidence.causes), /cr/);
    assert.equal(d.evidence.cpo_change_percent, 100);
  });

  it("небольшое ухудшение — только «возможность»: сообщить и предложить", () => {
    // Цена заказа выросла на 30%: за счёт подорожавшего клика (+30%), воронка та же.
    const d = ruleAdEfficiencyDrop(
      fact(adT({ spend: 780, views: 10000, clicks: 400, orders: 30, orderSum: 24000, drrPercent: 3.3, prev: prevWeek }), { marginPercent: 25, marginRub: 150 }),
    );
    assert.equal(d?.baseSeverity, "opportunity");
    assert.match(String(d?.evidence.causes), /cpc/);
  });

  it("шум малых чисел задачу не создаёт: цена заказа выросла, но ни один множитель не изменился надёжно", () => {
    const d = ruleAdEfficiencyDrop(
      fact(
        adT({ spend: 210, views: 1000, clicks: 60, orders: 3, orderSum: 3000, drrPercent: 7, prev: { spend: 200, views: 1000, clicks: 60, orders: 4, orderSum: 4000 } }),
        { marginPercent: 25, marginRub: 150 },
      ),
    );
    assert.equal(d, null);
  });

  it("молчит без прошлого окна и когда ДРР уже выше маржи", () => {
    const now = adT({ spend: 600, views: 10000, clicks: 400, orders: 15, orderSum: 24000, drrPercent: 2.5 });
    assert.equal(ruleAdEfficiencyDrop(fact({ ...now, prev: null })), null);
    assert.equal(ruleAdEfficiencyDrop(fact({ ...now, prev: prevWeek, drrPercent: 40 }, { marginPercent: 25 })), null);
  });

  it("слабая карточка: кликают втрое реже эталона магазина и значимо", () => {
    const bm = { products: 4, ctrPercent: 5, crPercent: 8 };
    const d = ruleAdWeakCard(fact(adT({ spend: 400, views: 4000, clicks: 70, orders: 4, orderSum: 6000, drrPercent: 6, benchmark: bm }), { marginRub: 150 }));
    assert.ok(d);
    assert.equal(d.evidence.weak_ctr, true);
    assert.equal(d.baseSeverity, "opportunity");
  });

  it("слабая карточка: молчит без эталона из трёх товаров и при малом числе показов", () => {
    const x = adT({ spend: 400, views: 4000, clicks: 70, orders: 4, orderSum: 6000, drrPercent: 6 });
    assert.equal(ruleAdWeakCard(fact({ ...x, benchmark: { products: 2, ctrPercent: 5, crPercent: 8 } }, { marginRub: 150 })), null);
    assert.equal(ruleAdWeakCard(fact({ ...x, views: 500, benchmark: { products: 4, ctrPercent: 5, crPercent: 8 } }, { marginRub: 150 })), null);
  });

  it("масштабирование: ДРР вдвое ниже маржи, заказов хватает, запас 40 дней", () => {
    const d = ruleAdScaleUp(fact(adT({ spend: 300, orders: 8, orderSum: 6000, drrPercent: 5 }), { marginPercent: 25, coverDays: 40 }));
    assert.ok(d);
    assert.equal(d.baseSeverity, "opportunity");
    assert.equal(ruleAdScaleUp(fact(adT({ spend: 300, orders: 8, orderSum: 6000, drrPercent: 5 }), { marginPercent: 25, coverDays: 10 })), null);
    assert.equal(ruleAdScaleUp(fact(adT({ spend: 300, orders: 8, orderSum: 6000, drrPercent: 20 }), { marginPercent: 25, coverDays: 40 })), null);
  });

  it("бюджета хватит меньше чем на 2 дня: важная задача для кампании с хорошими заказами", () => {
    const x = ads({ spend: 300, orders: 6, orderSum: 3000, drrPercent: 10, campaigns: [campaign({ budget: 100, orders: 6, recentSpend: 300 })] });
    const d = ruleAdCampaignStopped(fact(x));
    assert.equal(d?.evidence.stop_reason, "budget_low");
    assert.equal(d?.baseSeverity, "important");
  });
});

describe("закрытие рекламной задачи после правки в кабинете", () => {
  const store = (adsReady: boolean) => ({
    unansweredFeedbacks: null,
    unansweredQuestions: null,
    feedbacksStatus: null,
    unansweredPositiveCount: null,
    unansweredPositiveProductCount: null,
    adsReady,
  });
  const run = (tasks: ReturnType<typeof reconcileTasks>["tasks"], f: TaskFact, adsReady: boolean, now: string) =>
    reconcileTasks({
      now,
      storeId: "wildberries",
      facts: [f],
      baselines: {},
      store: store(adsReady),
      settings: DEFAULT_TASK_SETTINGS,
      tasks,
      events: [],
      createId: () => "ad-1",
    });
  const spent = ads({ spend: 400, views: 5000, clicks: 40, campaigns: [campaign({ spend: 400 })] });
  const removed = ads({ spend: 400, views: 5000, clicks: 40, campaigns: [campaign({ spend: 400, advertised: false })] });

  it("товар убрали из кампании, реклама прочитана целиком: задача закрывается сразу", () => {
    const first = run([], fact(spent), true, "2026-10-21T10:00:00.000Z");
    const created = first.tasks.find((t) => t.type === "TASK_AD_NO_ORDERS");
    assert.equal(created?.status, "active");
    const second = run(first.tasks, fact(removed), true, "2026-10-21T10:05:00.000Z");
    const closed = second.tasks.find((t) => t.type === "TASK_AD_NO_ORDERS");
    assert.equal(closed?.status, "completed");
  });

  it("реклама прочитана не целиком: задача остаётся открытой (защита от мерцания)", () => {
    const first = run([], fact(spent), true, "2026-10-21T10:00:00.000Z");
    const second = run(first.tasks, fact(removed), false, "2026-10-21T10:05:00.000Z");
    assert.equal(second.tasks.find((t) => t.type === "TASK_AD_NO_ORDERS")?.status, "active");
  });
});
