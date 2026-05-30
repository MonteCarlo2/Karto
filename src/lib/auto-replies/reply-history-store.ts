import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "./types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings, StarKey } from "./settings-types";
import { reviewScopeModeLabel } from "./review-scope-settings";
import { formatSignatureStars } from "./signature-settings";
import { STYLE_PRESET_UI } from "./settings-store";

const HISTORY_KEY = "karto-auto-replies-history-v1";
const DRAFT_PREFIX = "karto-auto-replies-compose-draft:";
const MAX_HISTORY = 300;

export type ReplyGenerationSource = "openrouter" | "openrouter-dual" | "openrouter-writer" | "local";

export type ReplyHistoryEntry = {
  id: string;
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  usageMode: AutoRepliesUsageId;
  usageModeLabel: string;
  starRating: StarKey;
  reviewText: string;
  replyText: string;
  generationSource: ReplyGenerationSource;
  createdAt: string;
};

export type ComposeDraft = {
  reviewText: string;
  starRating: StarKey;
  replyText: string;
  revisionHint: string;
  updatedAt: string;
};

export function usageModeLabel(usage: AutoRepliesUsageId): string {
  switch (usage) {
    case "manual":
      return "Ручной режим";
    case "semi":
      return "Полуавтомат";
    case "auto":
      return "Автомат";
  }
}

function draftKey(shopId: string, marketplaceId: AutoRepliesMarketplaceId) {
  return `${DRAFT_PREFIX}${shopId}:${marketplaceId}`;
}

export function readComposeDraft(
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
): ComposeDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(shopId, marketplaceId));
    if (!raw) return null;
    return JSON.parse(raw) as ComposeDraft;
  } catch {
    return null;
  }
}

export function persistComposeDraft(
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId,
  draft: ComposeDraft
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(draftKey(shopId, marketplaceId), JSON.stringify(draft));
    void import("./auto-replies-sync").then(({ scheduleAutoRepliesSync }) => {
      scheduleAutoRepliesSync();
    });
  } catch {
    /* noop */
  }
}

export function clearComposeDraft(shopId: string, marketplaceId: AutoRepliesMarketplaceId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftKey(shopId, marketplaceId));
    void import("./auto-replies-sync").then(({ scheduleAutoRepliesSync }) => {
      scheduleAutoRepliesSync();
    });
  } catch {
    /* noop */
  }
}

export function removeReplyHistoryForMarketplace(
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
) {
  const root = readHistoryRoot();
  root.entries = root.entries.filter(
    (entry) => !(entry.shopId === shopId && entry.marketplaceId === marketplaceId)
  );
  writeHistoryRoot(root);
}

export function removeReplyHistoryForShop(shopId: string) {
  const root = readHistoryRoot();
  root.entries = root.entries.filter((entry) => entry.shopId !== shopId);
  writeHistoryRoot(root);
}

export function clearComposeDraftsForShop(shopId: string) {
  if (typeof window === "undefined") return;
  const prefix = `${DRAFT_PREFIX}${shopId}:`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
    void import("./auto-replies-sync").then(({ scheduleAutoRepliesSync }) => {
      scheduleAutoRepliesSync();
    });
  } catch {
    /* noop */
  }
}

type HistoryRoot = { version: 1; entries: ReplyHistoryEntry[] };

function readHistoryRoot(): HistoryRoot {
  if (typeof window === "undefined") return { version: 1, entries: [] };
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { version: 1, entries: [] };
    const data = JSON.parse(raw) as HistoryRoot;
    return { version: 1, entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeHistoryRoot(root: HistoryRoot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(root));
  } catch {
    /* noop */
  }
}

export function exportHistoryRoot(): HistoryRoot {
  return readHistoryRoot();
}

export function hydrateHistoryRoot(entries: ReplyHistoryEntry[]) {
  writeHistoryRoot({ version: 1, entries: entries.slice(0, MAX_HISTORY) });
}

export function hydrateComposeDraftsMap(drafts: Record<string, ComposeDraft>) {
  if (typeof window === "undefined") return;
  for (const [key, draft] of Object.entries(drafts)) {
    try {
      localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(draft));
    } catch {
      /* noop */
    }
  }
}

export function exportComposeDraftsMap(): Record<string, ComposeDraft> {
  if (typeof window === "undefined") return {};
  const out: Record<string, ComposeDraft> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const suffix = key.slice(DRAFT_PREFIX.length);
      out[suffix] = JSON.parse(raw) as ComposeDraft;
    }
  } catch {
    /* noop */
  }
  return out;
}

