import type { AutoRepliesMarketplaceId } from "./types";
import type { AutoRepliesConnectionSettings, ConnectionStatus } from "./settings-types";
import type { AutoRepliesUsageId } from "./types";
import {
  OZON_API_KEY_SCOPES_HINT,
  OZON_PREMIUM_PRO_URL,
  OZON_REVIEW_MANAGEMENT_URL,
  ozonReviewApiBlocked,
  ozonReviewApiReady,
} from "./ozon-subscription";

export type MarketplaceApiGuideStep = {
  title: string;
  description: string;
  bullets?: string[];
  imageSrc?: string;
  imageAlt?: string;
};

export type MarketplaceOfficialDoc = {
  label: string;
  url: string;
};

export type MarketplaceApiGuide = {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  clientIdLabel?: string;
  clientIdPlaceholder?: string;
  campaignIdLabel?: string;
  campaignIdPlaceholder?: string;
  cabinetName: string;
  cabinetUrl: string;
  scopesHint: string;
  steps: MarketplaceApiGuideStep[];
  officialDocs: MarketplaceOfficialDoc[];
};

const WB_BASE = "/guides/auto-replies-api/wildberries";
const OZON_BASE = "/guides/auto-replies-api/ozon";
const YANDEX_BASE = "/guides/auto-replies-api/yandex";

