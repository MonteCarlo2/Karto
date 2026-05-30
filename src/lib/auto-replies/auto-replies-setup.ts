import type { AutoRepliesMarketplaceId } from "./types";
import { exportSettingsRoot } from "./settings-store";
import { readAutoRepliesWorkspacePrefs } from "./workspace-prefs";

const MARKETPLACES: AutoRepliesMarketplaceId[] = ["wildberries", "ozon", "yandex"];

/** Есть ли хотя бы одна настроенная площадка — тогда мастер из 3 шагов не нужен. */
export function hasExistingAutoRepliesSetup(shopId = "main"): boolean {
  const prefs = readAutoRepliesWorkspacePrefs();
  if (prefs?.connectedMarketplaces?.length) return true;

  const root = exportSettingsRoot();
  for (const mp of MARKETPLACES) {
    const cfg = root.marketplaces[`${shopId}:${mp}`];
    if (!cfg) continue;
    if (cfg.connection.apiKey.trim()) return true;
    if (cfg.connection.clientId?.trim()) return true;
    if (cfg.connection.campaignId?.trim()) return true;
    if (cfg.connection.status === "active") return true;
    if (cfg.usage !== "manual") return true;
    if (cfg.connection.cabinetEnabled) return true;
  }
  return false;
}
