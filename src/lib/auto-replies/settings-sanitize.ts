import type {
  AutoRepliesMarketplaceSettings,
  AutoRepliesSettingsRoot,
} from "./settings-types";
import type { AutoRepliesMarketplaceId } from "./types";

export type AutoReplyServerSecretEntry = {
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  apiKey: string;
  clientId?: string | null;
  campaignId?: string | null;
  businessId?: string | null;
};

/** Убирает API-токены перед записью в Supabase. Client ID / Campaign ID сохраняем. */
export function stripApiSecretsFromSettingsRoot(
  root: AutoRepliesSettingsRoot
): AutoRepliesSettingsRoot {
  const marketplaces: AutoRepliesSettingsRoot["marketplaces"] = {};

  for (const [key, cfg] of Object.entries(root.marketplaces ?? {})) {
    marketplaces[key] = {
      ...cfg,
      connection: {
        ...cfg.connection,
        apiKey: "",
      },
    };
  }

  return {
    version: 1,
    shops: { ...(root.shops ?? {}) },
    marketplaces,
  };
}

export function extractApiSecretsFromSettingsRoot(
  root: AutoRepliesSettingsRoot
): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, cfg] of Object.entries(root.marketplaces ?? {})) {
    const token = cfg.connection.apiKey?.trim();
    if (token) secrets[key] = token;
  }
  return secrets;
}

/** Секреты для server-side cron: mpKey → shopId + marketplace + доп. поля Ozon/Yandex. */
export function extractServerSecretEntriesFromSettingsRoot(
  root: AutoRepliesSettingsRoot,
  tokenOverrides?: Record<string, string>
): AutoReplyServerSecretEntry[] {
  const entries: AutoReplyServerSecretEntry[] = [];

  for (const [mpKey, cfg] of Object.entries(root.marketplaces ?? {})) {
    const idx = mpKey.indexOf(":");
    if (idx <= 0) continue;

    const shopId = mpKey.slice(0, idx);
    const marketplaceId = mpKey.slice(idx + 1) as AutoRepliesMarketplaceId;
    if (marketplaceId !== "wildberries" && marketplaceId !== "ozon" && marketplaceId !== "yandex") {
      continue;
    }

    const apiKey = (tokenOverrides?.[mpKey] ?? cfg.connection.apiKey ?? "").trim();
    if (!apiKey) continue;

    entries.push({
      shopId,
      marketplaceId,
      apiKey,
      clientId: cfg.connection.clientId ?? null,
      campaignId: cfg.connection.campaignId ?? null,
      businessId: cfg.connection.businessId ?? null,
    });
  }

  return entries;
}

export function mergeApiSecretsIntoSettingsRoot(
  root: AutoRepliesSettingsRoot,
  secrets: Record<string, string>
): AutoRepliesSettingsRoot {
  const marketplaces: Record<string, AutoRepliesMarketplaceSettings> = {
    ...(root.marketplaces ?? {}),
  };

  for (const [key, token] of Object.entries(secrets)) {
    const prev = marketplaces[key];
    if (!prev || !token.trim()) continue;
    marketplaces[key] = {
      ...prev,
      connection: {
        ...prev.connection,
        apiKey: token.trim(),
      },
    };
  }

  return {
    version: 1,
    shops: { ...(root.shops ?? {}) },
    marketplaces,
  };
}

/** Дополнительная защита: вычищаем apiKey даже если попал в JSON. */
export function sanitizeSettingsJsonForSupabase(raw: unknown): AutoRepliesSettingsRoot {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as AutoRepliesSettingsRoot)
      : ({ version: 1, shops: {}, marketplaces: {} } as AutoRepliesSettingsRoot);

  return stripApiSecretsFromSettingsRoot({
    version: 1,
    shops: base.shops ?? {},
    marketplaces: base.marketplaces ?? {},
  });
}
