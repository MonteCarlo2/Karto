import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "./types";

const STORAGE_KEY = "karto-auto-replies-workspace-prefs-v1";
const STORAGE_KEY_PREFIX = "karto-auto-replies-workspace-prefs-v1:";
const NAV_SESSION_KEY = "karto-auto-replies-nav-v1";

export function readNavigationSession(): {
  workspaceArea?: WorkspaceAreaId;
  settingsNavKey?: WorkspaceSettingsNavKey;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NAV_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      workspaceArea?: WorkspaceAreaId;
      settingsNavKey?: WorkspaceSettingsNavKey;
    };
    return {
      workspaceArea:
        data.workspaceArea && AREA_SET.has(data.workspaceArea) ? data.workspaceArea : undefined,
      settingsNavKey:
        data.settingsNavKey && NAV_SET.has(data.settingsNavKey) ? data.settingsNavKey : undefined,
    };
  } catch {
    return null;
  }
}

function persistNavigationSession(patch: {
  workspaceArea?: WorkspaceAreaId;
  settingsNavKey?: WorkspaceSettingsNavKey;
}) {
  if (typeof window === "undefined") return;
  try {
    const prev = readNavigationSession() ?? {};
    sessionStorage.setItem(
      NAV_SESSION_KEY,
      JSON.stringify({
        workspaceArea: patch.workspaceArea ?? prev.workspaceArea,
        settingsNavKey: patch.settingsNavKey ?? prev.settingsNavKey,
      })
    );
  } catch {
    /* noop */
  }
}

export type WorkspaceAreaId = "settings" | "inbox" | "analytics" | "integration";

export type WorkspaceSettingsNavKey =
  | "overview"
  | "mode"
  | "integration"
  | "style"
  | "templates"
  | "training"
  | "advanced"
  | "activity";

export type AutoRepliesWorkspacePrefs = {
  /** Активная площадка в панели — её настройки сейчас на экране. */
  marketplace: AutoRepliesMarketplaceId | null;
  /** Все подключённые площадки этого магазина (могут быть все три сразу). */
  connectedMarketplaces: AutoRepliesMarketplaceId[];
  usage: AutoRepliesUsageId | null;
  /** Выбранный магазин в панели. */
  shopId: string;
  /** Раздел workspace: ответы, настройки, анализ, API. */
  workspaceArea?: WorkspaceAreaId;
  /** Вкладка внутри «Основное». */
  settingsNavKey?: WorkspaceSettingsNavKey;
  savedAt: string;
};

const MP_SET = new Set<AutoRepliesMarketplaceId>([
  "ozon",
  "wildberries",
  "yandex",
]);
const USAGE_SET = new Set<AutoRepliesUsageId>(["manual", "semi", "auto"]);
const AREA_SET = new Set<WorkspaceAreaId>(["settings", "inbox", "analytics", "integration"]);
const NAV_SET = new Set<WorkspaceSettingsNavKey>([
  "overview",
  "mode",
  "integration",
  "style",
  "templates",
  "training",
  "advanced",
  "activity",
]);

let activeUserId: string | null = null;

export function setWorkspacePrefsUserId(userId: string | null) {
  activeUserId = userId;
}

function storageKey(userId?: string | null): string {
  const id = userId ?? activeUserId;
  return id ? `${STORAGE_KEY_PREFIX}${id}` : STORAGE_KEY;
}

function notifyPrefsChanged() {
  if (typeof window === "undefined") return;
  void import("./auto-replies-sync").then(({ scheduleAutoRepliesSync }) => {
    scheduleAutoRepliesSync();
  });
}

function readStoredPrefsPartial(userId?: string | null): Partial<AutoRepliesWorkspacePrefs> | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = localStorage.getItem(storageKey(userId));
    if (scoped) return JSON.parse(scoped) as Partial<AutoRepliesWorkspacePrefs>;

    // Legacy sessionStorage / global localStorage
    const legacySession = sessionStorage.getItem(STORAGE_KEY);
    if (legacySession) return JSON.parse(legacySession) as Partial<AutoRepliesWorkspacePrefs>;
    const legacyLocal = localStorage.getItem(STORAGE_KEY);
    if (legacyLocal) return JSON.parse(legacyLocal) as Partial<AutoRepliesWorkspacePrefs>;
    return null;
  } catch {
    return null;
  }
}

function normalizeConnectedMarketplaces(
  ids: AutoRepliesMarketplaceId[] | undefined,
  active: AutoRepliesMarketplaceId | null
): AutoRepliesMarketplaceId[] {
  const out: AutoRepliesMarketplaceId[] = [];
  const add = (id: AutoRepliesMarketplaceId | null | undefined) => {
    if (!id || !MP_SET.has(id) || out.includes(id)) return;
    out.push(id);
  };
  for (const id of ids ?? []) add(id);
  add(active);
  return out;
}

