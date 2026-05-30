import type { AutoRepliesUsageId } from "./types";
import type { AutoRepliesStarRules, StarDeliveryMode, StarKey } from "./settings-types";

export const STAR_KEYS: StarKey[] = ["1", "2", "3", "4", "5"];

export function defaultStarRulesByUsage(usage: AutoRepliesUsageId): AutoRepliesStarRules["byStar"] {
  if (usage === "auto") {
    return {
      "1": "confirm",
      "2": "confirm",
      "3": "confirm",
      "4": "auto",
      "5": "auto",
    };
  }
  return {
    "1": "confirm",
    "2": "confirm",
    "3": "confirm",
    "4": "confirm",
    "5": "confirm",
  };
}

/** Правила по звёздам при завершении мастера настройки (3 шага). */
export function starRulesForWizardUsage(usage: AutoRepliesUsageId): AutoRepliesStarRules["byStar"] {
  if (usage === "auto") {
    return {
      "1": "auto",
      "2": "auto",
      "3": "auto",
      "4": "auto",
      "5": "auto",
    };
  }
  return defaultStarRulesByUsage("semi");
}

export function deriveUsageFromStarRules(
  byStar: AutoRepliesStarRules["byStar"]
): Exclude<AutoRepliesUsageId, "manual"> {
  const modes = STAR_KEYS.map((k) => byStar[k]);
  if (modes.every((m) => m === "auto")) return "auto";
  return "semi";
}

type LegacyStarRules = {
  negativeAlwaysConfirm?: boolean;
  positiveAutoWhenGlobalAuto?: boolean;
};

export function normalizeStarRules(
  raw: Partial<AutoRepliesStarRules> & LegacyStarRules | undefined,
  usage: AutoRepliesUsageId
): AutoRepliesStarRules {
  if (raw?.byStar) {
    return {
      byStar: {
        ...defaultStarRulesByUsage(usage),
        ...raw.byStar,
      },
    };
  }

  const legacy = raw ?? {};
  const lowConfirm = legacy.negativeAlwaysConfirm !== false;
  const highAuto = usage === "auto" && legacy.positiveAutoWhenGlobalAuto !== false;

  return {
    byStar: {
      "1": lowConfirm ? "confirm" : "auto",
      "2": lowConfirm ? "confirm" : "auto",
      "3": "confirm",
      "4": highAuto ? "auto" : "confirm",
      "5": highAuto ? "auto" : "confirm",
    },
  };
}

export function starModeLabel(mode: StarDeliveryMode): string {
  return mode === "auto" ? "Автоматический" : "Полуавтоматический";
}

export function describeStarRules(byStar: AutoRepliesStarRules["byStar"]): string {
  const autoStars = STAR_KEYS.filter((k) => byStar[k] === "auto").map((k) => `${k}★`);
  const confirmStars = STAR_KEYS.filter((k) => byStar[k] === "confirm").map((k) => `${k}★`);

  if (autoStars.length === 0) {
    return "Все отзывы — с вашим подтверждением перед отправкой.";
  }
  if (confirmStars.length === 0) {
    return "Все отзывы отправляются автоматически, где маркетплейс это разрешает.";
  }
  return `${autoStars.join(", ")} — автоматически. ${confirmStars.join(", ")} — с вашим подтверждением.`;
}

export const STAR_RULE_PRESETS: {
  id: string;
  label: string;
  hint: string;
  byStar: AutoRepliesStarRules["byStar"];
}[] = [
  {
    id: "all-confirm",
    label: "Всё с подтверждением",
    hint: "Вы проверяете каждый ответ перед публикацией",
    byStar: defaultStarRulesByUsage("semi"),
  },
  {
    id: "positive-auto",
    label: "Позитив автоматически",
    hint: "4–5★ без вашего шага, остальное — с подтверждением",
    byStar: defaultStarRulesByUsage("auto"),
  },
  {
    id: "all-auto",
    label: "Максимум автомат",
    hint: "Система отправляет сама там, где это разрешено",
    byStar: {
      "1": "auto",
      "2": "auto",
      "3": "auto",
      "4": "auto",
      "5": "auto",
    },
  },
];

export function activePresetId(byStar: AutoRepliesStarRules["byStar"]): string | null {
  for (const preset of STAR_RULE_PRESETS) {
    const match = STAR_KEYS.every((k) => preset.byStar[k] === byStar[k]);
    if (match) return preset.id;
  }
  return null;
}
