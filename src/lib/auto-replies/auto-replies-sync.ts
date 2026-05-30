import { createBrowserClient } from "@/lib/supabase/client";
import type { AutoRepliesMarketplaceId } from "./types";
import type { AutoRepliesSettingsRoot } from "./settings-types";
import type { AutoRepliesWorkspacePrefs } from "./workspace-prefs";
import {
  exportSettingsRoot,
  hydrateSettingsRoot,
} from "./settings-store";
import {
  extractApiSecretsFromSettingsRoot,
  extractServerSecretEntriesFromSettingsRoot,
  mergeApiSecretsIntoSettingsRoot,
} from "./settings-sanitize";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import {
  migrateLegacyGlobalSecretsToUser,
  persistSecretsFromSettingsRoot,
  readAutoReplySecrets,
} from "./secrets-store";
import {
  deleteAutoReplyHistoryForMarketplace,
  deleteAutoReplyHistoryForShop,
  deleteAutoReplyInboxSnapshot,
  deleteAutoReplyInboxSnapshotsForShop,
  fetchAutoReplyHistory,
  fetchAutoReplyUserState,
  insertAutoReplyHistoryRow,
  upsertAutoReplyInboxSnapshot,
  upsertAutoReplyUserState,
} from "./auto-replies-supabase-db";
import {
  clearComposeDraft,
  clearComposeDraftsForShop,
  exportComposeDraftsMap,
  exportHistoryRoot,
  hydrateComposeDraftsMap,
  hydrateHistoryRoot,
  removeReplyHistoryForMarketplace,
  removeReplyHistoryForShop,
  type ReplyHistoryEntry,
} from "./reply-history-store";
import {
  disconnectMarketplaceFromPrefs,
  exportWorkspacePrefsSnapshot,
  hydrateWorkspacePrefs,
  setWorkspacePrefsUserId,
} from "./workspace-prefs";
import {
  clearInboxClientCacheForMarketplace,
  clearInboxClientCacheForShop,
} from "./inbox-client-cache";
import {
  deleteAutoReplyShopRecord,
  listAutoReplyShops,
  resetMarketplaceIntegration,
} from "./settings-store";
import { removeAutoReplySecretToken, removeAutoReplySecretsForShop } from "./secrets-store";
import { deleteTrainingImage } from "./training-image-store";
import type { InboxReviewItem } from "./inbox-demo-data";

const LEGACY_SETTINGS_KEY = "karto-auto-replies-settings-v1";

type SyncContext = {
  userId: string;
  email: string | null;
  shopName: string | null;
};

let syncContext: SyncContext | null = null;
let bootstrapComplete = false;
let suppressSync = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;

const MARKETPLACES: AutoRepliesMarketplaceId[] = ["wildberries", "ozon", "yandex"];

export function isAutoRepliesBootstrapComplete(): boolean {
  return bootstrapComplete;
}

export function setAutoRepliesSyncContext(
  userId: string,
  email: string | null,
  shopName?: string | null
) {
  syncContext = { userId, email, shopName: shopName ?? null };
}

export function clearAutoRepliesSyncContext() {
  syncContext = null;
  bootstrapComplete = false;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
}

function readLegacyGlobalSettingsRoot(): AutoRepliesSettingsRoot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoRepliesSettingsRoot;
  } catch {
    return null;
  }
}

function hasMeaningfulSettings(root: AutoRepliesSettingsRoot): boolean {
  return (
    Object.keys(root.shops ?? {}).length > 0 || Object.keys(root.marketplaces ?? {}).length > 0
  );
}

function deriveConnectedFromSettings(
  root: AutoRepliesSettingsRoot,
  shopId: string
): AutoRepliesMarketplaceId[] {
  const out: AutoRepliesMarketplaceId[] = [];
  for (const mp of MARKETPLACES) {
    const cfg = root.marketplaces[`${shopId}:${mp}`];
    if (!cfg) continue;
    if (cfg.usage !== "manual" || cfg.connection.cabinetEnabled || cfg.connection.status === "active") {
      out.push(mp);
    }
  }
  return out;
}

