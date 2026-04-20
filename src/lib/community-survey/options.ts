import type { LucideIcon } from "lucide-react";
import {
  Bug,
  Coins,
  HelpCircle,
  ImageOff,
  Layers,
  MessageCircleWarning,
  Timer,
} from "lucide-react";

/**
 * Версия голосования: при смене списков/id увеличить — отдельная волна в БД.
 * 2026-04-20: шаг 1 — быстрый формат «карточки» (3 уровня), порядок в БД = выведенный ТОП.
 */
export const COMMUNITY_SURVEY_VERSION = "2026-04-20" as const;

/** Бонус за участие в голосовании: столько генераций «Свободное творчество» начисляется один раз (см. API). */
export const COMMUNITY_SURVEY_REWARD_GENERATIONS = 3 as const;

/** Ответ по одной функции в режиме карточек. */
export type FeatureSwipeVote = "very" | "need" | "later";

const SWIPE_WEIGHT: Record<FeatureSwipeVote, number> = {
  very: 3,
  need: 2,
  later: 1,
};

/** Строит ранжированный список id для API из ответов по всем 7 функциям. */
export function rankFeatureIdsFromSwipeVotes(
  votes: Partial<Record<string, FeatureSwipeVote>>
): string[] {
  const scored = COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => ({
    id: o.id,
    w: SWIPE_WEIGHT[votes[o.id] ?? "later"],
  }));
  scored.sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    const ia = COMMUNITY_SURVEY_FEATURE_OPTIONS.findIndex((x) => x.id === a.id);
    const ib = COMMUNITY_SURVEY_FEATURE_OPTIONS.findIndex((x) => x.id === b.id);
    return ia - ib;
  });
  return scored.map((s) => s.id);
}

/** Шаг 1: иллюстрации из `public/community-survey/features/`. */
export type CommunityFeatureOption = {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  /** Второе фото (например, превью + деталь интерфейса). */
  imageSrc2?: string;
  imageAlt2?: string;
  /** Ссылка «узнать больше» под описанием. */
  learnMore?: { href: string; label: string };
  /** Разбивка заголовка: `emphasis` выделяется (например, брендом). */
  titleParts?: { emphasis: string; remainder: string };
};

export const COMMUNITY_SURVEY_FEATURE_OPTIONS: CommunityFeatureOption[] = [
  {
    id: "rich_description_builder",
    title: "Конструктор Rich‑контента",
    description:
      "Соберите расширенное описание карточки как лендинг: блоки текста и медиа, превью и готовый JSON для вставки в карточку на маркетплейсе — без ручной вёрстки. Если термин незнаком, ниже — короткая статья Ozon для продавцов.",
    imageSrc: "/community-survey/features/rich_description_builder.webp",
    imageAlt: "Конструктор rich‑описания — первый экран превью",
    imageSrc2: "/community-survey/features/rich_description_builder2.webp",
    imageAlt2: "Конструктор rich‑описания — детали редактирования блоков",
    learnMore: {
      href: "https://seller.ozon.ru/media/boost/chto-takoe-rich-kontent-i-kak-ego-sozdat/?__rr=1",
      label: "Что такое rich‑контент и как его создать (Ozon для продавцов)",
    },
  },
  {
    id: "templates_presets",
    title: "Библиотека шаблонов и пресетов",
    description:
      "Готовые макеты под категории товаров: выбрали шаблон — подставили фото и текст — получили единый стиль всех карточек магазина.",
    imageSrc: "/community-survey/features/templates_presets.webp",
    imageAlt: "Библиотека шаблонов и пресетов для карточек",
  },
  {
    id: "brand_style_kit",
    title: "Логотип и стиль бренда / магазина",
    description:
      "Единый логотип, палитра цветов и шрифты для обложек и инфографики, чтобы магазин выглядел цельно и узнаваемо. Заложим возможность разработать фирменный стиль и логотип вместе с командой KARTO и дальше использовать их в генерациях и материалах без ручной возни.",
    imageSrc: "/community-survey/features/brand_style_kit.webp",
    imageAlt: "Фирменный стиль: логотип, цвета и типографика",
  },
  {
    id: "interactive_guides",
    title: "Интерактивные гайды и микро‑курсы",
    description:
      "Короткие сценарии по шагам: как описать товар, вести кабинет продавца, оформить карточку, снять ролик и писать промпты для нейросетей — с практикой внутри KARTO.",
    imageSrc: "/community-survey/features/interactive_guides.webp",
    imageAlt: "Интерактивные гайды и обучение в продукте",
  },
  {
    id: "referral_partner_program",
    title: "Реферальная или партнёрская программа",
    description:
      "Приглашайте коллег и партнёров — получайте щедрые бонусы на генерации: чем больше делитесь опытом, тем выгоднее.",
    imageSrc: "/community-survey/features/referral_partner_program.webp",
    imageAlt: "Реферальная и партнёрская программа",
  },
  {
    id: "community_showcase_feed",
    title: "Сообщество и витрина лучших работ",
    titleParts: { emphasis: "Сообщество", remainder: " и витрина лучших работ" },
    description:
      "KARTO станет в том числе социальной сетью для продавцов: можно делиться работами, публиковать карточки и медиа, смотреть ленту и сохранять идеи — по духу близко к Pinterest, где удобно находить вдохновение и показывать свои лучшие материалы.",
    imageSrc: "/community-survey/features/community_showcase_feed.webp",
    imageAlt: "Витрина работ и сообщество продавцов",
  },
  {
    id: "review_reply_copilot",
    title: "Умный помощник для ответов на отзывы",
    description:
      "Задаёте тон общения, вставляете текст отзыва — ИИ предлагает вежливый ответ, который можно править и отправлять покупателю.",
    imageSrc: "/community-survey/features/review_reply_copilot.webp",
    imageAlt: "Помощник для ответов на отзывы покупателей",
  },
];