function normalizePrefs(data: Partial<AutoRepliesWorkspacePrefs> | null): AutoRepliesWorkspacePrefs | null {
  if (!data) return null;
  const mp = data.marketplace;
  const us = data.usage;
  const shopId =
    typeof data.shopId === "string" && data.shopId.trim() ? data.shopId.trim() : "main";

  const marketplace =
    typeof mp === "string" && MP_SET.has(mp as AutoRepliesMarketplaceId)
      ? (mp as AutoRepliesMarketplaceId)
      : null;
  const rawConnected = Array.isArray(data.connectedMarketplaces)
    ? data.connectedMarketplaces.filter(
        (id): id is AutoRepliesMarketplaceId =>
          typeof id === "string" && MP_SET.has(id as AutoRepliesMarketplaceId)
      )
    : [];
  const connectedMarketplaces = normalizeConnectedMarketplaces(rawConnected, marketplace);

  return {
    marketplace,
    connectedMarketplaces,
    usage:
      typeof us === "string" && USAGE_SET.has(us as AutoRepliesUsageId)
        ? (us as AutoRepliesUsageId)
        : null,
    shopId,
    workspaceArea:
      typeof data.workspaceArea === "string" && AREA_SET.has(data.workspaceArea as WorkspaceAreaId)
        ? (data.workspaceArea as WorkspaceAreaId)
        : undefined,
    settingsNavKey:
      typeof data.settingsNavKey === "string" &&
      NAV_SET.has(data.settingsNavKey as WorkspaceSettingsNavKey)
        ? (data.settingsNavKey as WorkspaceSettingsNavKey)
        : undefined,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : new Date().toISOString(),
  };
}

export function persistAutoRepliesWorkspacePrefs(patch: {
  marketplace: AutoRepliesMarketplaceId | null;
  usage: AutoRepliesUsageId | null;
  shopId?: string | null;
  connectedMarketplaces?: AutoRepliesMarketplaceId[];
  workspaceArea?: WorkspaceAreaId;
  settingsNavKey?: WorkspaceSettingsNavKey;
}) {
  if (typeof window === "undefined") return;
  try {
    const prev = readStoredPrefsPartial();
    const shopIdNext: string =
      patch.shopId !== undefined
        ? patch.shopId && patch.shopId.trim()
          ? patch.shopId.trim()
          : "main"
        : typeof prev?.shopId === "string" && prev.shopId.trim()
          ? prev.shopId.trim()
          : "main";

    const connectedMarketplaces = normalizeConnectedMarketplaces(
      patch.connectedMarketplaces ?? prev?.connectedMarketplaces,
      patch.marketplace
    );

    const payload: AutoRepliesWorkspacePrefs = {
      marketplace: patch.marketplace,
      connectedMarketplaces,
      usage: patch.usage,
      shopId: shopIdNext,
      workspaceArea:
        patch.workspaceArea ??
        (prev?.workspaceArea && AREA_SET.has(prev.workspaceArea) ? prev.workspaceArea : undefined),
      settingsNavKey:
        patch.settingsNavKey ??
        (prev?.settingsNavKey && NAV_SET.has(prev.settingsNavKey) ? prev.settingsNavKey : undefined),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    persistNavigationSession({
      workspaceArea: payload.workspaceArea,
      settingsNavKey: payload.settingsNavKey,
    });
    notifyPrefsChanged();
  } catch {
    /* noop */
  }
}

export function readAutoRepliesWorkspacePrefs(userId?: string | null): AutoRepliesWorkspacePrefs | null {
  return normalizePrefs(readStoredPrefsPartial(userId));
}

export function exportWorkspacePrefsSnapshot(userId?: string | null): AutoRepliesWorkspacePrefs | null {
  return readAutoRepliesWorkspacePrefs(userId ?? activeUserId);
}

export function hydrateWorkspacePrefs(prefs: AutoRepliesWorkspacePrefs, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
    persistNavigationSession({
      workspaceArea: prefs.workspaceArea,
      settingsNavKey: prefs.settingsNavKey,
    });
  } catch {
    /* noop */
  }
}

/** Убирает площадку из списка подключённых и возвращает обновлённые prefs. */
export function disconnectMarketplaceFromPrefs(
  marketplaceId: AutoRepliesMarketplaceId,
  shopId?: string
): AutoRepliesWorkspacePrefs {
  const prev = readAutoRepliesWorkspacePrefs() ?? {
    marketplace: null,
    connectedMarketplaces: [],
    usage: null,
    shopId: shopId ?? "main",
    savedAt: new Date().toISOString(),
  };

  const connectedMarketplaces = prev.connectedMarketplaces.filter((id) => id !== marketplaceId);
  const marketplace =
    prev.marketplace === marketplaceId ? (connectedMarketplaces[0] ?? null) : prev.marketplace;

  const next: AutoRepliesWorkspacePrefs = {
    marketplace,
    connectedMarketplaces,
    usage: prev.usage,
    shopId: shopId ?? prev.shopId ?? "main",
    savedAt: new Date().toISOString(),
  };

  persistAutoRepliesWorkspacePrefs({
    marketplace: next.marketplace,
    connectedMarketplaces: next.connectedMarketplaces,
    usage: next.usage,
    shopId: next.shopId,
  });

  return next;
}

/** Подписи площадок для панели (без импорта мастера). */
export const AUTO_REPLIES_MARKETPLACE_UI: {
  id: AutoRepliesMarketplaceId;
  title: string;
  short: string;
}[] = [
  { id: "wildberries", title: "Wildberries", short: "WB" },
  { id: "ozon", title: "Ozon", short: "OZ" },
  { id: "yandex", title: "Яндекс Маркет", short: "ЯМ" },
];

export const AUTO_REPLIES_USAGE_UI: Record<
  AutoRepliesUsageId,
  { title: string; lead: string; needsApi: boolean }
> = {
  manual: {
    title: "Только по тексту отзыва",
    lead:
      "Вы вставляете текст отзыва — KARTO предлагает ответ. Кабинет не подключается.",
    needsApi: false,
  },
  semi: {
    title: "Кабинет: вы решаете, когда отправить",
    lead:
      "Отзывы приходят по API; перед публикацией ответа вы каждый раз подтверждаете отправку.",
    needsApi: true,
  },
  auto: {
    title: "Кабинет: всё делает система",
    lead:
      "Где маркетплейс разрешает, ответ может уйти без вашего шага. Нужна связка по API.",
    needsApi: true,
  },
};