function mergeHistoryEntries(
  local: ReplyHistoryEntry[],
  remote: ReplyHistoryEntry[]
): ReplyHistoryEntry[] {
  const map = new Map<string, ReplyHistoryEntry>();
  for (const entry of [...remote, ...local]) {
    map.set(entry.id, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 300);
}

function mergeSettingsRoots(
  remote: AutoRepliesSettingsRoot,
  local: AutoRepliesSettingsRoot
): AutoRepliesSettingsRoot {
  const shops = { ...remote.shops, ...local.shops };
  const marketplaces = { ...remote.marketplaces, ...local.marketplaces };
  return { version: 1, shops, marketplaces };
}

function mergeWorkspacePrefs(
  remote: AutoRepliesWorkspacePrefs | null,
  local: AutoRepliesWorkspacePrefs | null,
  settings: AutoRepliesSettingsRoot,
  shopId: string
): AutoRepliesWorkspacePrefs {
  const derivedConnected = deriveConnectedFromSettings(settings, shopId);
  const connected = normalizeConnected(
    local?.connectedMarketplaces?.length
      ? local.connectedMarketplaces
      : remote?.connectedMarketplaces?.length
        ? remote.connectedMarketplaces
        : derivedConnected,
    local?.marketplace ?? remote?.marketplace ?? derivedConnected[0] ?? null
  );

  return {
    marketplace: local?.marketplace ?? remote?.marketplace ?? connected[0] ?? null,
    connectedMarketplaces: connected,
    usage: local?.usage ?? remote?.usage ?? null,
    shopId: local?.shopId ?? remote?.shopId ?? shopId,
    workspaceArea: local?.workspaceArea ?? remote?.workspaceArea,
    settingsNavKey: local?.settingsNavKey ?? remote?.settingsNavKey,
    savedAt: new Date().toISOString(),
  };
}

function normalizeConnected(
  ids: AutoRepliesMarketplaceId[],
  active: AutoRepliesMarketplaceId | null
): AutoRepliesMarketplaceId[] {
  const out: AutoRepliesMarketplaceId[] = [];
  const add = (id: AutoRepliesMarketplaceId | null) => {
    if (!id || out.includes(id)) return;
    out.push(id);
  };
  for (const id of ids) add(id);
  add(active);
  return out;
}

function applyHydratedState(params: {
  settings: AutoRepliesSettingsRoot;
  workspacePrefs: AutoRepliesWorkspacePrefs;
  history: ReplyHistoryEntry[];
  composeDrafts?: Record<string, import("./reply-history-store").ComposeDraft>;
  userId: string;
}) {
  suppressSync = true;
  try {
    setWorkspacePrefsUserId(params.userId);
    const secrets = readAutoReplySecrets(params.userId).tokens;
    const mergedSettings = mergeApiSecretsIntoSettingsRoot(params.settings, secrets);
    hydrateSettingsRoot(mergedSettings);
    hydrateWorkspacePrefs(params.workspacePrefs, params.userId);
    hydrateHistoryRoot(params.history);
    if (params.composeDrafts) hydrateComposeDraftsMap(params.composeDrafts);
  } finally {
    suppressSync = false;
  }
}

export async function bootstrapAutoRepliesFromSupabase(
  userId: string,
  email: string | null,
  shopName?: string | null
): Promise<boolean> {
  setAutoRepliesSyncContext(userId, email, shopName);
  bootstrapComplete = false;

  const supabase = createBrowserClient();
  const remote = await fetchAutoReplyUserState(supabase, userId);
  const remoteHistory = await fetchAutoReplyHistory(supabase, userId);

  const legacyRoot = readLegacyGlobalSettingsRoot();
  const legacySecrets = legacyRoot ? extractApiSecretsFromSettingsRoot(legacyRoot) : {};
  migrateLegacyGlobalSecretsToUser(userId, legacySecrets);

  const localRoot = exportSettingsRoot();
  const localPrefs = exportWorkspacePrefsSnapshot(userId);
  const localHistory = exportHistoryRoot().entries;

  if (remote) {
    const remotePrefs = remote.workspace_prefs as AutoRepliesWorkspacePrefs;
    const shopId = remotePrefs?.shopId ?? localPrefs?.shopId ?? remote.shop_id ?? "main";

    const mergedSettings = mergeSettingsRoots(remote.settings_json, localRoot);
    const mergedPrefs = mergeWorkspacePrefs(remotePrefs, localPrefs, mergedSettings, shopId);
    const mergedHistory = mergeHistoryEntries(localHistory, remoteHistory);

    applyHydratedState({
      settings: mergedSettings,
      workspacePrefs: mergedPrefs,
      history: mergedHistory,
      composeDrafts: remote.compose_drafts,
      userId,
    });

    const tokens = extractApiSecretsFromSettingsRoot(exportSettingsRoot());
    persistSecretsFromSettingsRoot(userId, {
      ...readAutoReplySecrets(userId).tokens,
      ...tokens,
    });

    if (legacyRoot && hasMeaningfulSettings(legacyRoot)) {
      await pushAutoRepliesStateToSupabase();
    }
  } else if (hasMeaningfulSettings(localRoot) || localPrefs || localHistory.length > 0) {
    const shopId = localPrefs?.shopId ?? "main";
    const prefs =
      localPrefs ??
      ({
        marketplace: null,
        connectedMarketplaces: deriveConnectedFromSettings(localRoot, shopId),
        usage: null,
        shopId,
        savedAt: new Date().toISOString(),
      } satisfies AutoRepliesWorkspacePrefs);

    applyHydratedState({
      settings: localRoot,
      workspacePrefs: prefs,
      history: localHistory,
      userId,
    });

    const tokens = extractApiSecretsFromSettingsRoot(exportSettingsRoot());
    persistSecretsFromSettingsRoot(userId, {
      ...readAutoReplySecrets(userId).tokens,
      ...tokens,
    });

    await pushAutoRepliesStateToSupabase();
  } else {
    applyHydratedState({
      settings: localRoot,
      workspacePrefs:
        localPrefs ??
        ({
          marketplace: null,
          connectedMarketplaces: [],
          usage: "manual",
          shopId: "main",
          savedAt: new Date().toISOString(),
        } satisfies AutoRepliesWorkspacePrefs),
      history: [],
      userId,
    });
  }

  bootstrapComplete = true;
  return true;
}

async function pushServerMarketplaceSecrets(userId: string, settings: ReturnType<typeof exportSettingsRoot>) {
  const localTokens = readAutoReplySecrets(userId).tokens;
  const entries = extractServerSecretEntriesFromSettingsRoot(settings, localTokens);
  if (entries.length === 0) return;

  void autoRepliesAuthorizedFetch("/api/auto-replies/secrets/sync", {
    method: "POST",
    body: JSON.stringify({ entries }),
    timeoutMs: 15_000,
  }).catch((e) => {
    console.warn("[auto-replies] server secrets sync failed", e);
  });
}

export async function pushAutoRepliesStateToSupabase(): Promise<void> {
  if (!syncContext || suppressSync || !bootstrapComplete) return;

  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    const ctx = syncContext;
    if (!ctx) return;

    const settings = exportSettingsRoot();
    const tokens = extractApiSecretsFromSettingsRoot(settings);
    persistSecretsFromSettingsRoot(ctx.userId, tokens);

    const workspacePrefs = exportWorkspacePrefsSnapshot(ctx.userId);
    const composeDrafts = exportComposeDraftsMap();

    const supabase = createBrowserClient();
    await upsertAutoReplyUserState(supabase, {
      userId: ctx.userId,
      email: ctx.email,
      shopId: workspacePrefs?.shopId ?? "main",
      shopName: ctx.shopName,
      workspacePrefs: workspacePrefs ?? {},
      settings: settings,
      composeDrafts,
    });

    pushServerMarketplaceSecrets(ctx.userId, settings);
  })();

  try {
    await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function scheduleAutoRepliesSync(delayMs = 700) {
  if (!syncContext || suppressSync || !bootstrapComplete) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushAutoRepliesStateToSupabase();
  }, delayMs);
}