export const MARKETPLACE_API_GUIDE: Record<AutoRepliesMarketplaceId, MarketplaceApiGuide> = {
  wildberries: {
    apiKeyLabel: "API-токен Wildberries",
    apiKeyPlaceholder: "Вставьте JWT-токен из кабинета WB",
    cabinetName: "личный кабинет seller.wildberries.ru",
    cabinetUrl: "https://seller.wildberries.ru",
    scopesHint:
      "Персональный токен с правами «Чтение и запись» для отзывов, вопросов и чата.",
    officialDocs: [
      { label: "Документация WB API", url: "https://dev.wildberries.ru/openapi/api-information" },
      { label: "Портал разработчика Wildberries", url: "https://openapi.wildberries.ru/" },
    ],
    steps: [
      {
        title: "Зайдите в раздел «Интеграция по API»",
        description:
          "В seller.wildberries.ru нажмите на иконку профиля в правом верхнем углу и выберите «Интеграция по API».",
        imageSrc: `${WB_BASE}/step-1.png`,
        imageAlt: "Меню профиля Wildberries — раздел «Интеграция по API»",
      },
      {
        title: "Нажмите «+ Создать токен»",
        description:
          "На странице интеграций выберите карточку «Настраивайте интеграции с помощью API» и нажмите кнопку «+ Создать токен».",
        imageSrc: `${WB_BASE}/step-2.png`,
        imageAlt: "Кнопка «Создать токен» в разделе интеграций Wildberries",
      },
      {
        title: "Выберите «Персональный токен»",
        description:
          "На вкладке «Для интеграции вручную» обязательно выберите тип «Персональный токен» — только для своих решений. Без этого KARTO не сможет работать с отзывами и чатом.",
        imageSrc: `${WB_BASE}/step-3.png`,
        imageAlt: "Выбор «Персональный токен» при создании API-токена Wildberries",
      },
      {
        title: "Выберите категории и уровень доступа",
        description:
          "Отметьте нужные категории и установите «Чтение и запись», затем нажмите «Создать токен».",
        bullets: [
          "Контент",
          "Вопросы и отзывы",
          "Аналитика",
          "Чат с покупателем",
          "Уровень доступа: Чтение и запись",
        ],
        imageSrc: `${WB_BASE}/step-4.png`,
        imageAlt: "Выбор категорий доступа при создании персонального токена Wildberries",
      },
      {
        title: "Скопируйте ключ в KARTO",
        description:
          "Нажмите «Создать токен» или «Сгенерировать ключ», скопируйте его целиком и вставьте в поле на странице «Кабинет и API» в KARTO.",
      },
    ],
  },
  ozon: {
    clientIdLabel: "Client ID Ozon",
    clientIdPlaceholder: "Числовой Client ID из раздела Seller API",
    apiKeyLabel: "API Key Ozon",
    apiKeyPlaceholder: "Сгенерированный API Key",
    cabinetName: "личный кабинет seller.ozon.ru",
    cabinetUrl: "https://seller.ozon.ru",
    scopesHint: OZON_API_KEY_SCOPES_HINT,
    officialDocs: [
      { label: "Документация Ozon Seller API", url: "https://docs.ozon.ru/api/seller/" },
      { label: "Справка по API-ключам Ozon", url: "https://seller-edu.ozon.ru/docs/api-key/" },
    ],
    steps: [
      {
        title: "Откройте «Настройки»",
        description:
          "В seller.ozon.ru нажмите на иконку профиля в правом верхнем углу и выберите пункт «Настройки».",
        imageSrc: `${OZON_BASE}/step-1.png`,
        imageAlt: "Меню профиля Ozon Seller — пункт «Настройки»",
      },
      {
        title: "Перейдите в Seller API и сгенерируйте ключ",
        description:
          "В боковом меню откройте «API интеграции» → «Seller API». Скопируйте Client ID и нажмите «Сгенерировать ключ».",
        imageSrc: `${OZON_BASE}/step-2.png`,
        imageAlt: "Раздел Seller API в Ozon — Client ID и кнопка «Сгенерировать ключ»",
      },
      {
        title: "Выберите категории доступа",
        description:
          "В окне генерации укажите название сервиса «KARTO», цель «Для внешнего сервиса, приложения» и отметьте категории ниже. Затем нажмите «Сгенерировать».",
        bullets: [
          "Company",
          "Question",
          "Description Category",
          "Posting FBO",
          "Review",
          "Chat",
          "Product read-only",
          "Posting FBS read-only",
        ],
        imageSrc: `${OZON_BASE}/step-3.png`,
        imageAlt: "Выбор категорий при генерации API-ключа Ozon",
      },
      {
        title: "Подписка для полуавтоматического и автоматического режимов",
        description:
          "Для загрузки отзывов и отправки ответов через API нужна подписка Premium Pro или «Управление отзывами». Перед подключением обязательно прочитайте условия подписки на сайте Ozon.",
        bullets: [
          `Подключить «Управление отзывами» — ${OZON_REVIEW_MANAGEMENT_URL}`,
          `Подключить Premium Pro — ${OZON_PREMIUM_PRO_URL}`,
          "Без подписки в KARTO доступен только режим «По тексту отзыва»",
        ],
      },
      {
        title: "Скопируйте Client ID и API Key в KARTO",
        description:
          "Скопируйте Client ID и сгенерированный API Key и вставьте оба значения в поля на странице «Кабинет и API» в KARTO.",
      },
    ],
  },
  yandex: {
    campaignIdLabel: "Campaign ID",
    campaignIdPlaceholder: "149097488 — ID магазина из «Интеграции магазинов», не Business ID",
    apiKeyLabel: "Токен авторизации Яндекс Маркета",
    apiKeyPlaceholder: "Вставьте токен из раздела «API и модули»",
    cabinetName: "кабинет partner.market.yandex.ru",
    cabinetUrl: "https://partner.market.yandex.ru",
    scopesHint:
      "Нужны токен с доступом «Общение с покупателями» и Campaign ID магазина (не Business ID). Campaign ID — число в таблице «Интеграции магазинов» напротив вашего магазина.",
    officialDocs: [
      { label: "Документация Partner API", url: "https://yandex.ru/dev/market/partner-api/doc/ru/" },
      { label: "Справка: токены авторизации", url: "https://yandex.ru/dev/market/partner-api/doc/ru/concepts/authorization" },
    ],
    steps: [
      {
        title: "Откройте «API и модули»",
        description:
          "В кабинете Яндекс Маркета перейдите в «Настройки» → блок «Обмен данными» → «API и модули».",
        imageSrc: `${YANDEX_BASE}/step-1.png`,
        imageAlt: "Настройки Яндекс Маркета — пункт «API и модули»",
      },
      {
        title: "Нажмите «Создать новый токен»",
        description:
          "На вкладке «Интеграции» найдите блок «Токены авторизации» и нажмите жёлтую кнопку «Создать новый токен».",
        imageSrc: `${YANDEX_BASE}/step-2.png`,
        imageAlt: "Кнопка «Создать новый токен» в разделе API Яндекс Маркета",
      },
      {
        title: "Выберите нужные доступы",
        description:
          "Выберите режим «Только выбранные» и отметьте перечисленные ниже права. Сохраните токен и вставьте его в поле выше.",
        bullets: [
          "Просмотр информации о заказах",
          "Просмотр товаров и карточек",
          "Настройка магазинов",
          "Общение с покупателями",
        ],
        imageSrc: `${YANDEX_BASE}/step-3.png`,
        imageAlt: "Выбор доступов при создании токена Яндекс Маркета",
      },
      {
        title: "Скопируйте Campaign ID и токен в KARTO",
        description:
          "В блоке «Интеграции магазинов» скопируйте Campaign ID вашего магазина (например, FBS · СимСтрой). Business ID — это другой номер кабинета целиком, его в поле Campaign ID вставлять не нужно. Токен — из таблицы «Токены авторизации».",
      },
    ],
  },
};

