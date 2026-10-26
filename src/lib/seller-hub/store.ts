import type { SellerHubAreaId } from "./nav";
import type {
  SellerCatalogSnapshot,
  SellerHubConnection,
  SellerHubMarketplaceId,
} from "./types";

const ROOT_PREFIX = "karto-seller-hub-v1:";

export type SellerHubRoot = {
  version: 1;
  activeMarketplace: SellerHubMarketplaceId;
  activeArea: SellerHubAreaId;
  connections: Partial<Record<SellerHubMarketplaceId, SellerHubConnection>>;
  catalogs: Partial<Record<SellerHubMarketplaceId, SellerCatalogSnapshot>>;
  updatedAt: string;
};

function storageKey(userId: string): string {
  return `${ROOT_PREFIX}${userId}`;
}

function emptyRoot(): SellerHubRoot {
  return {
    version: 1,
    activeMarketplace: "wildberries",
    activeArea: "overview",
    connections: {},
    catalogs: {},
    updatedAt: new Date().toISOString(),
  };
}

export function readSellerHubRoot(userId: string): SellerHubRoot {
  if (typeof window === "undefined" || !userId) return emptyRoot();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyRoot();
    const parsed = JSON.parse(raw) as SellerHubRoot;
    return {
      version: 1,
      activeMarketplace: parsed.activeMarketplace ?? "wildberries",
      activeArea: parsed.activeArea ?? "overview",
      connections: parsed.connections ?? {},
      catalogs: parsed.catalogs ?? {},
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return emptyRoot();
  }
}

export function writeSellerHubRoot(userId: string, root: SellerHubRoot) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        ...root,
        version: 1,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* quota */
  }
}

export function patchSellerHubConnection(
  userId: string,
  marketplaceId: SellerHubMarketplaceId,
  patch: Partial<SellerHubConnection>
): SellerHubRoot {
  const root = readSellerHubRoot(userId);
  const prev = root.connections[marketplaceId];
  root.connections[marketplaceId] = {
    marketplaceId,
    apiKey: "",
    status: "idle",
    ...prev,
    ...patch,
    // WB-токен живёт на сервере; черновик из поля ввода в снимок кабинета не пишем.
    ...(marketplaceId === "wildberries" ? { apiKey: "" } : {}),
  };
  writeSellerHubRoot(userId, root);
  return root;
}

export function saveSellerHubCatalog(
  userId: string,
  snapshot: SellerCatalogSnapshot
): SellerHubRoot {
  const root = readSellerHubRoot(userId);
  root.catalogs[snapshot.marketplaceId] = snapshot;
  const conn = root.connections[snapshot.marketplaceId];
  if (conn) {
    root.connections[snapshot.marketplaceId] = {
      ...conn,
      catalogCount: snapshot.totalCount,
      lastSyncAt: snapshot.syncedAt,
    };
  }
  writeSellerHubRoot(userId, root);
  return root;
}

export function setSellerHubActiveMarketplace(
  userId: string,
  marketplaceId: SellerHubMarketplaceId
): SellerHubRoot {
  const root = readSellerHubRoot(userId);
  root.activeMarketplace = marketplaceId;
  writeSellerHubRoot(userId, root);
  return root;
}

export function setSellerHubActiveArea(userId: string, area: SellerHubAreaId): SellerHubRoot {
  const root = readSellerHubRoot(userId);
  root.activeArea = area;
  writeSellerHubRoot(userId, root);
  return root;
}
