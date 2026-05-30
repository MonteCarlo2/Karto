import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "./types";
import {
  defaultStarRulesByUsage,
  deriveUsageFromStarRules,
  normalizeStarRules,
  starRulesForWizardUsage,
} from "./star-rules";
import {
  defaultTemplateSettings,
  normalizeTemplateSettings,
} from "./signature-settings";
import {
  normalizeEmptyReviewSettings,
} from "./empty-review-settings";
import {
  normalizeTrainingSettings,
} from "./training-settings";
import {
  defaultReviewScopeSettings,
  normalizeReviewScopeSettings,
} from "./review-scope-settings";
import {
  defaultAdvancedSettings,
  normalizeAdvancedSettings,
  type LegacyAdvancedSettings,
} from "./restrictions-settings";
import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesSettingsRoot,
  AutoRepliesShopSettings,
  AutoRepliesStyleSettings,
  StylePresetId,
  ToneKind,
} from "./settings-types";

const STORAGE_KEY = "karto-auto-replies-settings-v1";

let suppressLocalSyncHook = false;

function notifySettingsChanged() {
  if (suppressLocalSyncHook || typeof window === "undefined") return;
  void import("./auto-replies-sync").then(({ scheduleAutoRepliesSync }) => {
    scheduleAutoRepliesSync();
  });
}

export const STYLE_PRESET_UI: Record<
  Exclude<StylePresetId, "custom">,
  { title: string; lead: string; apply: Omit<AutoRepliesStyleSettings, "preset"> }
> = {
  warm: {
    title: "Тёплый магазин",
    lead: "Дружелюбно, с благодарностью — для большинства брендов.",
    apply: {
      addressForm: "vy",
      useBuyerName: true,
      mentionProduct: true,
      length: "normal",
      emojis: true,
      thankForPhotos: true,
      deliveryContext: "ignore",
      emptyReviewEnabled: false,
      emptyReviewCustomText: "",
      tonePositive: "warm",
      toneNeutral: "neutral",
      toneNegative: "warm",
    },
  },
  neutral: {
    title: "Спокойно и по делу",
    lead: "Без лишних эмоций, нейтральный тон.",
    apply: {
      addressForm: "vy",
      useBuyerName: false,
      mentionProduct: true,
      length: "auto",
      emojis: false,
      thankForPhotos: true,
      deliveryContext: "ignore",
      emptyReviewEnabled: false,
      emptyReviewCustomText: "",
      tonePositive: "neutral",
      toneNeutral: "neutral",
      toneNegative: "neutral",
    },
  },
  formal: {
    title: "Официальный сервис",
    lead: "Сдержанно, как служба поддержки.",
    apply: {
      addressForm: "vy",
      useBuyerName: false,
      mentionProduct: false,
      length: "normal",
      emojis: false,
      thankForPhotos: false,
      deliveryContext: "ignore",
      emptyReviewEnabled: false,
      emptyReviewCustomText: "",
      tonePositive: "formal",
      toneNeutral: "formal",
      toneNegative: "formal",
    },
  },
};

function defaultShopSettings(): AutoRepliesShopSettings {
  return {
    style: {
      preset: "warm",
      ...STYLE_PRESET_UI.warm.apply,
    },
    templates: defaultTemplateSettings(),
    training: {
      aboutShop: "",
      rulesAndFaq: "",
      documents: [],
      referenceImages: [],
    },
    advanced: defaultAdvancedSettings(),
  };
}

function defaultMarketplaceSettings(usage: AutoRepliesUsageId = "manual"): AutoRepliesMarketplaceSettings {
  return {
    usage,
    starRules: {
      byStar: defaultStarRulesByUsage(usage),
    },
    connection: {
      cabinetEnabled: usage !== "manual",
      apiKey: "",
      status: "disconnected",
    },
    reviewScope: defaultReviewScopeSettings(),
  };
}

function mpKey(shopId: string, mp: AutoRepliesMarketplaceId) {
  return `${shopId}:${mp}`;
}

