import type { SellerHubMarketplaceId } from "./types";

export type SellerHubGuideStep = {
  title: string;
  description: string;
  bullets?: string[];
};

export type SellerHubScopeRequirement = {
  label: string;
  purpose: string;
  required: boolean;
};

export type SellerHubApiGuide = {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  clientIdLabel?: string;
  clientIdPlaceholder?: string;
  campaignIdLabel?: string;
  campaignIdPlaceholder?: string;
  businessIdLabel?: string;
  businessIdPlaceholder?: string;
  cabinetName: string;
  cabinetUrl: string;
  scopesHint: string;
  scopes: SellerHubScopeRequirement[];
  steps: SellerHubGuideStep[];
  officialDocs: Array<{ label: string; url: string }>;
};

export const SELLER_HUB_API_GUIDE: Record<SellerHubMarketplaceId, SellerHubApiGuide> = {
  wildberries: {
    apiKeyLabel: "Персональный API-токен Wildberries",
    apiKeyPlaceholder: "Вставьте JWT-токен из кабинета WB",
    cabinetName: "личный кабинет seller.wildberries.ru",
    cabinetUrl: "https://seller.wildberries.ru",
    scopesHint:
      "Нужен персональный токен. Минимум — «Контент». Для полного Seller Hub отметьте все категории ниже.",
    scopes: [
      {
        label: "Контент",
        purpose: "Карточки, артикулы, фото, категории и бренды",
        required: true,
      },
      {
        label: "Цены и скидки",
        purpose: "Цена до скидки, скидка продавца и цена для покупателя",
        required: false,
      },
      {
        label: "Маркетплейс",
        purpose: "FBS-остатки, заказы, FBS-поставки",
        required: false,
      },
      {
        label: "Аналитика",
        purpose: "Остатки FBO, оборот, заказы и выкупы за 7 дней",
        required: false,
      },
      {
        label: "Поставки",
        purpose: "FBO-поставки на склады Wildberries",
        required: false,
      },
      {
        label: "Продвижение",
        purpose: "Календарь акций, участие SKU и рекламные кампании",
        required: false,
      },
    ],
    steps: [
      {
        title: "Откройте «Интеграция по API»",
        description:
          "В seller.wildberries.ru нажмите иконку профиля в правом верхнем углу и выберите «Интеграция по API».",
      },
      {
        title: "Нажмите «+ Создать токен»",
        description:
          "На странице интеграций выберите карточку «Настраивайте интеграции с помощью API» и нажмите «+ Создать токен».",
      },
      {
        title: "Выберите «Персональный токен»",
        description:
          "На вкладке «Для интеграции вручную» обязательно выберите тип «Персональный токен» — базовый токен ограничен 5 запросами в час и не подходит для выгрузки каталога.",
      },
      {
        title: "Отметьте категории доступа",
        description:
          "Чем больше категорий отмечено, тем больше данных Seller Hub подтянет из кабинета. Минимум — «Контент», рекомендуем сразу отметить все из списка ниже.",
        bullets: [
          "Контент — обязательно",
          "Цены и скидки",
          "Маркетплейс",
          "Аналитика",
          "Поставки",
          "Продвижение",
          "Уровень доступа: Чтение и запись",
        ],
      },
      {
        title: "Скопируйте токен в KARTO",
        description:
          "Нажмите «Создать токен», скопируйте значение целиком и вставьте в поле выше. После сохранения WB больше не покажет этот токен — храните его в надёжном месте.",
      },
    ],
    officialDocs: [
      { label: "Документация WB API", url: "https://dev.wildberries.ru/openapi/api-information" },
      { label: "Портал разработчика Wildberries", url: "https://openapi.wildberries.ru/" },
    ],
  },
  ozon: {
    clientIdLabel: "Client ID Ozon",
    clientIdPlaceholder: "Числовой Client ID из раздела Seller API",
    apiKeyLabel: "API Key Ozon",
    apiKeyPlaceholder: "Сгенерированный API Key",
    cabinetName: "личный кабинет seller.ozon.ru",
    cabinetUrl: "https://seller.ozon.ru",
    scopesHint:
      "Нужны Client ID и API Key с доступом к товарам. Для цен и остатков отметьте категории Product и Prices.",
    scopes: [
      { label: "Product", purpose: "Список товаров, названия, фото и штрихкоды", required: true },
      { label: "Prices", purpose: "Цены, скидки и цена для покупателя", required: false },
      { label: "Stocks", purpose: "Остатки на складах FBO и FBS", required: false },
      { label: "Analytics", purpose: "Заказы и метрики карточек — для будущей аналитики", required: false },
    ],
    steps: [
      {
        title: "Откройте «Настройки»",
        description:
          "В seller.ozon.ru нажмите иконку профиля в правом верхнем углу и выберите «Настройки».",
      },
      {
        title: "Перейдите в Seller API",
        description:
          "В боковом меню откройте «API интеграции» → «Seller API». Скопируйте Client ID и нажмите «Сгенерировать ключ».",
      },
      {
        title: "Выберите категории доступа",
        description:
          "Укажите название сервиса «KARTO», цель «Для внешнего сервиса, приложения» и отметьте категории, связанные с товарами, ценами и остатками.",
        bullets: ["Product", "Prices", "Stocks", "Analytics", "Company"],
      },
      {
        title: "Вставьте Client ID и API Key в KARTO",
        description:
          "Скопируйте оба значения и вставьте в поля выше. Client ID — числовой, API Key показывается один раз.",
      },
    ],
    officialDocs: [
      { label: "Документация Ozon Seller API", url: "https://docs.ozon.ru/api/seller/" },
      { label: "Справка по API-ключам Ozon", url: "https://seller-edu.ozon.ru/docs/api-key/" },
    ],
  },
  yandex: {
    apiKeyLabel: "Токен авторизации Яндекс Маркета",
    apiKeyPlaceholder: "Вставьте токен из раздела «API и модули»",
    campaignIdLabel: "Campaign ID",
    campaignIdPlaceholder: "149097488 — ID магазина, не Business ID",
    businessIdLabel: "Business ID (необязательно)",
    businessIdPlaceholder: "Определим автоматически при проверке",
    cabinetName: "кабинет partner.market.yandex.ru",
    cabinetUrl: "https://partner.market.yandex.ru",
    scopesHint:
      "Нужен токен с доступом к товарам и Campaign ID магазина. Business ID подставим автоматически при проверке.",
    scopes: [
      { label: "Просмотр товаров и карточек", purpose: "Каталог офферов и базовые цены", required: true },
      { label: "Настройка магазинов", purpose: "Определение Campaign ID и Business ID", required: true },
      { label: "Просмотр информации о заказах", purpose: "Заказы для будущей аналитики", required: false },
    ],
    steps: [
      {
        title: "Откройте «API и модули»",
        description:
          "В кабинете Яндекс Маркета перейдите в «Настройки» → блок «Обмен данными» → «API и модули».",
      },
      {
        title: "Создайте новый токен",
        description:
          "На вкладке «Интеграции» найдите блок «Токены авторизации» и нажмите «Создать новый токен».",
      },
      {
        title: "Выберите доступы",
        description:
          "Выберите режим «Только выбранные» и отметьте права ниже, затем сохраните токен.",
        bullets: [
          "Просмотр товаров и карточек",
          "Настройка магазинов",
          "Просмотр информации о заказах",
        ],
      },
      {
        title: "Скопируйте Campaign ID и токен",
        description:
          "Campaign ID — число напротив вашего магазина в блоке «Интеграции магазинов». Business ID — это номер кабинета целиком, в поле Campaign ID его вставлять не нужно.",
      },
    ],
    officialDocs: [
      { label: "Документация Partner API", url: "https://yandex.ru/dev/market/partner-api/doc/ru/" },
      {
        label: "Справка: токены авторизации",
        url: "https://yandex.ru/dev/market/partner-api/doc/ru/concepts/authorization",
      },
    ],
  },
};

export function sellerHubApiGuide(mp: SellerHubMarketplaceId): SellerHubApiGuide {
  return SELLER_HUB_API_GUIDE[mp];
}
