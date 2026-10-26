import type { SellerHubMarketplaceId } from "./types";

export type SellerHubAreaId =
  | "overview"
  | "tasks"
  | "events"
  | "catalog"
  | "prices"
  | "stocks"
  | "promotions"
  | "analytics"
  | "orders"
  | "deliveries"
  | "logistics"
  | "ads"
  | "finance"
  | "agents"
  | "knowledge"
  | "verification"
  | "integration";

export type SellerHubAreaMeta = {
  id: SellerHubAreaId;
  label: string;
  title: string;
  description: string;
  /** Разделы будущих фаз показываем, но помечаем. */
  planned?: boolean;
};

export const SELLER_HUB_AREAS: SellerHubAreaMeta[] = [
  {
    id: "overview",
    label: "Обзор",
    title: "Обзор магазина",
    description: "Что важно сегодня: заказы, продажи, выкуп, остатки, реклама и отзывы.",
  },
  {
    id: "tasks",
    label: "Задачи",
    title: "Задачи",
    description: "Что сейчас стоит сделать, чтобы защитить деньги и продажи",
  },
  {
    id: "events",
    label: "События",
    title: "События",
    description: "Важные изменения в магазине и товарах",
  },
  {
    id: "catalog",
    label: "Товары",
    title: "Товарная матрица",
    description: "Карточки, цены и остатки FBO/FBS. Отдельного дубля остатков в меню нет: глубина по складам в выгрузке не приходит.",
  },
  {
    id: "prices",
    label: "Цены и скидки",
    title: "Цены и скидки",
    description: "Цена и скидка правятся в ячейке. Старая цена остаётся зачёркнутой, пока новая не ушла в WB.",
  },
  {
    id: "stocks",
    label: "Остатки",
    title: "Остатки и поставки",
    description: "FBO только для чтения. FBS меняется кликом по ячейке, если в токене есть склад продавца.",
  },
  {
    id: "promotions",
    label: "Акции",
    title: "Акции",
    description: "",
  },
  {
    id: "analytics",
    label: "Аналитика",
    title: "Аналитика продаж",
    description: "Сводка, динамика, воронка, товары, деньги и остатки по вашему кабинету: данные WB, без догадок.",
  },
  {
    id: "orders",
    label: "Заказы и логистика",
    title: "Заказы и логистика",
    description: "Заказы и сборка FBS, поставки, остатки по складам и регионам, план отгрузки.",
  },
  {
    id: "deliveries",
    label: "Поставки",
    title: "План поставок",
    description: "FBS-отгрузки и FBO-поставки на склады Wildberries.",
  },
  {
    id: "logistics",
    label: "Логистика",
    title: "Логистика",
    description: "Спрос по регионам, остатки по складам WB и план отгрузки.",
  },
  {
    id: "ads",
    label: "Продвижение",
    title: "Продвижение",
    description: "Реклама WB: расход, заказы и ДРР, советы и управление кампаниями.",
  },
  {
    id: "finance",
    label: "Финансы",
    title: "Деньги магазина",
    description: "Баланс, документы и понятная разбивка того, что забрал маркетплейс.",
  },
  {
    id: "agents",
    label: "Агенты",
    title: "Агенты",
    description: "Цены, реклама и ответы: что агент умеет, что запланировано и что уже применено.",
  },
  {
    id: "knowledge",
    label: "База знаний",
    title: "База знаний",
    description: "Короткие ответы на частые вопросы продавца, без канцелярита кабинета WB.",
  },
  {
    id: "verification",
    label: "Проверка расчётов",
    title: "Проверка расчётов",
    description: "Сверка источников и формул этапа «Задачи» на данных вашего кабинета.",
  },
  {
    id: "integration",
    label: "Кабинет и API",
    title: "Кабинет и API",
    description: "API-токен маркетплейса — основа работы Seller Hub с вашим личным кабинетом.",
  },
];

export const SELLER_HUB_NAV_GROUPS: Array<{
  id: string;
  label: string;
  areaIds: SellerHubAreaId[];
}> = [
  { id: "lead", label: "", areaIds: ["overview", "tasks", "events", "agents"] },
  { id: "manage", label: "Управление", areaIds: ["catalog"] },
  { id: "data", label: "Данные", areaIds: ["analytics", "orders", "ads", "finance"] },
  { id: "learn", label: "Обучение", areaIds: ["knowledge"] },
  { id: "setup", label: "Подключение", areaIds: ["verification", "integration"] },
];

/**
 * Разделы меню. «Поставки» и «Логистика» живут вкладками внутри «Заказов и логистики», «Акции» — вкладкой в «Продвижении».
 * Старые идентификаторы остаются рабочими (ссылки из других экранов), но подсвечивается объединённый раздел.
 */
export function canonicalArea(id: SellerHubAreaId): SellerHubAreaId {
  if (id === "deliveries" || id === "logistics") return "orders";
  if (id === "promotions") return "ads";
  return id;
}

export function sellerHubArea(id: SellerHubAreaId): SellerHubAreaMeta {
  return SELLER_HUB_AREAS.find((a) => a.id === id) ?? SELLER_HUB_AREAS[0]!;
}

export const SELLER_HUB_MARKETPLACE_UI: Array<{
  id: SellerHubMarketplaceId;
  name: string;
  short: string;
  logo: string;
  accent: string;
}> = [
  {
    id: "wildberries",
    name: "Wildberries",
    short: "WB",
    logo: "/logos/marketplace-wildberries-app.png",
    accent: "#CB11AB",
  },
  {
    id: "ozon",
    name: "Ozon",
    short: "Ozon",
    logo: "/logos/marketplace-ozon-app.png",
    accent: "#005BFF",
  },
  {
    id: "yandex",
    name: "Яндекс Маркет",
    short: "Я.Маркет",
    logo: "/logos/marketplace-yandex-market-app.png",
    accent: "#FC3F1D",
  },
];

export function sellerHubMarketplaceMeta(id: SellerHubMarketplaceId) {
  return SELLER_HUB_MARKETPLACE_UI.find((m) => m.id === id) ?? SELLER_HUB_MARKETPLACE_UI[0]!;
}