function readRoot(): AutoRepliesSettingsRoot {
  if (typeof window === "undefined") {
    return { version: 1, shops: {}, marketplaces: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, shops: {}, marketplaces: {} };
    const data = JSON.parse(raw) as AutoRepliesSettingsRoot;
    return {
      version: 1,
      shops: data.shops ?? {},
      marketplaces: data.marketplaces ?? {},
    };
  } catch {
    return { version: 1, shops: {}, marketplaces: {} };
  }
}

function writeRoot(root: AutoRepliesSettingsRoot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    notifySettingsChanged();
  } catch {
    /* noop */
  }
}

export function exportSettingsRoot(): AutoRepliesSettingsRoot {
  return readRoot();
}

export function hydrateSettingsRoot(root: AutoRepliesSettingsRoot) {
  suppressLocalSyncHook = true;
  writeRoot({
    version: 1,
    shops: root.shops ?? {},
    marketplaces: root.marketplaces ?? {},
  });
  suppressLocalSyncHook = false;
}

function normalizeStyleSettings(raw: Partial<AutoRepliesStyleSettings>): AutoRepliesStyleSettings {
  const defaults = defaultShopSettings().style;
  const emptyReview = normalizeEmptyReviewSettings(raw);
  return {
    ...defaults,
    ...raw,
    ...emptyReview,
  };
}

export function getShopSettings(shopId: string): AutoRepliesShopSettings {
  const root = readRoot();
  if (!root.shops[shopId]) {
    root.shops[shopId] = defaultShopSettings();
    writeRoot(root);
    return root.shops[shopId]!;
  }
  const shop = root.shops[shopId]!;
  const legacy = !Array.isArray(shop.templates?.signatures);
  const incomplete = shop.templates.signatures?.some(
    (sig) => sig.enabled === undefined || !sig.createdAt
  );
  const styleNeedsMigration =
    shop.style.emptyReviewEnabled === undefined ||
    shop.style.emptyReviewCustomText === undefined ||
    "emptyReviewTemplate" in shop.style;
  const rawTraining = shop.training as AutoRepliesShopSettings["training"] & {
    negativeGuide?: string;
  };
  const trainingNeedsMigration =
    rawTraining.negativeGuide !== undefined ||
    rawTraining.aboutShop === undefined ||
    rawTraining.rulesAndFaq === undefined ||
    rawTraining.documents === undefined ||
    rawTraining.referenceImages === undefined;
  const rawAdvanced = shop.advanced as LegacyAdvancedSettings;
  const advancedNeedsMigration =
    rawAdvanced.forbiddenWords !== undefined ||
    rawAdvanced.stopWords === undefined ||
    rawAdvanced.minusWords === undefined ||
    rawAdvanced.stopWordsEnabled === undefined ||
    rawAdvanced.minusWordsEnabled === undefined ||
    rawAdvanced.notifyOnNegative !== undefined ||
    rawAdvanced.dailyAnswerLimit !== undefined ||
    rawAdvanced.blockExternalLinks !== undefined ||
    rawAdvanced.avoidUnverifiedPromises !== undefined;
  if (legacy || incomplete || styleNeedsMigration || trainingNeedsMigration || advancedNeedsMigration) {
    root.shops[shopId] = {
      ...shop,
      style: styleNeedsMigration ? normalizeStyleSettings(shop.style) : shop.style,
      training: normalizeTrainingSettings(rawTraining),
      advanced: advancedNeedsMigration ? normalizeAdvancedSettings(rawAdvanced) : shop.advanced,
      templates: legacy || incomplete
        ? normalizeTemplateSettings(
            shop.templates as Parameters<typeof normalizeTemplateSettings>[0]
          )
        : shop.templates,
    };
    writeRoot(root);
  }
  return root.shops[shopId]!;
}