export async function syncAutoReplyHistoryEntry(
  entry: ReplyHistoryEntry,
  extra?: { productName?: string | null; buyerLabel?: string | null }
) {
  if (!syncContext || suppressSync) return;
  const supabase = createBrowserClient();
  await insertAutoReplyHistoryRow(supabase, syncContext.userId, entry, extra);
}

export async function syncAutoReplyInboxSnapshot(payload: {
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
  items: InboxReviewItem[];
  sellerName?: string;
  unansweredCount?: number;
}) {
  if (!syncContext || suppressSync || !bootstrapComplete) return;
  const supabase = createBrowserClient();
  await upsertAutoReplyInboxSnapshot(supabase, {
    userId: syncContext.userId,
    ...payload,
  });
}

export function syncApiKeyLocally(userId: string, mpKey: string, apiKey: string) {
  const root = exportSettingsRoot();
  const tokens = extractApiSecretsFromSettingsRoot(root);
  if (apiKey.trim()) tokens[mpKey] = apiKey.trim();
  else delete tokens[mpKey];
  persistSecretsFromSettingsRoot(userId, tokens);

  const cfg = root.marketplaces[mpKey];
  if (cfg) {
    suppressSync = true;
    try {
      hydrateSettingsRoot(
        mergeApiSecretsIntoSettingsRoot(root, {
          ...readAutoReplySecrets(userId).tokens,
          ...tokens,
        })
      );
    } finally {
      suppressSync = false;
    }
  }

  scheduleAutoRepliesSync();
}