function secondaryIdFilled(
  marketplaceId: AutoRepliesMarketplaceId | undefined,
  connection: AutoRepliesConnectionSettings
): boolean {
  if (marketplaceId === "ozon") return Boolean(connection.clientId?.trim());
  if (marketplaceId === "yandex") return Boolean(connection.campaignId?.trim());
  return true;
}

export function getMarketplaceApiGuide(mp: AutoRepliesMarketplaceId): MarketplaceApiGuide {
  return MARKETPLACE_API_GUIDE[mp];
}

export type ConnectionDisplay = {
  label: string;
  tone: "ok" | "warn" | "muted" | "info";
  detail: string;
};

export function deriveConnectionDisplay(
  usage: AutoRepliesUsageId,
  connection: AutoRepliesConnectionSettings,
  marketplaceId?: AutoRepliesMarketplaceId
): ConnectionDisplay {
  if (usage === "manual") {
    return {
      label: "Режим без API",
      tone: "info",
      detail: "Сейчас выбран ввод отзыва вручную — ключ не используется, но его можно сохранить заранее.",
    };
  }

  if (connection.status === "error") {
    const rateLimited = /429|огранич|блокирует|throttl/i.test(connection.lastError ?? "");
    if (rateLimited && connection.verifiedAt && connection.apiKey.trim().length > 8) {
      return {
        label: "Подключён",
        tone: "ok",
        detail:
          "Ключ проверен. WB временно ограничил запросы — отзывы подтянутся автоматически через несколько секунд.",
      };
    }
    const premiumHint =
      marketplaceId === "ozon" &&
      connection.lastError &&
      /premium|подписк|subscription|отзыв/i.test(connection.lastError)
        ? " Для API отзывов Ozon нужна подписка Premium Pro или «Управление отзывами»."
        : "";
    return {
      label: "Ошибка",
      tone: "warn",
      detail: `Ключ не прошёл проверку.${premiumHint} Создайте новый в кабинете маркетплейса и попробуйте снова.`,
    };
  }

  const key = connection.apiKey.trim();
  const secondaryReady = secondaryIdFilled(marketplaceId, connection);
  const verified = Boolean(connection.verifiedAt);

  if (key.length > 8 && secondaryReady && connection.status === "active" && verified) {
    if (
      marketplaceId === "ozon" &&
      ozonReviewApiBlocked(connection.reviewApiAvailable, connection.premiumPlus)
    ) {
      return {
        label: "Ключи OK",
        tone: "warn",
        detail: "Client ID и API Key приняты Ozon.",
      };
    }
    return {
      label: "Подключён",
      tone: "ok",
      detail: "Ключ проверен. Отзывы подтягиваются из кабинета при открытии inbox.",
    };
  }

  const hasSecondary =
    Boolean(connection.clientId?.trim()) || Boolean(connection.campaignId?.trim());

  if (key.length > 0 || hasSecondary) {
    return {
      label: "Проверьте ключ",
      tone: "warn",
      detail:
        marketplaceId === "ozon" && !connection.clientId?.trim()
          ? "Укажите Client ID и API Key, затем нажмите «Проверить подключение»."
          : marketplaceId === "yandex" && !connection.campaignId?.trim()
            ? "Укажите Campaign ID и токен, затем нажмите «Проверить подключение»."
            : "Ключ сохранён, но ещё не проверен — нажмите «Проверить подключение».",
    };
  }

  return {
    label: "Не подключён",
    tone: "muted",
    detail:
      marketplaceId === "ozon"
        ? "Добавьте Client ID и API Key Ozon, чтобы KARTO мог получать отзывы из кабинета."
        : marketplaceId === "yandex"
          ? "Добавьте Campaign ID и токен Яндекс Маркета, чтобы KARTO мог получать отзывы из кабинета."
          : "Добавьте API-ключ, чтобы KARTO мог получать отзывы из кабинета.",
  };
}

export function resolveConnectionStatus(
  apiKey: string,
  marketplaceId?: AutoRepliesMarketplaceId,
  secondaryId?: string
): ConnectionStatus {
  const trimmed = apiKey.trim();
  const needsSecondary = marketplaceId === "ozon" || marketplaceId === "yandex";
  const hasSecondary = !needsSecondary || Boolean(secondaryId?.trim());
  if (trimmed.length > 8 && hasSecondary) return "active";
  if (trimmed.length > 0 || Boolean(secondaryId?.trim())) return "disconnected";
  return "disconnected";
}

export function maskApiKey(key: string): string {
  const t = key.trim();
  if (!t) return "";
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}${"•".repeat(Math.min(16, t.length - 8))}${t.slice(-4)}`;
}