export function getMarketplaceSettings(
  shopId: string,
  mp: AutoRepliesMarketplaceId,
  fallbackUsage: AutoRepliesUsageId = "manual"
): AutoRepliesMarketplaceSettings {
  const root = readRoot();
  const key = mpKey(shopId, mp);
  if (!root.marketplaces[key]) {
    root.marketplaces[key] = defaultMarketplaceSettings(fallbackUsage);
    writeRoot(root);
  }
  const cfg = root.marketplaces[key]!;
  const legacyRules = cfg.starRules as Record<string, unknown>;
  if (!legacyRules.byStar || "negativeAlwaysConfirm" in legacyRules) {
    root.marketplaces[key] = {
      ...cfg,
      starRules: normalizeStarRules(cfg.starRules, cfg.usage),
    };
    writeRoot(root);
  }
  const latest = root.marketplaces[key]!;
  if (!latest.reviewScope) {
    root.marketplaces[key] = {
      ...latest,
      reviewScope: normalizeReviewScopeSettings(undefined),
    };
    writeRoot(root);
  }
  return root.marketplaces[key]!;
}

export function patchShopSettings(
  shopId: string,
  patch: Partial<{
    style: Partial<AutoRepliesShopSettings["style"]>;
    templates: Partial<AutoRepliesShopSettings["templates"]>;
    training: Partial<AutoRepliesShopSettings["training"]>;
    advanced: Partial<AutoRepliesShopSettings["advanced"]>;
  }>
) {
  const root = readRoot();
  const prev = root.shops[shopId] ?? defaultShopSettings();
  root.shops[shopId] = {
    ...prev,
    style: patch.style ? { ...prev.style, ...patch.style } : prev.style,
    templates: patch.templates
      ? { ...prev.templates, ...patch.templates }
      : prev.templates,
    training: patch.training ? { ...prev.training, ...patch.training } : prev.training,
    advanced: patch.advanced ? { ...prev.advanced, ...patch.advanced } : prev.advanced,
  };
  writeRoot(root);
  return root.shops[shopId]!;
}

export function patchMarketplaceSettings(
  shopId: string,
  mp: AutoRepliesMarketplaceId,
  patch: Partial<{
    usage: AutoRepliesUsageId;
    starRules: Partial<AutoRepliesMarketplaceSettings["starRules"]>;
    connection: Partial<AutoRepliesMarketplaceSettings["connection"]>;
    reviewScope: Partial<AutoRepliesMarketplaceSettings["reviewScope"]>;
  }>,
  fallbackUsage: AutoRepliesUsageId = "manual"
) {
  const root = readRoot();
  const key = mpKey(shopId, mp);
  const prev = root.marketplaces[key] ?? defaultMarketplaceSettings(fallbackUsage);
  const usageNext = patch.usage ?? prev.usage;
  const usageExplicitlySet = patch.usage !== undefined;

  const starRulesNext = patch.starRules
    ? normalizeStarRules({ ...prev.starRules, ...patch.starRules }, usageNext)
    : usageExplicitlySet
      ? { byStar: starRulesForWizardUsage(usageNext) }
      : normalizeStarRules(prev.starRules, usageNext);

  const usageDerived =
    usageNext === "manual"
      ? "manual"
      : patch.starRules && patch.usage === undefined
        ? deriveUsageFromStarRules(starRulesNext.byStar)
        : usageNext;

  root.marketplaces[key] = {
    ...prev,
    usage: usageDerived,
    starRules: starRulesNext,
    connection: patch.connection
      ? {
          ...prev.connection,
          ...patch.connection,
          cabinetEnabled:
            patch.connection.cabinetEnabled ??
            (patch.usage !== undefined ? patch.usage !== "manual" : prev.connection.cabinetEnabled),
        }
      : patch.usage !== undefined
        ? {
            ...prev.connection,
            cabinetEnabled: patch.usage !== "manual",
          }
        : prev.connection,
    reviewScope: patch.reviewScope
      ? normalizeReviewScopeSettings({ ...prev.reviewScope, ...patch.reviewScope })
      : normalizeReviewScopeSettings(prev.reviewScope),
  };
  writeRoot(root);
  return root.marketplaces[key]!;
}

export function applyStylePreset(shopId: string, preset: Exclude<StylePresetId, "custom">) {
  const cfg = STYLE_PRESET_UI[preset];
  return patchShopSettings(shopId, {
    style: { preset, ...cfg.apply },
  }).style;
}

export function toneLabel(t: ToneKind) {
  switch (t) {
    case "warm":
      return "Тёплый";
    case "neutral":
      return "Нейтральный";
    case "formal":
      return "Официальный";
  }
}