export async function disconnectMarketplaceCompletely(params: {
  userId: string;
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId;
}): Promise<AutoRepliesWorkspacePrefs> {
  const mpKey = `${params.shopId}:${params.marketplaceId}`;

  resetMarketplaceIntegration(params.shopId, params.marketplaceId);
  removeAutoReplySecretToken(params.userId, mpKey);
  clearComposeDraft(params.shopId, params.marketplaceId);
  clearInboxClientCacheForMarketplace(params.shopId, params.marketplaceId);
  removeReplyHistoryForMarketplace(params.shopId, params.marketplaceId);

  const nextPrefs = disconnectMarketplaceFromPrefs(params.marketplaceId, params.shopId);

  const supabase = createBrowserClient();
  await deleteAutoReplyInboxSnapshot(supabase, {
    userId: params.userId,
    shopId: params.shopId,
    marketplaceId: params.marketplaceId,
  });
  await deleteAutoReplyHistoryForMarketplace(supabase, {
    userId: params.userId,
    shopId: params.shopId,
    marketplaceId: params.marketplaceId,
  });

  await pushAutoRepliesStateToSupabase();
  return nextPrefs;
}

export async function deleteAutoReplyShopCompletely(params: {
  userId: string;
  shopId: string;
}): Promise<{ nextShopId: string }> {
  const root = exportSettingsRoot();
  const trainingImages = root.shops[params.shopId]?.training?.referenceImages ?? [];

  for (const mp of MARKETPLACES) {
    clearComposeDraft(params.shopId, mp);
    clearInboxClientCacheForMarketplace(params.shopId, mp);
    resetMarketplaceIntegration(params.shopId, mp);
  }

  clearComposeDraftsForShop(params.shopId);
  clearInboxClientCacheForShop(params.shopId);
  removeReplyHistoryForShop(params.shopId);
  removeAutoReplySecretsForShop(params.userId, params.shopId);
  deleteAutoReplyShopRecord(params.shopId);

  for (const img of trainingImages) {
    await deleteTrainingImage(params.shopId, img.id).catch(() => undefined);
  }

  const supabase = createBrowserClient();
  await deleteAutoReplyInboxSnapshotsForShop(supabase, {
    userId: params.userId,
    shopId: params.shopId,
  });
  await deleteAutoReplyHistoryForShop(supabase, {
    userId: params.userId,
    shopId: params.shopId,
  });

  await pushAutoRepliesStateToSupabase();

  const remaining = listAutoReplyShops();
  const nextShopId = remaining.find((s) => s.id !== params.shopId)?.id ?? remaining[0]?.id ?? "main";
  return { nextShopId };
}