export function listReplyHistory(
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
): ReplyHistoryEntry[] {
  return readHistoryRoot()
    .entries.filter((e) => e.shopId === shopId && e.marketplaceId === marketplaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function appendReplyHistory(entry: Omit<ReplyHistoryEntry, "id" | "createdAt">) {
  const root = readHistoryRoot();
  const next: ReplyHistoryEntry = {
    ...entry,
    id: createHistoryId(),
    createdAt: new Date().toISOString(),
  };
  root.entries = [next, ...root.entries].slice(0, MAX_HISTORY);
  writeHistoryRoot(root);

  void import("./auto-replies-sync").then(({ syncAutoReplyHistoryEntry }) => {
    void syncAutoReplyHistoryEntry(next);
  });

  return next;
}

function createHistoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatHistoryWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Полный снимок настроек для промпта модели — каждое поле явно. */
export function buildSettingsSnapshotForPrompt(input: {
  shop: AutoRepliesShopSettings;
  mp: AutoRepliesMarketplaceSettings;
  brandName?: string | null;
  starRating: StarKey;
  reviewText?: string;
}) {
  const { shop, mp, brandName, starRating, reviewText = "" } = input;
  const style = shop.style;
  const presetTitle =
    style.preset !== "custom" && style.preset in STYLE_PRESET_UI
      ? STYLE_PRESET_UI[style.preset as keyof typeof STYLE_PRESET_UI].title
      : "Свой стиль";

  const deliveryContextRu =
    style.deliveryContext === "marketplace"
      ? "упоминать доставку маркетплейса"
      : style.deliveryContext === "seller"
        ? "упоминать доставку продавца"
        : "не акцентировать доставку";

  const activeSignatures = shop.templates.signatures
    .filter((s) => s.enabled !== false && s.text.trim())
    .map((s) => ({
      text: s.text,
      stars: formatSignatureStars(s.starRatings),
    }));

  const trainingDocs = shop.training.documents
    .filter((d) => d.status === "ready" && d.extractedText.trim())
    .map((d) => ({ name: d.name, kind: d.kind, chars: d.charCount }));

  const refImages = shop.training.referenceImages.map((img) => img.name);

  const review = reviewText.trim();
  const isManual = mp.usage === "manual";
  const mentionsProduct = /товар|заказ|покупк|артикул|модел|размер|цвет|упаковк|доставк/i.test(review);
  const mentionsPhotos = /фото|снимок|картинк|изображен/i.test(review);

  return {
    brandName: brandName?.trim() || null,
    usageMode: mp.usage,
    usageModeLabel: usageModeLabel(mp.usage),
    starRating,
    starDeliveryMode: mp.starRules.byStar[starRating],
    reviewScope: {
      mode: reviewScopeModeLabel(mp.reviewScope.mode),
      limit: mp.reviewScope.limit,
      newSince: mp.reviewScope.newSince,
      limitConsumed: mp.reviewScope.limitConsumed,
    },
    style: {
      preset: style.preset,
      presetTitle,
      addressForm: style.addressForm === "vy" ? "вы" : "ты",
      useBuyerName: style.useBuyerName,
      mentionProduct: style.mentionProduct,
      length: style.length,
      emojis: style.emojis,
      thankForPhotos: style.thankForPhotos,
      deliveryContext: style.deliveryContext,
      deliveryContextRu,
      emptyReviewEnabled: style.emptyReviewEnabled,
      emptyReviewCustomText: style.emptyReviewCustomText,
      tonePositive: style.tonePositive,
      toneNeutral: style.toneNeutral,
      toneNegative: style.toneNegative,
    },
    templates: {
      signaturesEnabled: shop.templates.signaturesEnabled,
      rotationMode: shop.templates.rotationMode,
      signatures: activeSignatures,
    },
    training: {
      aboutShop: shop.training.aboutShop,
      rulesAndFaq: shop.training.rulesAndFaq,
      documents: trainingDocs,
      referenceImages: refImages,
    },
    advanced: {
      stopWordsEnabled: shop.advanced.stopWordsEnabled,
      stopWords: shop.advanced.stopWords,
      minusWordsEnabled: shop.advanced.minusWordsEnabled,
      minusWords: shop.advanced.minusWords,
    },
    manualModeAppliedSettings: isManual
      ? {
          useBuyerName: false,
          mentionProduct: style.mentionProduct && mentionsProduct,
          thankForPhotos: style.thankForPhotos && mentionsPhotos,
          note:
            "В ручном режиме имя покупателя недоступно; товар и фото учитываются только если упомянуты в тексте отзыва.",
        }
      : null,
  };
}