export function syncMarketplaceUsageFromWizard(
  shopId: string,
  mp: AutoRepliesMarketplaceId,
  usage: AutoRepliesUsageId
) {
  return patchMarketplaceSettings(
    shopId,
    mp,
    {
      usage,
      starRules: { byStar: starRulesForWizardUsage(usage) },
      connection: { cabinetEnabled: usage !== "manual" },
    },
    usage
  );
}

/** Полный сброс настроек площадки — как будто её никогда не добавляли. */
export function resetMarketplaceIntegration(shopId: string, mp: AutoRepliesMarketplaceId) {
  const root = readRoot();
  const key = mpKey(shopId, mp);
  delete root.marketplaces[key];
  writeRoot(root);
}

const SHOP_MP_LIST: AutoRepliesMarketplaceId[] = ["wildberries", "ozon", "yandex"];

/** Площадки, настроенные для конкретного магазина. */
export function deriveConnectedMarketplacesForShop(shopId: string): AutoRepliesMarketplaceId[] {
  const root = readRoot();
  const out: AutoRepliesMarketplaceId[] = [];
  for (const mp of SHOP_MP_LIST) {
    const cfg = root.marketplaces[mpKey(shopId, mp)];
    if (!cfg) continue;
    if (
      cfg.usage !== "manual" ||
      cfg.connection.cabinetEnabled ||
      cfg.connection.status === "active" ||
      cfg.connection.apiKey.trim().length > 0 ||
      Boolean(cfg.connection.clientId?.trim()) ||
      Boolean(cfg.connection.campaignId?.trim())
    ) {
      out.push(mp);
    }
  }
  return out;
}

export function getShopDisplayName(shopId: string, brandFallback?: string | null): string {
  const shop = readRoot().shops[shopId];
  const custom = shop?.displayName?.trim();
  if (custom) return custom;
  if (shopId === "main") {
    const brand = brandFallback?.trim();
    if (brand) return brand;
    return "Мой магазин";
  }
  return "Без названия";
}

/** Гарантирует, что основной магазин есть в настройках и имеет название. */
export function ensureMainShopNamed(brandFallback?: string | null) {
  const root = readRoot();
  if (!root.shops.main) {
    root.shops.main = defaultShopSettings();
  }
  if (!root.shops.main.displayName?.trim()) {
    root.shops.main.displayName =
      brandFallback?.trim() || "Мой магазин";
    writeRoot(root);
  }
}

export function listAutoReplyShops(brandFallback?: string | null): { id: string; name: string }[] {
  const root = readRoot();
  const ids = new Set<string>(Object.keys(root.shops ?? {}));

  for (const key of Object.keys(root.marketplaces ?? {})) {
    const shopId = key.split(":")[0]?.trim();
    if (shopId) ids.add(shopId);
  }

  if (ids.size === 0) {
    ensureMainShopNamed(brandFallback);
    ids.add("main");
  }

  return [...ids]
    .map((id) => ({ id, name: getShopDisplayName(id, brandFallback) }))
    .sort((a, b) => {
      if (a.id === "main") return -1;
      if (b.id === "main") return 1;
      return a.name.localeCompare(b.name, "ru");
    });
}

/** Полностью убирает магазин из локальных настроек. */
export function deleteAutoReplyShopRecord(shopId: string): boolean {
  const root = readRoot();
  let removed = false;

  if (root.shops[shopId]) {
    delete root.shops[shopId];
    removed = true;
  }

  for (const key of Object.keys(root.marketplaces ?? {})) {
    if (key.startsWith(`${shopId}:`)) {
      delete root.marketplaces[key];
      removed = true;
    }
  }

  if (removed) writeRoot(root);
  return removed;
}

/** Создаёт новый магазин с пустыми настройками и тремя слотами площадок. */
export function createAutoReplyShop(displayName: string): { id: string; name: string } {
  const name = displayName.trim();
  if (name.length < 2) {
    throw new Error("Название магазина должно быть не короче 2 символов");
  }

  const id = `shop-${Date.now().toString(36)}`;
  const root = readRoot();
  root.shops[id] = {
    ...defaultShopSettings(),
    displayName: name,
  };
  writeRoot(root);
  return { id, name };
}