/** Порядок id по умолчанию для ранжирования (шаг 1). */
export const DEFAULT_FEATURE_ORDER: string[] = COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => o.id);

export type SurveyOptionMeta = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
};

/** Шаг 2: компактные карточки с иконками (без фото — акцент на честной обратной связи). */
export const COMMUNITY_SURVEY_PROBLEM_OPTIONS: SurveyOptionMeta[] = [
  {
    id: "slow_steps",
    title: "Долго ждать результат",
    description: "Генерация или очереди кажутся медленными.",
    Icon: Timer,
  },
  {
    id: "pricing_unclear",
    title: "Неочевидные лимиты и списания",
    description: "Сложно понять, за что списали и сколько осталось.",
    Icon: Coins,
  },
  {
    id: "bugs_crashes",
    title: "Ошибки и сбои",
    description: "Что‑то ломается или не сохраняется.",
    Icon: Bug,
  },
  {
    id: "ui_overload",
    title: "Перегруженный интерфейс",
    description: "Много шагов или непонятно, с чего начать.",
    Icon: Layers,
  },
  {
    id: "quality_media",
    title: "Качество картинок или видео",
    description: "Результат не всегда совпадает с ожиданием.",
    Icon: ImageOff,
  },
  {
    id: "missing_features",
    title: "Не хватает нужных функций",
    description: "Приходится доделывать вручную или в других сервисах.",
    Icon: HelpCircle,
  },
  {
    id: "support_feedback",
    title: "Обратная связь и поддержка",
    description: "Хочется быстрее ответы или понятнее статусы запросов.",
    Icon: MessageCircleWarning,
  },
];

const FEATURE_IDS = new Set(COMMUNITY_SURVEY_FEATURE_OPTIONS.map((o) => o.id));
const PROBLEM_IDS = new Set(COMMUNITY_SURVEY_PROBLEM_OPTIONS.map((o) => o.id));
const FEATURE_COUNT = COMMUNITY_SURVEY_FEATURE_OPTIONS.length;

/** Шаг 1: полный список id без пропусков и повторов — порядок = приоритет (ТОП). */
export function isValidFeatureRanking(ids: string[]): boolean {
  if (!Array.isArray(ids) || ids.length !== FEATURE_COUNT) return false;
  const uniq = new Set(ids);
  if (uniq.size !== FEATURE_COUNT) return false;
  return ids.every((id) => FEATURE_IDS.has(id));
}

export function isValidProblemSelection(ids: string[]): boolean {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const uniq = [...new Set(ids)];
  return uniq.length === ids.length && uniq.every((id) => PROBLEM_IDS.has(id));
}

const SWIPE_LEVELS = new Set<FeatureSwipeVote>(["very", "need", "later"]);

/** Полный объект «функция → уровень» для всех 7 карточек. */
export function isValidFeatureSwipeVotes(raw: unknown): raw is Record<string, FeatureSwipeVote> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  for (const id of FEATURE_IDS) {
    const v = o[id];
    if (typeof v !== "string" || !SWIPE_LEVELS.has(v as FeatureSwipeVote)) return false;
  }
  if (Object.keys(o).length !== FEATURE_COUNT) return false;
  return Object.keys(o).every((k) => FEATURE_IDS.has(k));
}
