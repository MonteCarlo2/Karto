"use client";

import { notFound } from "next/navigation";
import { HubSidebar } from "@/components/seller-hub/hub-sidebar";
import { HubTasks } from "@/components/seller-hub/hub-tasks";
import { HubBadge, hub, hubSans, hubSerif, hubType } from "@/components/seller-hub/hub-ui";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { AiFeedItem } from "@/lib/seller-hub/client-api";

/** Страница предпросмотра раздела «Задачи» на вымышленных данных. Только для разработки. */

const NOW = "2026-10-28T09:00:00.000Z";

const PHOTO_TONES = ["#E8DCC8", "#D5E3D0", "#E9D5CF", "#D6DEE9"];
function photo(n: number): string {
  const tone = PHOTO_TONES[(n - 1) % PHOTO_TONES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${tone}"/><rect x="95" y="120" width="110" height="170" rx="18" fill="#FFFFFF" opacity=".75"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function item(n: number, title: string, vendorCode: string, price: number): SellerCatalogItem {
  return {
    id: `item-${n}`,
    marketplaceId: "wildberries",
    externalId: String(481900 + n),
    vendorCode,
    title,
    price: Math.round(price / 0.8),
    discountedPrice: price,
    discountPercent: 20,
    imageUrl: photo(n),
  } as SellerCatalogItem;
}

const ITEMS: SellerCatalogItem[] = [
  item(1, "Крем для рук с маслом ши, 75 мл", "KR-SHI-75", 590),
  item(2, "Набор для ухода за лицом «Весенний сад» подарочный в коробке", "SET-SPRING-GIFT", 1490),
  item(3, "Сыворотка с витамином C, 30 мл", "SER-VITC-30", 1190),
  item(4, "Гель для душа «Кедр и мята», 400 мл", "GEL-CEDAR-400", 420),
  item(5, "СуперлонгоеназваниетоваравсегоодноймассивнойстрокойбезпробеловКашпоПластиковоеЧёрное12литровДляКомнатныхРастений", "VERY-LONG-VENDOR-CODE-WITHOUT-ANY-SPACES-12345", 990),
];

const SNAPSHOT = {
  marketplaceId: "wildberries",
  items: ITEMS,
  syncedAt: NOW,
  totalCount: ITEMS.length,
  blockedCards: {
    loadedAt: NOW,
    cards: [{ nmId: "481904", vendorCode: "GEL-CEDAR-400", title: "Гель для душа «Кедр и мята», 400 мл", reason: "Фото не соответствует правилам площадки" }],
  },
} as unknown as SellerCatalogSnapshot;

function task(n: number, p: Partial<SellerTask> & Pick<SellerTask, "type" | "category" | "severity" | "title" | "description" | "recommendation" | "actionType" | "businessImpactType">): SellerTask {
  const index = p.nmId ? ITEMS.findIndex((i) => i.externalId === p.nmId) : -1;
  return {
    id: `task-${n}`,
    storeId: "preview",
    nmId: null,
    itemId: index >= 0 ? ITEMS[index].id : null,
    productTitle: index >= 0 ? ITEMS[index].title : null,
    vendorCode: index >= 0 ? ITEMS[index].vendorCode : null,
    status: "active",
    reason: "Условие правила выполнено по свежему снимку кабинета.",
    evidence: {},
    score: 100 - n,
    sourceEventId: null,
    createdAt: NOW,
    updatedAt: NOW,
    snoozeUntil: null,
    resolvedAt: null,
    resolution: null,
    ...p,
  } as SellerTask;
}


const AI_ITEMS = [
  {
    key: "ai-1",
    nmId: "481902",
    source: "ai",
    title: "Рекламный расход съедает маржу",
    severity: "important",
    taskIds: [],
    taskTitles: ["Реклама: ДРР выше маржи"],
    kindLabel: "Реклама",
    finding: {
      id: "f1",
      nmId: "481902",
      title: "Рекламный расход съедает маржу",
      what: "ДРР 18,9% при марже 14%: каждый заказ из рекламы приносит убыток. Органика держится, значит ставку можно снижать без потери объёма.",
      problems: [],
      evidence: [
        { key: "drr", value: "18,9%" },
        { key: "margin_pct", value: "14%" },
        { key: "orders_28d", value: "212" },
        { key: "turnover_days", value: "26" },
        { key: "extra_1", value: "доп. цифра" },
      ],
      second: "agree",
      secondReason: "Расчёт сходится.",
      origin: "algorithm",
      ownerAccepted: false,
      autopilot: false,
      strategyState: null,
      action: null,
      actionNote: null,
      humanAdvice: null,
      strategy: {
        goal: "Вернуть ДРР ниже маржи за две недели без потери заказов.",
        steps: [
          { step: "Снизить ставку кампании на 10%", by: "program", day: 0, when: "сразу", action: { type: "ads_bid", campaignId: "1", direction: "down", stepPercent: 10, reason: "ДРР выше маржи" }, onlyIf: undefined },
          { step: "Обновить главное фото набора", by: "human", day: 3, when: "в первые 3 дня", action: null, flow: "visual" },
          { step: "Проверить ДРР и заказы", by: "human", day: 7, when: "через 7 дней", action: null },
          { step: "Снизить ставку ещё на 10%, если ДРР остаётся выше маржи", by: "program", day: 9, when: "через 9 дней", action: { type: "ads_bid", campaignId: "1", direction: "down", stepPercent: 10, reason: "ДРР выше маржи" }, onlyIf: { metric: "margin_pct", op: "<=", value: 14 } },
          { step: "Добавить минус-фразы по запросам без заказов", by: "human", day: 10, when: "через 10 дней", action: null },
          { step: "Сверить заказы с началом периода", by: "human", day: 12, when: "через 12 дней", action: null },
          { step: "Подвести итог и решить, оставлять ли новую ставку", by: "human", day: 14, when: "через 14 дней", action: null },
        ],
        checks: [{ day: 7, label: "Первая сверка", look: [{ metric: "orders_28d", expect: "hold" }] }],
        success: [{ metric: "margin_pct", op: ">=", value: 14 }],
        guards: [{ metric: "orders_28d", op: ">=", value: 180 }],
        reviewAfterDays: 14,
        failNote: "",
        fallback: "Поставить кампанию на паузу.",
      },
    },
  },
  {
    key: "ai-2",
    nmId: "481903",
    source: "ai",
    title: "Заканчивается ходовой товар, а поставка идёт долго",
    severity: "critical",
    taskIds: [],
    taskTitles: [],
    kindLabel: "Остатки",
    finding: {
      id: "f2",
      nmId: "481903",
      title: "Заканчивается ходовой товар, а поставка идёт долго",
      what: "Остатка хватит на 6 дней, а до склада WB поставка идёт 9. Часть продаж будет потеряна.",
      problems: [],
      evidence: [{ key: "stock", value: "14 шт." }, { key: "oos_days", value: "6" }],
      second: "dispute",
      secondReason: "",
      origin: "algorithm",
      ownerAccepted: true,
      autopilot: false,
      strategyState: { status: "running", acceptedAt: "2026-10-26T09:00:00.000Z", checkpoints: [], current: {} },
      action: null,
      actionNote: null,
      humanAdvice: "Отправить поставку в ближайшие два дня.",
      strategy: null,
    },
  },
] as unknown as AiFeedItem[];

const TASKS: SellerTask[] = [
  task(1, {
    nmId: "481903",
    type: "TASK_STOCK_OUT",
    category: "stock",
    severity: "critical",
    title: "Товар закончился на складе",
    description: "Остаток 0 шт. Продажи остановились, пока нет поставки.",
    recommendation: "Собрать поставку на склад WB в ближайшие дни.",
    actionType: "OPEN_SUPPLIES",
    businessImpactType: "STOCK_RISK",
    evidence: { stock: 0, daily_pace: 4.2, days_out_of_stock: 6, missed_orders_rub_est: 28400, why_important: "Это ваш товар с самой высокой выручкой за месяц." },
  }),
  task(2, {
    nmId: "481902",
    type: "TASK_LOW_STOCK",
    category: "stock",
    severity: "important",
    title: "Запас скоро закончится",
    description: "При текущем темпе остатка хватит на 6 дней, а поставка идёт дольше.",
    recommendation: "Отправить поставку или временно снизить рекламные ставки.",
    actionType: "OPEN_SUPPLIES",
    businessImpactType: "SALES_PROTECTION",
    evidence: { stock: 14, daily_pace: 2.3, cover_days: 6 },
  }),
  task(3, {
    nmId: "481901",
    type: "TASK_CONVERSION_DROP",
    category: "sales",
    severity: "important",
    title: "Упала конверсия в корзину",
    description: "Из просмотров карточки в корзину попадает заметно меньше покупателей, чем раньше.",
    recommendation: "Проверить главное фото и цену по сравнению с конкурентами.",
    actionType: "OPEN_PRODUCT",
    businessImpactType: "SALES_GROWTH",
    evidence: { open_count: 3180, prior_open_count: 3090, add_to_cart_percent: 6.1, prior_add_to_cart_percent: 9.4 },
  }),
  task(4, {
    nmId: null,
    type: "TASK_UNANSWERED_REVIEWS",
    category: "reviews",
    severity: "important",
    title: "Есть отзывы без ответа",
    description: "Четыре новых отзыва ждут ответа больше суток.",
    recommendation: "Ответить на отзывы: шаблоны ответов уже готовы.",
    actionType: "OPEN_REVIEW_RESPONSES",
    businessImpactType: "OPERATIONAL",
  }),
  task(5, {
    nmId: "481904",
    type: "TASK_LOW_CONTENT_SCORE",
    category: "content",
    severity: "opportunity",
    title: "Карточка имеет потенциал для улучшения",
    description:
      "Гель для душа «Кедр и мята», 400 мл: контент 46 из 100. Фото: 3 → добавьте ещё 4 (+11 баллов). Описание короткое: 280 знаков, ориентир 1 000. Характеристики заполнены на 60%.",
    recommendation: "Добавьте фото и дополните описание: это поднимет карточку в выдаче.",
    actionType: "OPEN_CONTENT_EDITOR",
    businessImpactType: "SALES_GROWTH",
    evidence: {
      content_score: 46,
      photo_count: 3,
      content_gaps: "Фото: 3, добавьте ещё 4 (+11 баллов)\nОписание короткое: 280 знаков, ориентир 1 000\nХарактеристики заполнены на 60%",
    },
  }),
  task(8, {
    nmId: "481901",
    type: "TASK_SALES_GROWTH",
    category: "sales",
    severity: "important",
    title: "Рост заказов стоит сверить с запасом",
    description:
      "Крем для рук с маслом ши, 75 мл: заказы выросли +900% (было 10 шт., стало 100 шт.), на основе 4 200 переходов за 28 дней. Период: 28 дней. Вероятная причина по данным Hub: изменилась скидка (discount_changed). Это не доказательство.",
    recommendation: "Сверьте запас с ростом заказов и при необходимости пополните склад.",
    actionType: "OPEN_STOCKS",
    businessImpactType: "SALES_PROTECTION",
    evidence: { previous_sales_28d: 10, current_sales_28d: 100, change_percent: 900, cover_days: 8, stock: 120, probable_cause: "изменилась скидка" },
  }),
  task(6, {
    nmId: "481901",
    type: "TASK_EXCESS_STOCK",
    category: "stock",
    severity: "opportunity",
    title: "Избыток запаса",
    description: "Запаса хватит больше чем на полгода: часть денег лежит без движения.",
    recommendation: "Рассмотреть скидку или акцию, чтобы ускорить продажи.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "CAPITAL_RELEASE",
    evidence: { stock: 3400, cover_days: 190, sitting_rub: 82000 },
  }),
  task(7, {
    nmId: "481902",
    type: "TASK_NEGATIVE_MARGIN",
    category: "economics",
    severity: "critical",
    title: "Убыточная цена",
    description:
      "Набор для ухода за лицом «Весенний сад» подарочный в коробке: цена продавца 1 688 ₽; удержания WB 30%; логистика на 1 продажу 429 ₽; хранение: нет данных; себестоимость 1 100 ₽; итог на 1 продажу -164 ₽; маржа на 1 продажу -9,7%; деньги под риском 18 540 ₽; безубыточность 1 942 ₽. Маржа упала с 4,1% до -9,7%.",
    recommendation: "Поставьте цену не ниже 1 942 ₽.",
    actionType: "OPEN_PRICE_EDITOR",
    businessImpactType: "PROFIT_PROTECTION",
    evidence: { price: 1688, cost: 1100, margin_rub: -164, break_even_price: 1941.4, loss_rub: 18540, sales_qty: 113 },
  }),
  task(9, {
    nmId: "481901",
    type: "TASK_UNANSWERED_QUESTION",
    category: "reviews",
    severity: "important",
    title: "Вопрос без ответа",
    description:
      "Крем для рук с маслом ши, 75 мл: 1 вопросов без ответа дольше 24 часов. У товара есть заказы за 28 дней — вопрос задают до покупки. 2026-10-16: можно ли использовать крем перед сном",
    recommendation:
      "Ответьте в «Автоотзывах» (/studio/auto-replies/workspace) или в кабинете WB: https://seller.wildberries.ru/feedback-question/questions (артикул 481901).",
    actionType: "OPEN_QUESTIONS",
    businessImpactType: "OPERATIONAL",
    evidence: { count: 1, orders_28d: 5, question_ids: "q1" },
  }),
  task(10, {
    nmId: "481903",
    type: "TASK_PROMO_OPPORTUNITY",
    category: "economics",
    severity: "opportunity",
    title: "Товар можно добавить в акцию",
    description: "Сыворотка с витамином C, 30 мл: можно добавить в акцию «Осенняя распродажа» по цене 1 090 ₽, маржа в акции 214 ₽ (19,6%).",
    recommendation: "Добавьте товар в акцию на странице «Акции».",
    actionType: "OPEN_PROMOTIONS",
    businessImpactType: "SALES_GROWTH",
    evidence: { promo_name: "Осенняя распродажа", plan_price: 1090, promo_margin_rub: 214, promo_margin_percent: 19.6, stock: 40 },
  }),
  task(11, {
    nmId: "481905",
    type: "TASK_LOW_STOCK",
    category: "stock",
    severity: "important",
    title: "СверхдлинноеНазваниеЗадачиБезПробеловКотороеМожетВылезтиЗаГраницыКарточкиЕслиЕгоНеОграничить",
    description: "Остаток маленький.",
    recommendation: "ОченьДлинноеДействиеБезПробеловКотороеТожеДолжноПеренестисьИНеВылезтиЗаГраницыЭкрана.",
    actionType: "OPEN_SUPPLIES",
    businessImpactType: "STOCK_RISK",
    evidence: { stock: 4, cover_days: 2, demand_per_day: 2, lead_time_days: 9, replenish_units: 120 },
  }),
  task(12, {
    nmId: "481903",
    type: "TASK_AD_NO_ORDERS",
    category: "sales",
    severity: "important",
    title: "Реклама тратит деньги без заказов",
    description: "Сыворотка с витамином C, 30 мл: расход 4 320 ₽ за 7 дней, заказов 0; кампания «Сыворотки · поиск · осень 2026» (ставка 280 ₽).",
    recommendation: "Остановите кампанию «Сыворотки · поиск · осень 2026» или снизьте ставку, пока не исправите карточку.",
    actionType: "OPEN_ADS",
    businessImpactType: "PROFIT_PROTECTION",
    evidence: { ad_spend: 4320, window_days: 7, ad_orders: 0, ad_clicks: 312, drr: 0 },
  }),
  task(13, {
    nmId: "481904",
    type: "TASK_LOW_STOCK",
    category: "stock",
    severity: "important",
    title: "Остаток заканчивается на складах Подольск, Коледино и Электросталь",
    description: "Остаток маленький.",
    recommendation: "Переведите остатки между складами: Подольск и Коледино закончатся через 2 дня.",
    actionType: "OPEN_STOCKS",
    businessImpactType: "STOCK_RISK",
    evidence: { stock: 12, cover_days: 3, demand_per_day: 4, lead_time_days: 9, replenish_units: 60 },
  }),
];

export default function DevPreviewSellerHub() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div data-hub-root className="fixed inset-0 z-[100] flex overflow-hidden" style={{ backgroundColor: hub.canvas, color: hub.text, ...hubSans }}>
      <div className="hidden h-full shrink-0 lg:block" style={{ width: 88 }}>
        <HubSidebar collapsed onToggleCollapsed={() => undefined} area="tasks" onAreaChange={() => undefined} />
      </div>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6 lg:px-5">
          <div className="mx-auto w-full max-w-none">
          <header className="flex flex-wrap items-start justify-between gap-4 pb-6 pt-1">
            <div>
              <h1 className={hubType.h1} style={{ ...hubSerif, color: hub.text }}>
                Задачи
              </h1>
              <p className="mt-0.5 max-w-2xl text-[14px] leading-[1.55]" style={{ color: hub.textSubtle }}>
                Что требует внимания в магазине, по важности. Данные примерные.
              </p>
            </div>
            <HubBadge tone="ok">4 SKU · 28 окт., 12:00</HubBadge>
          </header>
            <HubTasks
              snapshot={SNAPSHOT}
              connected
              previewTasks={TASKS}
              previewAiItems={AI_ITEMS}
              onOpenPrices={() => undefined}
              onOpenStocks={() => undefined}
              onOpenSupplies={() => undefined}
              onOpenPromotions={() => undefined}
              onOpenAds={() => undefined}
              onOpenReviews={() => undefined}
              onOpenQuestions={() => undefined}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
